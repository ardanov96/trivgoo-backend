// src/services/payment_service.js
const { Snap } = require('midtrans-client');
const crypto = require('crypto');
const { execute } = require('../configs/db');

/**
 * Ambil konfigurasi Midtrans dari tabel payment_settings.
 * Tidak bergantung pada .env — semua key dikelola via Admin → Payment Settings.
 */
async function getMidtransSnap() {
  const [rows] = await execute(
    `SELECT midtrans_server_key, midtrans_client_key, is_test_mode
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

  // Attach metadata untuk digunakan controller
  snap._isProduction = isProduction;
  snap._clientKey = config.midtrans_client_key || '';

  return snap;
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
  const snap = await getMidtransSnap();

  const parameter = {
    transaction_details: {
      order_id: order.id,
      gross_amount: order.amount,
    },
    customer_details: {
      first_name: order.name,
      email: order.email,
    },
  };

  try {
    const transaction = await snap.createTransaction(parameter);

    // Return token + metadata environment
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