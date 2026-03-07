// src/services/payment_service.js
const { Snap } = require('midtrans-client');
const crypto = require('crypto');
const { execute } = require('../configs/db');

/**
 * Mapping dari ID metode pembayaran di DB → format enabled_payments Midtrans Snap.
 * Midtrans Snap menerima array string seperti:
 * ['credit_card', 'gopay', 'shopeepay', 'bank_transfer', 'echannel', 'permata_va', 'bca_va', 'bni_va', 'bri_va', 'cstore', 'akulaku']
 */
const PAYMENT_METHOD_MAP = {
  credit_card: ['credit_card'],
  gopay: ['gopay'],
  shopeepay: ['shopeepay'],
  bank_transfer: ['bank_transfer', 'echannel', 'permata_va', 'bca_va', 'bni_va', 'bri_va', 'other_va'],
  qris: ['gopay'],        // QRIS di Midtrans Snap diakses via gopay
  indomaret: ['cstore'],
  alfamart: ['cstore'],
  e_wallet: ['gopay', 'shopeepay'],
  virtual_account: ['bank_transfer', 'echannel', 'permata_va', 'bca_va', 'bni_va', 'bri_va', 'other_va'],
};

/**
 * Ambil konfigurasi lengkap Midtrans dari tabel payment_settings.
 * Termasuk midtrans_payment_methods untuk menentukan enabled_payments.
 */
async function getMidtransConfig() {
  const [rows] = await execute(
    `SELECT midtrans_server_key, midtrans_client_key, is_test_mode, midtrans_payment_methods
     FROM payment_settings
     WHERE is_active = 1
     LIMIT 1`
  );

  if (!rows || rows.length === 0) {
    throw new Error('Payment settings tidak ditemukan. Silakan konfigurasi di Admin → Payment Settings.');
  }

  const config = rows[0];

  if (!config.midtrans_server_key) {
    throw new Error('Midtrans Server Key belum dikonfigurasi. Silakan isi di Admin → Payment Settings.');
  }

  const isProduction = config.is_test_mode === 0;

  const snap = new Snap({
    isProduction,
    serverKey: config.midtrans_server_key,
    clientKey: config.midtrans_client_key || '',
  });

  // Attach metadata
  snap._isProduction = isProduction;
  snap._clientKey = config.midtrans_client_key || '';

  // Parse payment methods dari DB
  let paymentMethods = [];
  try {
    const raw = config.midtrans_payment_methods;
    paymentMethods = typeof raw === 'string' ? JSON.parse(raw) : (raw || []);
  } catch (e) {
    paymentMethods = [];
  }

  return { snap, paymentMethods };
}

/**
 * Bangun array enabled_payments dari konfigurasi di DB.
 * Hanya metode yang enabled: true yang akan dikirim ke Midtrans.
 */
function buildEnabledPayments(paymentMethods) {
  if (!Array.isArray(paymentMethods) || paymentMethods.length === 0) {
    return []; // kosong = Midtrans tampilkan semua metode default
  }

  const enabledSet = new Set();
  for (const method of paymentMethods) {
    if (method.enabled) {
      const mapped = PAYMENT_METHOD_MAP[method.id] || [];
      mapped.forEach(m => enabledSet.add(m));
    }
  }

  return [...enabledSet];
}

/**
 * Ambil server key saja — untuk verifikasi signature webhook.
 */
async function getMidtransServerKey() {
  const [rows] = await execute(
    `SELECT midtrans_server_key FROM payment_settings WHERE is_active = 1 LIMIT 1`
  );
  return rows?.[0]?.midtrans_server_key || null;
}

/**
 * Buat transaksi Snap Midtrans.
 * Return token, redirect_url, is_production, dan client_key
 * agar frontend bisa load Snap script yang sesuai.
 */
const createTransaction = async (order) => {
  const { snap, paymentMethods } = await getMidtransConfig();
  const enabledPayments = buildEnabledPayments(paymentMethods);

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  const parameter = {
    transaction_details: {
      order_id: order.id,
      gross_amount: order.amount,
    },
    customer_details: {
      first_name: order.name,
      email: order.email,
    },
    callbacks: {
      finish: `${frontendUrl}/my-bookings`,
    },
  };

  // Hanya tambahkan enabled_payments jika ada yang dikonfigurasi
  if (enabledPayments.length > 0) {
    parameter.enabled_payments = enabledPayments;
  }

  console.log('[MIDTRANS] Creating transaction:', {
    order_id: order.id,
    amount: order.amount,
    isProduction: snap._isProduction,
    enabled_payments: enabledPayments.length > 0 ? enabledPayments : 'ALL (default)',
  });

  try {
    const transaction = await snap.createTransaction(parameter);

    console.log('[MIDTRANS] Transaction created successfully:', {
      token: transaction.token ? '✓' : '✗',
      redirect_url: transaction.redirect_url ? '✓' : '✗',
    });

    return {
      token: transaction.token,
      redirect_url: transaction.redirect_url,
      is_production: snap._isProduction,
      client_key: snap._clientKey,
    };
  } catch (err) {
    console.error('[MIDTRANS] createTransaction error:', JSON.stringify(err?.ApiResponse || err?.message || err, null, 2));
    throw err;
  }
};

/**
 * Verifikasi signature dari webhook Midtrans.
 */
const handleNotification = async (notification) => {
  const serverKey = await getMidtransServerKey();

  if (!serverKey) {
    throw new Error('Midtrans Server Key tidak ditemukan di payment_settings.');
  }

  const { order_id, status_code, gross_amount, signature_key, transaction_status } = notification;

  const hash = crypto
    .createHash('sha512')
    .update(order_id + status_code + gross_amount + serverKey)
    .digest('hex');

  if (hash !== signature_key) {
    throw new Error('Invalid signature — webhook mungkin bukan dari Midtrans.');
  }

  return { transaction_status, order_id };
};

module.exports = { createTransaction, handleNotification };