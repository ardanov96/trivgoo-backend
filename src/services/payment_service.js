// src/services/payment_service.js
// DOKU Jokul (non-SNAP) + Xendit support
// Credentials dibaca dari DB (payment_settings)

const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../configs/db');

// ─── Helpers ────────────────────────────────────────────────────────────────

function getTimestampUTC() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function generateJokulDigest(bodyString) {
  const raw = crypto.createHash('sha256').update(bodyString, 'utf-8').digest();
  return Buffer.from(raw).toString('base64');
}

function generateJokulSignature(clientId, requestId, timestamp, requestTarget, digest, secretKey) {
  let component = 'Client-Id:' + clientId;
  component += '\nRequest-Id:' + requestId;
  component += '\nRequest-Timestamp:' + timestamp;
  component += '\nRequest-Target:' + requestTarget;
  if (digest) component += '\nDigest:' + digest;

  const hmacRaw = crypto.createHmac('sha256', secretKey).update(component).digest();
  return 'HMACSHA256=' + Buffer.from(hmacRaw).toString('base64');
}

/**
 * Sanitize string agar hanya mengandung karakter yang diizinkan DOKU:
 * a-z A-Z 0-9 . - / + , = _ : ' @ %
 * Karakter lain (termasuk tanda kurung, koma unicode, dll) akan diganti spasi lalu di-trim.
 */
function sanitizeDokuString(str, maxLength = 255) {
  if (!str) return '-';
  return str
    .normalize('NFD')                        // decompose unicode (é → e + ´)
    .replace(/[\u0300-\u036f]/g, '')         // hapus combining marks (aksen)
    .replace(/[^a-zA-Z0-9.\-\/+,=_:'@% ]/g, ' ') // ganti karakter tidak valid dgn spasi
    .replace(/\s+/g, ' ')                    // collapse multiple spasi
    .trim()
    .substring(0, maxLength);
}

// ─── DB Config ───────────────────────────────────────────────────────────────

async function getActiveGatewayConfig() {
  let rows;
  try {
    [rows] = await db.query('SELECT * FROM payment_settings WHERE is_active = 1 LIMIT 1');
  } catch (e) {
    [rows] = await db.query('SELECT * FROM payment_settings LIMIT 1');
  }

  if (!rows || rows.length === 0)
    throw new Error('Payment settings tidak ditemukan. Konfigurasi di Admin -> Payment Settings.');

  const s = rows[0];
  const gateway = s.selected_gateway;

  if (gateway === 'doku') {
    const clientId = s.doku_client_id || process.env.DOKU_CLIENT_ID;
    const secretKey = s.doku_secret_key || process.env.DOKU_SECRET_KEY;
    const isProduction = process.env.NODE_ENV === 'production';
    const baseUrl = isProduction
      ? 'https://api.doku.com'
      : (process.env.DOKU_BASE_URL || 'https://api-sandbox.doku.com');

    if (!clientId || !secretKey)
      throw new Error('DOKU credentials belum dikonfigurasi di Admin -> Payment Settings.');

    return { gateway: 'doku', clientId, secretKey, baseUrl, settings: s };
  }

  if (gateway === 'xendit') {
    const secretKey = s.xendit_secret_key || process.env.XENDIT_SECRET_KEY;
    if (!secretKey) throw new Error('Xendit Secret Key belum dikonfigurasi.');
    return { gateway: 'xendit', secretKey, settings: s };
  }

  throw new Error('Gateway tidak dikenali: ' + gateway);
}

// ─── DOKU Jokul Checkout ─────────────────────────────────────────────────────

async function createDokuTransaction(order, config) {
  const { clientId, secretKey, baseUrl } = config;

  // MOCK mode
  if (process.env.DOKU_MOCK === 'true') {
    console.log('[DOKU MOCK] Returning fake payment URL');
    await new Promise(r => setTimeout(r, 300));
    const paymentDueMock = 1440;
    const expiredAtMock = new Date(Date.now() + paymentDueMock * 60 * 1000).toISOString();
    return {
      payment_url: (process.env.FRONTEND_URL || 'http://localhost:3000') +
        '/payment/result?invoice=' + order.id + '&status=SUCCESS&mock=true',
      invoice_number: order.id,
      expired_at: expiredAtMock,
    };
  }

  const amount = Math.round(Number(order.amount));
  if (isNaN(amount) || amount <= 0)
    throw new Error('Amount tidak valid: ' + order.amount);

  const requestId = uuidv4();
  const timestamp = getTimestampUTC();
  const requestTarget = '/checkout/v1/payment';
  const frontendBase = process.env.FRONTEND_URL || 'http://localhost:3000';
  const callbackUrl = frontendBase + '/payment/result';

  const paymentDueMinutes = 1440; // 24 jam
  const expiredAt = new Date(Date.now() + paymentDueMinutes * 60 * 1000).toISOString();

  const safeProductName = sanitizeDokuString(order.product_name || 'Trivgoo Booking');
  const safeCustomerName = sanitizeDokuString(order.name || 'Customer');

  const requestBody = {
    order: {
      amount,
      invoice_number: order.id,
      currency: 'IDR',
      callback_url: callbackUrl,
      line_items: [{
        name: `${safeProductName} - x${Number(order.quantity) || 1}`,
        price: amount,
        quantity: 1,
      }]
    },
    payment: { payment_due_date: paymentDueMinutes },
    customer: {
      name: safeCustomerName,
      email: order.email || 'customer@example.com',
    }
  };

  const bodyString = JSON.stringify(requestBody);
  const digest = generateJokulDigest(bodyString);
  const signature = generateJokulSignature(clientId, requestId, timestamp, requestTarget, digest, secretKey);

  console.log('[DOKU Jokul] Creating checkout:', {
    invoice_number: order.id,
    amount,
    product_name: safeProductName,
    customer_name: safeCustomerName,
    requestId,
  });

  try {
    const response = await axios.post(baseUrl + requestTarget, requestBody, {
      headers: {
        'Client-Id': clientId,
        'Request-Id': requestId,
        'Request-Timestamp': timestamp,
        'Signature': signature,
        'Content-Type': 'application/json'
      }
    });

    const paymentUrl = response.data?.response?.payment?.url ||
      response.data?.payment?.url ||
      response.data?.url;

    if (!paymentUrl)
      throw new Error('DOKU tidak mengembalikan payment URL: ' + JSON.stringify(response.data));

    console.log('[DOKU Jokul] ✅ Checkout created:', order.id, '->', paymentUrl, '| expires:', expiredAt);

    return {
      payment_url: paymentUrl,
      invoice_number: order.id,
      expired_at: expiredAt,
      request_id: requestId,
    };

  } catch (err) {
    if (err.response) {
      const e = err.response.data;
      console.error('[DOKU Jokul] ❌ Error:', err.response.status, JSON.stringify(e));
      throw new Error('[DOKU ' + err.response.status + '] ' + (e?.error?.message || e?.message || JSON.stringify(e)));
    }
    throw new Error('Gagal terhubung ke DOKU: ' + err.message);
  }
}

// ─── Xendit Invoice ──────────────────────────────────────────────────────────

async function createXenditTransaction(order, config) {
  const { secretKey } = config;
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const amount = Math.round(Number(order.amount));

  if (isNaN(amount) || amount <= 0)
    throw new Error('Amount tidak valid: ' + order.amount);

  const requestBody = {
    external_id: order.id,
    amount,
    payer_email: order.email || 'customer@example.com',
    description: order.product_name || 'Trivgoo Booking',
    currency: 'IDR',
    invoice_duration: 86400, // 24 jam
    success_redirect_url: frontendUrl + '/payment/result?status=SUCCESS',
    failure_redirect_url: frontendUrl + '/payment/result?status=FAILED'
  };

  console.log('[Xendit] Creating invoice:', { external_id: order.id, amount });

  try {
    const response = await axios.post('https://api.xendit.co/v2/invoices', requestBody, {
      auth: { username: secretKey, password: '' },
      headers: { 'Content-Type': 'application/json' }
    });

    const paymentUrl = response.data?.invoice_url;
    if (!paymentUrl)
      throw new Error('Xendit tidak mengembalikan invoice URL: ' + JSON.stringify(response.data));

    console.log('[Xendit] ✅ Invoice created:', order.id);
    return { payment_url: paymentUrl, invoice_number: order.id };

  } catch (err) {
    if (err.response) {
      const e = err.response.data;
      throw new Error('[Xendit ' + err.response.status + '] ' + (e?.message || JSON.stringify(e)));
    }
    throw new Error('Gagal terhubung ke Xendit: ' + err.message);
  }
}

// ─── Main createTransaction ───────────────────────────────────────────────────

const createTransaction = async (order) => {
  const config = await getActiveGatewayConfig();
  console.log('[Payment] Using gateway:', config.gateway);

  if (config.gateway === 'doku') return createDokuTransaction(order, config);
  if (config.gateway === 'xendit') return createXenditTransaction(order, config);

  throw new Error('Gateway tidak didukung: ' + config.gateway);
};

// ─── Cancel Transaction ───────────────────────────────────────────────────────

const cancelTransaction = async (invoiceNumber, originalRequestId = null) => {
  try {
    const config = await getActiveGatewayConfig();
    console.log('[Payment Cancel] Attempting to cancel invoice:', invoiceNumber, 'on', config.gateway);

    if (config.gateway === 'xendit') {
      await axios.post(`https://api.xendit.co/v2/invoices/${invoiceNumber}/expire!`, {}, {
        auth: { username: config.secretKey, password: '' }
      });
      console.log('[Xendit] ✅ Invoice expired:', invoiceNumber);
      return true;
    }

    if (config.gateway === 'doku') {
      const { clientId, secretKey, baseUrl } = config;
      const requestTarget = '/checkout/v3/cancellations';
      const requestId = uuidv4();
      const timestamp = getTimestampUTC();

      const requestBody = {
        client: { id: clientId },
        order: { invoice_number: invoiceNumber },
        payment: { original_request_id: originalRequestId || invoiceNumber },
        cancel: { reason: 'RESTOCK' },
        note: 'Pembatalan pesanan dari Trivgoo'
      };

      const bodyString = JSON.stringify(requestBody);
      const digest = generateJokulDigest(bodyString);
      const signature = generateJokulSignature(clientId, requestId, timestamp, requestTarget, digest, secretKey);

      try {
        await axios.post(baseUrl + requestTarget, requestBody, {
          headers: {
            'Client-Id': clientId,
            'Request-Id': requestId,
            'Request-Timestamp': timestamp,
            'Signature': signature,
            'Content-Type': 'application/json'
          }
        });
        console.log('[DOKU] ✅ Tagihan berhasil dibatalkan di DOKU:', invoiceNumber);
      } catch (err) {
        console.error('[DOKU] ⚠️ Gagal memanggil endpoint cancellations:', err?.response?.data || err?.message);
      }
      return true;
    }

    return false;
  } catch (error) {
    console.error('[Payment Cancel] Gagal membatalkan di gateway:', error.message);
    return false;
  }
};

// ─── Webhook Handler ─────────────────────────────────────────────────────────

const handleNotification = async (notification, headers = {}) => {
  const config = await getActiveGatewayConfig();

  if (config.gateway === 'doku') {
    const { clientId, secretKey } = config;

    const incomingSignature = headers['signature'] || headers['Signature'] || '';
    const requestId = headers['request-id'] || headers['Request-Id'] || '';
    const timestamp = headers['request-timestamp'] || headers['Request-Timestamp'] || '';
    const notifPath = '/api/v1/payment/notification';

    const bodyString = JSON.stringify(notification);
    const digest = generateJokulDigest(bodyString);
    const expectedSignature = generateJokulSignature(clientId, requestId, timestamp, notifPath, digest, secretKey);

    if (process.env.NODE_ENV === 'production' && incomingSignature !== expectedSignature) {
      throw new Error('Invalid DOKU webhook signature');
    }

    const transactionStatus = notification?.transaction?.status ||
      notification?.service?.status || 'UNKNOWN';
    const invoiceNumber = notification?.order?.invoice_number ||
      notification?.invoice_number || '';

    if (!invoiceNumber) throw new Error('invoice_number tidak ditemukan di webhook payload');

    return { transaction_status: transactionStatus, invoice_number: invoiceNumber };
  }

  if (config.gateway === 'xendit') {
    const callbackToken = headers['x-callback-token'] || '';
    const expectedToken = process.env.XENDIT_WEBHOOK_TOKEN ||
      config.settings?.xendit_webhook_secret || '';

    if (process.env.NODE_ENV === 'production' && callbackToken !== expectedToken) {
      throw new Error('Invalid Xendit webhook token');
    }

    const status = notification?.status || 'UNKNOWN';
    const invoiceNumber = notification?.external_id || '';

    if (!invoiceNumber) throw new Error('external_id tidak ditemukan di webhook payload');

    return { transaction_status: status, invoice_number: invoiceNumber };
  }

  throw new Error('Gateway tidak didukung untuk webhook: ' + config.gateway);
};

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  createTransaction,
  cancelTransaction,
  handleNotification,
  getActiveGatewayConfig,
  getTimestampUTC,
  generateJokulSignature,
  generateJokulDigest,
};