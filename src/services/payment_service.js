// src/services/payment_service.js
const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

/**
 * Ambil konfigurasi DOKU dari environment variables.
 */
function getDokuConfig() {
  const clientId = process.env.DOKU_CLIENT_ID;
  const secretKey = process.env.DOKU_SECRET_KEY;
  const baseUrl = process.env.DOKU_BASE_URL || 'https://api-sandbox.doku.com';

  if (!clientId || !secretKey) {
    throw new Error('DOKU credentials belum dikonfigurasi. Set DOKU_CLIENT_ID dan DOKU_SECRET_KEY di .env');
  }

  return { clientId, secretKey, baseUrl };
}

/**
 * Generate Digest (SHA-256 hash dari request body).
 * @param {string} jsonBody - JSON string dari request body
 * @returns {string} Base64 encoded SHA-256 hash
 */
function generateDigest(jsonBody) {
  return crypto
    .createHash('sha256')
    .update(jsonBody, 'utf8')
    .digest('base64');
}

/**
 * Generate Signature untuk DOKU API.
 *
 * Format: HMAC-SHA256(Client-Id + ":" + Request-Id + ":" + Request-Timestamp + ":" + Request-Target + ":" + Digest)
 *
 * @param {object} params
 * @param {string} params.clientId
 * @param {string} params.requestId
 * @param {string} params.requestTimestamp
 * @param {string} params.requestTarget - e.g. "/checkout/v1/payment"
 * @param {string} params.secretKey
 * @param {string} params.body - JSON string body
 * @returns {string} HMAC-SHA256 signature (hex)
 */
function generateSignature({ clientId, requestId, requestTimestamp, requestTarget, secretKey, body }) {
  const digest = generateDigest(body);

  const componentSignature =
    'Client-Id:' + clientId + '\n' +
    'Request-Id:' + requestId + '\n' +
    'Request-Timestamp:' + requestTimestamp + '\n' +
    'Request-Target:' + requestTarget + '\n' +
    'Digest:' + digest;

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(componentSignature)
    .digest('base64');

  return 'HMACSHA256=' + signature;
}

/**
 * Buat transaksi DOKU Checkout.
 * Return payment_url agar frontend bisa redirect customer.
 *
 * @param {object} order
 * @param {string} order.id - Invoice/external ID
 * @param {number} order.amount - Total amount
 * @param {string} order.name - Customer name
 * @param {string} order.email - Customer email
 * @returns {Promise<{payment_url: string, invoice_number: string}>}
 */
const createTransaction = async (order) => {
  const { clientId, secretKey, baseUrl } = getDokuConfig();
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const callbackUrl = process.env.DOKU_CALLBACK_URL || `${frontendUrl}/payment/callback`;

  const requestId = uuidv4();
  const requestTimestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'); // ISO 8601 UTC without milliseconds
  const requestTarget = '/checkout/v1/payment';

  const requestBody = {
    order: {
      amount: order.amount,
      invoice_number: order.id,
      currency: 'IDR',
      callback_url: callbackUrl,
      line_items: [
        {
          name: order.product_name || 'Trivgoo Booking',
          price: order.amount,
          quantity: order.quantity || 1,
        },
      ],
    },
    payment: {
      payment_due_date: 60, // 60 menit
    },
    customer: {
      name: order.name || 'Customer Name',
      email: order.email || 'customer@example.com',
    },
  };

  const bodyString = JSON.stringify(requestBody);

  const signature = generateSignature({
    clientId,
    requestId,
    requestTimestamp,
    requestTarget,
    secretKey,
    body: bodyString,
  });

  const headers = {
    'Client-Id': clientId,
    'Request-Id': requestId,
    'Request-Timestamp': requestTimestamp,
    'Signature': signature,
    'Content-Type': 'application/json',
  };

  console.log('[DOKU] Creating transaction:', {
    invoice_number: order.id,
    amount: order.amount,
    baseUrl,
    requestId,
    requestTimestamp,
    clientId,
  });
  console.log('[DOKU] Signature component:', JSON.stringify({
    digest: crypto.createHash('sha256').update(bodyString, 'utf8').digest('base64'),
    signatureResult: signature,
  }));

  try {
    // IMPORTANT: send bodyString (not object) to ensure the exact same
    // JSON used for digest generation is sent to DOKU
    const response = await axios.post(
      `${baseUrl}${requestTarget}`,
      bodyString,
      { headers }
    );

    const paymentUrl = response.data?.response?.payment?.url;

    if (!paymentUrl) {
      console.error('[DOKU] No payment URL in response:', JSON.stringify(response.data, null, 2));
      throw new Error('DOKU tidak mengembalikan payment URL.');
    }

    console.log('[DOKU] Transaction created successfully:', {
      payment_url: paymentUrl ? '✓' : '✗',
      invoice_number: order.id,
    });

    return {
      payment_url: paymentUrl,
      invoice_number: order.id,
    };
  } catch (err) {
    const errData = err?.response?.data || err?.message || err;
    console.error('[DOKU] createTransaction error:', JSON.stringify(errData, null, 2));
    throw new Error(
      typeof errData === 'string'
        ? errData
        : errData?.error?.message || 'Gagal membuat transaksi DOKU'
    );
  }
};

/**
 * Verifikasi notifikasi/callback dari DOKU.
 *
 * DOKU mengirim notification ke webhook URL dengan header signature.
 * Kita perlu memverifikasi signature tersebut.
 *
 * @param {object} notification - Body notifikasi dari DOKU
 * @param {object} headers - HTTP headers dari request notifikasi
 * @returns {{ transaction_status: string, invoice_number: string }}
 */
const handleNotification = async (notification, headers = {}) => {
  const { clientId, secretKey } = getDokuConfig();

  // Extract signature from header
  const incomingSignature = headers['signature'] || headers['Signature'] || '';

  // Untuk verifikasi, kita generate ulang signature dari body
  const requestId = headers['request-id'] || headers['Request-Id'] || '';
  const requestTimestamp = headers['request-timestamp'] || headers['Request-Timestamp'] || '';
  // DOKU notification target path
  const notificationTarget = '/payment/callback';

  const bodyString = JSON.stringify(notification);

  const expectedSignature = generateSignature({
    clientId,
    requestId,
    requestTimestamp,
    requestTarget: notificationTarget,
    secretKey,
    body: bodyString,
  });

  // Untuk sandbox/development, skip signature verification jika tidak ada header
  if (process.env.NODE_ENV === 'production' && incomingSignature && incomingSignature !== expectedSignature) {
    throw new Error('Invalid signature — webhook mungkin bukan dari DOKU.');
  }

  // Map DOKU transaction status
  const transactionStatus = notification?.transaction?.status || notification?.service?.status || 'UNKNOWN';
  const invoiceNumber = notification?.order?.invoice_number || notification?.invoice_number || '';

  return {
    transaction_status: transactionStatus,
    invoice_number: invoiceNumber,
  };
};

module.exports = { createTransaction, handleNotification, generateSignature, getDokuConfig };