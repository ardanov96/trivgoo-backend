// src/controllers/payment.js
const misc = require('../helpers/response');
const payment_service = require('../services/payment_service');
const { execute } = require('../configs/db');

/**
 * POST /api/v1/payment/create-payment
 * Terima booking_id dari frontend, lookup data dari DB, lalu buat transaksi.
 */
const createPayment = async (req, res) => {
  try {
    const user_id = req.session?.user?.id || req.body.user_id || null;

    // ── Support 2 flow:
    // 1. Frontend kirim booking_id → lookup dari DB (flow baru, recommended)
    // 2. Frontend kirim id/amount/name/email langsung → flow lama (backward compat)
    let order = {};

    if (req.body.booking_id) {
      // Flow baru: lookup booking dari DB
      const booking_id = req.body.booking_id;

      const bookingResult = await execute(
        `SELECT b.*, u.name as user_name, u.email as user_email
         FROM bookings b
         LEFT JOIN users u ON b.user_id = u.id
         WHERE b.id = ?
         LIMIT 1`,
        [booking_id]
      );
      // execute() bisa return [rows] atau rows langsung tergantung implementasi
      const rows = Array.isArray(bookingResult[0]) ? bookingResult[0] : bookingResult;

      if (!rows || rows.length === 0) {
        return misc.response(res, 404, true, 'Booking tidak ditemukan');
      }

      const booking = rows[0];

      // Cek booking milik user ini (kalau ada session)
      if (user_id && booking.user_id && String(booking.user_id) !== String(user_id)) {
        return misc.response(res, 403, true, 'Tidak punya akses ke booking ini');
      }

      // Kalau sudah punya payment_url aktif, return langsung
      if (booking.payment_url && booking.payment_status === 'PENDING') {
        return misc.response(res, 200, false, 'Payment URL already exists', {
          payment_url: booking.payment_url,
          invoice_number: booking.external_id,
        });
      }

      order = {
        id: booking.external_id || ('TRV-' + booking_id + '-' + Date.now()),
        amount: booking.total_price || booking.total_amount || booking.amount,
        name: booking.user_name || booking.customer_name || 'Customer',
        email: booking.user_email || booking.email || 'customer@example.com',
        product_name: booking.product_name || booking.title || 'Trivgoo Booking',
        quantity: booking.quantity || 1,
        product_id: booking.product_id,
        booking_id,
      };

    } else {
      // Flow lama: frontend kirim semua field langsung
      const { id, amount, name, email, product_name, quantity, product_id } = req.body;

      if (!amount || !id || !name || !email) {
        return misc.response(res, 400, true, 'Missing required fields: id, amount, name, email');
      }

      order = { id, amount, name, email, product_name, quantity, product_id };
    }

    // Validasi amount
    if (!order.amount || isNaN(Number(order.amount)) || Number(order.amount) <= 0) {
      return misc.response(res, 400, true, 'Amount tidak valid: ' + order.amount);
    }

    console.log('[PAYMENT] Creating transaction for order:', {
      id: order.id,
      amount: order.amount,
      name: order.name,
    });

    // Buat transaksi ke payment gateway
    const transaction = await payment_service.createTransaction(order);

    // Upsert bookings
    await execute(
      `INSERT INTO bookings 
        (external_id, user_id, product_id, user_name, product_name, quantity, total_price, date, status, payment_url, payment_gateway, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURDATE(), 'PENDING', ?, 'doku', 'PENDING')
       ON DUPLICATE KEY UPDATE
        payment_url = VALUES(payment_url),
        updated_at  = NOW()`,
      [
        order.id,
        user_id || null,
        order.product_id || null,
        order.name,
        order.product_name || '-',
        order.quantity || 1,
        order.amount,
        transaction.payment_url || null,
      ]
    );

    // Simpan ke payment_transactions
    await execute(
      `INSERT INTO payment_transactions
        (booking_id, user_id, gateway, external_id, amount, currency, status, payment_url, gateway_response)
       SELECT id, ?, 'doku', ?, ?, 'IDR', 'PENDING', ?, ?
       FROM bookings WHERE external_id = ? LIMIT 1
       ON DUPLICATE KEY UPDATE
        payment_url = VALUES(payment_url),
        updated_at  = NOW()`,
      [
        user_id || null,
        order.id,
        order.amount,
        transaction.payment_url || null,
        JSON.stringify(transaction),
        order.id,
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
 * Handle webhook notifikasi dari DOKU (public, tidak perlu auth).
 */
const handleNotification = async (req, res) => {
  try {
    const notification = req.body;

    // Log webhook
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

    const result = await payment_service.handleNotification(notification, req.headers);

    const statusMap = {
      SUCCESS: 'PAID', PAID: 'PAID', PENDING: 'PENDING',
      FAILED: 'FAILED', EXPIRED: 'EXPIRED', CANCELLED: 'CANCELLED',
      REFUNDED: 'REFUNDED', VOIDED: 'CANCELLED',
    };
    const rawStatus = (result.transaction_status || '').toUpperCase();
    const newStatus = statusMap[rawStatus] || 'PENDING';

    await execute(
      `UPDATE bookings SET status = ?, payment_status = ?, updated_at = NOW() WHERE external_id = ?`,
      [newStatus === 'PAID' ? 'CONFIRMED' : newStatus, newStatus, result.invoice_number]
    );

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

    await execute(
      `UPDATE webhook_logs 
       SET status = 'processed', signature_verified = true, processed_at = NOW()
       WHERE external_id = ? AND gateway = 'doku' ORDER BY id DESC LIMIT 1`,
      [result.invoice_number]
    );

    return res.json({ success: true, message: 'Notification processed' });

  } catch (error) {
    console.error('[PAYMENT] handleNotification error:', error.message);

    const invoiceNumber = req.body?.order?.invoice_number;
    if (invoiceNumber) {
      await execute(
        `UPDATE webhook_logs SET status = 'failed', error_message = ?, processed_at = NOW()
         WHERE external_id = ? AND gateway = 'doku' ORDER BY id DESC LIMIT 1`,
        [error.message, invoiceNumber]
      ).catch(() => {});
    }

    return res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { createPayment, handleNotification };