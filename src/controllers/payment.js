// src/controllers/payment.js
const misc = require('../helpers/response');
const payment_service = require('../services/payment_service');
const { execute } = require('../configs/db');

/**
 * POST /api/v1/payment/create-payment
 * Buat transaksi DOKU Checkout dan simpan ke DB.
 */
const createPayment = async (req, res) => {
  try {
    const { id, amount, name, email, product_name, quantity, product_id } = req.body;
    // Use session user_id (reliable) instead of frontend-submitted user_id
    const user_id = req.session?.user?.id || req.body.user_id || null;

    if (!amount || !id || !name || !email) {
      return misc.response(res, 400, true, 'Missing required fields: id, amount, name, email');
    }

    // Buat transaksi DOKU Checkout
    const transaction = await payment_service.createTransaction({
      id,
      amount,
      name,
      email,
      product_name,
      quantity,
    });

    // Simpan ke tabel bookings
    await execute(
      `INSERT INTO bookings 
        (external_id, user_id, product_id, user_name, product_name, quantity, total_price, date, status, payment_url, payment_gateway, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), 'PENDING', ?, 'doku', 'PENDING')
       ON DUPLICATE KEY UPDATE
        payment_url   = VALUES(payment_url),
        updated_at    = NOW()`,
      [
        id,
        user_id || null,
        product_id || null,
        name,
        product_name || '-',
        quantity || 1,
        amount,
        transaction.payment_url || null,
      ]
    );

    // Simpan ke tabel payment_transactions
    await execute(
      `INSERT INTO payment_transactions
        (booking_id, user_id, gateway, external_id, amount, currency, status, payment_url, gateway_response)
       SELECT id, ?, 'doku', ?, ?, 'IDR', 'PENDING', ?, ?
       FROM bookings WHERE external_id = ? LIMIT 1`,
      [
        user_id || null,
        id,
        amount,
        transaction.payment_url || null,
        JSON.stringify(transaction),
        id,
      ]
    );

    return misc.response(res, 200, false, 'Payment created successfully', {
      payment_url: transaction.payment_url,
      invoice_number: transaction.invoice_number,
    });

  } catch (error) {
    console.error('[PAYMENT] createPayment error:', error.message);
    return misc.response(res, 500, true, error.message || 'Internal Server Error');
  }
};

/**
 * POST /api/v1/payment/notification
 * Handle webhook notifikasi dari DOKU (harus public, tidak perlu auth).
 */
const handleNotification = async (req, res) => {
  try {
    const notification = req.body;

    // Log webhook sebelum proses apapun
    await execute(
      `INSERT INTO webhook_logs 
        (gateway, event_type, external_id, transaction_id, payload, signature_verified, status)
       VALUES ('doku', ?, ?, ?, ?, false, 'pending')`,
      [
        notification?.transaction?.status || notification?.service?.status || 'unknown',
        notification?.order?.invoice_number || null,
        notification?.transaction?.id || null,
        JSON.stringify(notification),
      ]
    );

    // Verifikasi signature & parse status
    const result = await payment_service.handleNotification(notification, req.headers);

    // Map status DOKU ke status internal
    const statusMap = {
      SUCCESS: 'PAID',
      PAID: 'PAID',
      PENDING: 'PENDING',
      FAILED: 'FAILED',
      EXPIRED: 'EXPIRED',
      CANCELLED: 'CANCELLED',
      REFUNDED: 'REFUNDED',
      VOIDED: 'CANCELLED',
    };
    const rawStatus = (result.transaction_status || '').toUpperCase();
    const newStatus = statusMap[rawStatus] || 'PENDING';

    // Update bookings
    await execute(
      `UPDATE bookings SET status = ?, payment_status = ?, updated_at = NOW() WHERE external_id = ?`,
      [newStatus === 'PAID' ? 'CONFIRMED' : newStatus, newStatus, result.invoice_number]
    );

    // Update payment_transactions
    await execute(
      `UPDATE payment_transactions
       SET status = ?, gateway_transaction_id = ?, payment_method = ?,
           paid_at = IF(? = 'PAID', NOW(), paid_at),
           gateway_response = ?, updated_at = NOW()
       WHERE external_id = ? AND gateway = 'doku'`,
      [
        newStatus,
        notification?.transaction?.id || null,
        notification?.channel?.id || notification?.payment_method || null,
        newStatus,
        JSON.stringify(notification),
        result.invoice_number,
      ]
    );

    // Update webhook log ke processed
    await execute(
      `UPDATE webhook_logs 
       SET status = 'processed', signature_verified = true, processed_at = NOW()
       WHERE external_id = ? AND gateway = 'doku' 
       ORDER BY id DESC LIMIT 1`,
      [result.invoice_number]
    );

    return res.json({ success: true, message: 'Notification processed' });

  } catch (error) {
    console.error('[PAYMENT] handleNotification error:', error.message);

    // Update webhook log ke failed
    const invoiceNumber = req.body?.order?.invoice_number;
    if (invoiceNumber) {
      await execute(
        `UPDATE webhook_logs 
         SET status = 'failed', error_message = ?, processed_at = NOW()
         WHERE external_id = ? AND gateway = 'doku' 
         ORDER BY id DESC LIMIT 1`,
        [error.message, invoiceNumber]
      ).catch(() => { });
    }

    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { createPayment, handleNotification };