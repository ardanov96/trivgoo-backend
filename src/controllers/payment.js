// src/controllers/payment.js
const misc = require('../helpers/response');
const payment_service = require('../services/payment_service');
const { execute } = require('../configs/db');

/**
 * POST /api/v1/payment/create-payment
 * Buat transaksi Midtrans Snap dan simpan ke DB.
 */
const createPayment = async (req, res) => {
  try {
    const { id, amount, name, email, product_name, quantity } = req.body;

    if (!amount || !id || !name || !email) {
      return misc.response(res, 400, true, 'Missing required fields: id, amount, name, email');
    }

    // Buat transaksi Midtrans Snap
    const transaction = await payment_service.createTransaction({ id, amount, name, email });

    // Simpan ke tabel bookings
    await execute(
      `INSERT INTO bookings 
        (external_id, user_name, product_name, quantity, total_price, date, status, payment_token, payment_url)
       VALUES (?, ?, ?, ?, ?, CURDATE(), 'PENDING', ?, ?)
       ON DUPLICATE KEY UPDATE
        payment_token = VALUES(payment_token),
        payment_url   = VALUES(payment_url),
        updated_at    = NOW()`,
      [
        id,
        name,
        product_name || '-',
        quantity || 1,
        amount,
        transaction.token,
        transaction.redirect_url || null,
      ]
    );

    // Simpan ke tabel payment_transactions
    await execute(
      `INSERT INTO payment_transactions
        (booking_id, gateway, external_id, amount, currency, status, gateway_response)
       SELECT id, 'midtrans', ?, ?, 'IDR', 'PENDING', ?
       FROM bookings WHERE external_id = ? LIMIT 1`,
      [id, amount, JSON.stringify(transaction), id]
    );

    return misc.response(res, 200, false, 'Snap token created successfully', {
      token: transaction.token,
      redirect_url: transaction.redirect_url,
    });

  } catch (error) {
    console.error('[PAYMENT] createPayment error:', error.message);
    return misc.response(res, 500, true, error.message || 'Internal Server Error');
  }
};

/**
 * POST /api/v1/payment/notification
 * Handle webhook notifikasi dari Midtrans (harus public, tidak perlu auth).
 */
const handleNotification = async (req, res) => {
  try {
    const notification = req.body;

    // Log webhook sebelum proses apapun
    await execute(
      `INSERT INTO webhook_logs 
        (gateway, event_type, external_id, transaction_id, payload, signature_verified, status)
       VALUES ('midtrans', ?, ?, ?, ?, false, 'pending')`,
      [
        notification.transaction_status || 'unknown',
        notification.order_id || null,
        notification.transaction_id || null,
        JSON.stringify(notification),
      ]
    );

    // Verifikasi signature
    await payment_service.handleNotification(notification);

    // Map status Midtrans ke status internal
    const statusMap = {
      settlement : 'PAID',
      capture    : 'PAID',
      pending    : 'PENDING',
      deny       : 'FAILED',
      expire     : 'EXPIRED',
      cancel     : 'CANCELLED',
      refund     : 'REFUNDED',
      chargeback : 'FAILED',
    };
    const newStatus = statusMap[notification.transaction_status] || 'PENDING';

    // Update bookings
    await execute(
      `UPDATE bookings SET status = ?, updated_at = NOW() WHERE external_id = ?`,
      [newStatus === 'PAID' ? 'CONFIRMED' : newStatus, notification.order_id]
    );

    // Update payment_transactions
    await execute(
      `UPDATE payment_transactions
       SET status = ?, gateway_transaction_id = ?, payment_method = ?,
           fraud_status = ?, paid_at = IF(? = 'PAID', NOW(), paid_at),
           gateway_response = ?, updated_at = NOW()
       WHERE external_id = ? AND gateway = 'midtrans'`,
      [
        newStatus,
        notification.transaction_id || null,
        notification.payment_type || null,
        notification.fraud_status || null,
        newStatus,
        JSON.stringify(notification),
        notification.order_id,
      ]
    );

    // Update webhook log ke processed
    await execute(
      `UPDATE webhook_logs 
       SET status = 'processed', signature_verified = true, processed_at = NOW()
       WHERE external_id = ? AND gateway = 'midtrans' 
       ORDER BY id DESC LIMIT 1`,
      [notification.order_id]
    );

    return res.json({ success: true, message: 'Notification processed' });

  } catch (error) {
    console.error('[PAYMENT] handleNotification error:', error.message);

    // Update webhook log ke failed
    if (req.body?.order_id) {
      await execute(
        `UPDATE webhook_logs 
         SET status = 'failed', error_message = ?, processed_at = NOW()
         WHERE external_id = ? AND gateway = 'midtrans' 
         ORDER BY id DESC LIMIT 1`,
        [error.message, req.body.order_id]
      ).catch(() => {});
    }

    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { createPayment, handleNotification };