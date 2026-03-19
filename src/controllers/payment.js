// src/controllers/payment.js
const misc = require('../helpers/response');
const payment_service = require('../services/payment_service');
const { execute } = require('../configs/db');
const { send_payment_success_email, send_new_booking_notification_email } = require('../helpers/mailer');

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
      const { id, amount, name, email, product_name, quantity, product_id, date } = req.body;

      if (!amount || !id || !name || !email) {
        return misc.response(res, 400, true, 'Missing required fields: id, amount, name, email');
      }

      order = { id, amount, name, email, product_name, quantity, product_id, date };
    }

    // Validasi amount
    if (!order.amount || isNaN(Number(order.amount)) || Number(order.amount) <= 0) {
      return misc.response(res, 400, true, 'Amount tidak valid: ' + order.amount);
    }

    // --- FIRST TO PAY WINS INVENTORY LOCKING (C.6) ---
    if (order.product_id) {
      const orderDate = order.date || new Date().toISOString().split('T')[0];
      const dailyCapacity = 1; // Permintaan User: Anggap semua mobil stoknya hanya 1

      // 2. Hitung jumlah booking yang SUDAH DIBAYAR lunas pada tanggal tersebut
      // PENDING booking TIDAK DIHITUNG (sehingga puluhan user bisa rebutan checkout bersamaan)
      const bookingSumResult = await execute(
        `SELECT SUM(quantity) as total_booked 
         FROM bookings 
         WHERE product_id = ? 
           AND date = ? 
           AND status != 'CANCELLED' 
           AND payment_status IN ('PAID', 'SETTLED', 'SUCCESS')`,
        [order.product_id, orderDate]
      );
      
      const sumRows = Array.isArray(bookingSumResult[0]) ? bookingSumResult[0] : bookingSumResult;
      const totalBooked = sumRows && sumRows[0].total_booked ? Number(sumRows[0].total_booked) : 0;

      // 3. Validasi: Tolak JIKA DAN HANYA JIKA unit sudah DIBAYAR oleh pemenang (totalBooked >= 1)
      if (totalBooked >= 1) {
        return misc.response(res, 400, true, `Maaf, unit tersebut baru saja disewa dan dibayar sukses oleh pelanggan lain.`);
      }
    }
    // ------------------------------------------

    console.log('[PAYMENT] Creating transaction for order:', {
      id: order.id,
      amount: order.amount,
      name: order.name,
      date: order.date
    });

    // Buat transaksi ke payment gateway
    const transaction = await payment_service.createTransaction(order);
    const finalDate = order.date || new Date().toISOString().split('T')[0];

    // Upsert bookings — simpan juga payment_request_id agar bisa dipakai untuk cancel
    await execute(
      `INSERT INTO bookings 
        (external_id, user_id, product_id, user_name, product_name, quantity, total_price, date, status, payment_url, payment_gateway, payment_status, payment_request_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 'doku', 'PENDING', ?, NOW())
       ON DUPLICATE KEY UPDATE
        payment_url        = VALUES(payment_url),
        payment_request_id = VALUES(payment_request_id),
        date               = VALUES(date),
        updated_at         = NOW()`,
      [
        order.id,
        user_id || null,
        order.product_id || null,
        order.name,
        order.product_name || '-',
        order.quantity || 1,
        order.amount,
        finalDate, 
        transaction.payment_url || null,
        transaction.request_id  || null,
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

    // ── PENGAMAN: Cek apakah booking sudah CANCELLED ──────────────────────
    const existingBooking = await execute(
      `SELECT id, product_id, date, status, payment_status, user_name, total_price, external_id 
       FROM bookings WHERE external_id = ? LIMIT 1`,
      [result.invoice_number]
    );
    const existingRows = Array.isArray(existingBooking[0]) ? existingBooking[0] : existingBooking;
    const currentBooking = existingRows?.[0];

    if (currentBooking && currentBooking.status === 'CANCELLED' && newStatus === 'PAID') {
      // ⚠️ User sudah cancel tapi tetap bayar → JANGAN ubah status, tandai perlu REFUND
      console.warn(
        `[PAYMENT] ⚠️ REFUND DIPERLUKAN! Booking ${result.invoice_number} sudah CANCELLED ` +
        `tapi user tetap membayar. Amount: ${currentBooking.total_price}. ` +
        `User: ${currentBooking.user_name}. Silakan proses refund manual via dashboard DOKU.`
      );

      // Log ke webhook_logs dengan status khusus 'needs_refund'
      await execute(
        `UPDATE webhook_logs 
         SET status = 'needs_refund', signature_verified = true, processed_at = NOW(),
             error_message = 'Booking sudah CANCELLED tapi user tetap membayar. Perlu refund manual.'
         WHERE external_id = ? AND gateway = 'doku' ORDER BY id DESC LIMIT 1`,
        [result.invoice_number]
      );

      // Update payment_transactions agar tercatat pembayaran masuk
      await execute(
        `UPDATE payment_transactions
         SET status = 'NEEDS_REFUND', gateway_transaction_id = ?, payment_method = ?,
             paid_at = NOW(), gateway_response = ?, updated_at = NOW()
         WHERE external_id = ? AND gateway = 'doku'`,
        [
          notification?.transaction?.id || null,
          notification?.channel?.id || notification?.payment_method || null,
          JSON.stringify(notification),
          result.invoice_number,
        ]
      );

      // TIDAK mengubah status booking — tetap CANCELLED
      return res.json({ 
        success: true, 
        message: 'Payment received but booking was cancelled. Refund needed.' 
      });
    }
    // ── END PENGAMAN ──────────────────────────────────────────────────────

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

    // Kirim Notifikasi Email Jika Pembayaran Berhasil
    if (newStatus === 'PAID') {
      
      // --- FIRST TO PAY WINS: THE KICK (C.6) ---
      try {
        if (currentBooking && currentBooking.product_id && currentBooking.date) {
          const competitorsResult = await execute(
            `SELECT id, external_id, payment_request_id 
             FROM bookings 
             WHERE product_id = ? 
               AND date = ? 
               AND status = 'PENDING' 
               AND id != ?`,
            [currentBooking.product_id, currentBooking.date, currentBooking.id]
          );
          const competitors = Array.isArray(competitorsResult[0]) ? competitorsResult[0] : competitorsResult;
          
          if (competitors && competitors.length > 0) {
            console.log(`[RACE CONDITION] Menendang ${competitors.length} pesaing (kalah cepat) untuk mobil ${currentBooking.product_id} tanggal ${currentBooking.date}`);
            for (const comp of competitors) {
              // 1. Tembak API Pembatalan ke DOKU Jokul
              await payment_service.cancelTransaction(comp.external_id, comp.payment_request_id);
              // 2. Kick dari DB Trivgoo
              await execute(
                `UPDATE bookings SET status = 'CANCELLED', payment_status = 'FAILED_OVERBOOKED', updated_at = NOW() WHERE id = ?`,
                [comp.id]
              );
            }
          }
        }
      } catch (kickErr) {
        console.error('[RACE CONDITION] Gagal menendang competitor:', kickErr.message);
      }
      // ----------------------------------------

      try {
        const bookingData = await execute(
          `SELECT b.external_id, b.product_name, b.total_price, b.user_name, u.email as user_email, b.date
           FROM bookings b
           LEFT JOIN users u ON b.user_id = u.id
           WHERE b.external_id = ? LIMIT 1`,
          [result.invoice_number]
        );
        const bRows = Array.isArray(bookingData[0]) ? bookingData[0] : bookingData;
        
        if (bRows && bRows.length > 0) {
          const booking = bRows[0];
          const toEmail = booking.user_email || notification?.customer?.email || notification?.payer_email;
          const recipientName = booking.user_name || notification?.customer?.name || 'Customer';
          
          if (toEmail) {
            await send_payment_success_email(
              toEmail,
              recipientName,
              booking.external_id,
              booking.product_name || 'Trivgoo Booking',
              booking.total_price
            );
            console.log(`[PAYMENT] Success notification email sent to ${toEmail}`);
          }
        }
      } catch (emailErr) {
        console.error('[EMAIL NOTIF] Failed to send payment success email:', emailErr.message);
        // Error email tidak boleh menggagalkan proses webhook
      }

      // ── Kirim notifikasi ke AGENT (owner produk) ───────────────────────
      try {
        const agentData = await execute(
          `SELECT u.email AS agent_email, u.name AS agent_name,
                  b.external_id, b.product_name, b.user_name, b.total_price, b.quantity, b.date
           FROM bookings b
           JOIN products p ON b.product_id = p.id
           JOIN users u ON p.owner_id = u.id
           WHERE b.external_id = ? LIMIT 1`,
          [result.invoice_number]
        );
        const aRows = Array.isArray(agentData[0]) ? agentData[0] : agentData;
        if (aRows && aRows.length > 0 && aRows[0].agent_email) {
          const agent = aRows[0];
          await send_new_booking_notification_email(
            agent.agent_email,
            agent.agent_name || 'Agent',
            {
              external_id: agent.external_id,
              product_name: agent.product_name,
              user_name: agent.user_name,
              total_price: agent.total_price,
              quantity: agent.quantity,
              date: agent.date,
            }
          );
          console.log(`[PAYMENT] Agent notification email sent to ${agent.agent_email}`);
        }
      } catch (agentEmailErr) {
        console.error('[EMAIL NOTIF] Failed to send agent booking notification:', agentEmailErr.message);
      }
    }

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