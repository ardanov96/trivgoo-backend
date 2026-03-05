const { Snap } = require('midtrans-client');
const crypto = require('crypto');
const { execute } = require('../configs/db');

/**
 * Ambil konfigurasi Midtrans dari tabel payment_settings
 * Tidak lagi bergantung pada .env
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

  return new Snap({
    isProduction: config.is_test_mode === 0,  // is_test_mode=1 → sandbox, is_test_mode=0 → production
    serverKey: config.midtrans_server_key,
    clientKey: config.midtrans_client_key || '',
  });
}

/**
 * Ambil server key saja (untuk verifikasi signature webhook)
 */
async function getMidtransServerKey() {
  const [rows] = await execute(
    `SELECT midtrans_server_key FROM payment_settings WHERE is_active = 1 LIMIT 1`
  );
  return rows?.[0]?.midtrans_server_key || null;
}

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

  return await snap.createTransaction(parameter);
};

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

  // Return status agar controller bisa proses lebih lanjut
  return { transaction_status, order_id };
};

module.exports = { createTransaction, handleNotification };