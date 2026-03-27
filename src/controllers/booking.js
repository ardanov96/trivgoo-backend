const db = require('../configs/db');
const { response } = require('../helpers/response');
const payment_service = require('../services/payment_service');
const PaymentTransaction = require('../models/payment_transaction');

const getAllBookings = async (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = `SELECT 
                id, 
                user_id as userId, 
                product_id as productId, 
                product_name as productName, 
                user_name as userName, 
                quantity, 
                total_price as totalPrice, 
                date, 
                start_time as startTime,
                end_time as endTime,
                status,
                external_id as externalId,
                payment_url as paymentUrl,
                payment_status as paymentStatus,
                payment_gateway as paymentGateway,
                payment_method as paymentMethod,
                paid_at as paidAt,
                created_at as createdAt
               FROM bookings WHERE 1=1`;
    const params = [];

    if (status && status !== 'all') {
      sql += ` AND status = ?`;
      params.push(status);
    }

    if (search) {
      sql += ` AND (
        CAST(id AS CHAR) LIKE ? 
        OR user_name LIKE ? 
        OR product_name LIKE ?
      )`;
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    sql += ` ORDER BY created_at DESC`;

    // 1. Safe Query Execution
    let rows = [];
    try {
      [rows] = await db.query(sql, params);
    } catch (dbError) {
      console.error('[getAllBookings] Database Query Error:', dbError.message);
      console.error('[getAllBookings] SQL:', sql);
      console.error('[getAllBookings] Params:', params);
      throw dbError; // rethrow to be caught by main catch block
    }

    if (!Array.isArray(rows)) {
      console.warn('[getAllBookings] DB did not return an array. Returning empty.');
      return response(res, 200, false, 'Bookings fetched successfully', []);
    }

    // 2. Safe Mapping & Transformation
    const formattedRows = rows.map((row, index) => {
      try {
        let formattedDate = null;

        // Handle potentially invalid or "0000-00-00" dates safely
        if (row.date) {
          const parsedDate = new Date(row.date);
          // Check if date is valid before calling toISOString
          if (!isNaN(parsedDate.getTime())) {
            formattedDate = parsedDate.toISOString().split('T')[0];
          } else {
            console.warn(`[getAllBookings] Invalid date detected for booking ID ${row.id}: ${row.date}`);
            // Fallback: keeping original string or set to null
            formattedDate = String(row.date).split('T')[0];
          }
        }

        // Safe decimal parsing
        const parsedPrice = row.totalPrice != null ? parseFloat(row.totalPrice) : 0;

        return {
          ...row,
          // Fallbacks for critical fields to prevent frontend crashes
          userId: row.userId || null,
          productId: row.productId || null,
          productName: row.productName || 'Unknown Product',
          userName: row.userName || 'Unknown User',
          date: formattedDate,
          totalPrice: isNaN(parsedPrice) ? 0 : parsedPrice,
        };
      } catch (mappingError) {
        // 3. Catch mapping errors per row so one bad row doesn't break the whole API
        console.error(`[getAllBookings] Mapping error on row index ${index} (Booking ID ${row?.id}):`, mappingError.message);
        console.error(`[getAllBookings] Problematic Row Data:`, JSON.stringify(row));

        // Return a safe fallback object for this specific row
        return {
          id: row?.id || `error-${index}`,
          productName: 'Data Error',
          userName: 'Data Error',
          date: null,
          totalPrice: 0,
          status: 'ERROR',
        };
      }
    });

    return response(res, 200, false, 'Bookings fetched successfully', formattedRows);
  } catch (error) {
    // 4. Detailed top-level error logging
    console.error('[getAllBookings] Fatal Error:', error.message);
    console.error('[getAllBookings] Stack Trace:', error.stack);

    return response(res, 500, true, 'Failed to fetch bookings. Please try again later.', null);
  }
};

/**
 * Get bookings for the currently logged-in customer.
 * Filters by user_id from session.
 */
const getMyBookings = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return response(res, 401, true, 'Unauthorized', null);
    }

    const [rows] = await db.query(
      `SELECT
    b.id,
    b.user_id as userId,
    b.product_id as productId,
    b.product_name as productName,
    b.user_name as userName,
    b.quantity,
    b.total_price as totalPrice,
    b.date,
    b.start_time as startTime,
    b.end_time as endTime,
    b.status,
    b.external_id as externalId,
    b.payment_url as paymentUrl,
    b.payment_status as paymentStatus,
    b.created_at as createdAt,
    b.original_date as originalDate,
    b.reschedule_count as rescheduleCount,
    p.image_url as productImage,
    (SELECT id FROM reviews WHERE booking_id = b.id LIMIT 1) as reviewId
  FROM bookings b
  LEFT JOIN products p ON b.product_id = p.id
  WHERE b.user_id = ?
  ORDER BY b.created_at DESC`,
      [userId]
    );

    const formattedRows = rows.map(row => ({
      ...row,
      date: row.date ? new Date(row.date).toISOString().split('T')[0] : null,
      totalPrice: parseFloat(row.totalPrice),
      productImage: row.productImage || null,
      // DOKU expired 24 jam dari created_at
      paymentExpiredAt: row.createdAt
        ? new Date(new Date(row.createdAt).getTime() + 24 * 60 * 60 * 1000).toISOString()
        : null,
    }));

    return response(res, 200, false, 'My bookings fetched successfully', formattedRows);
  } catch (error) {
    console.error('Error fetching my bookings:', error);
    return response(res, 500, true, 'Failed to fetch bookings', null);
  }
};

const updateBookingStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Validasi status
  const validStatuses = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'];
  if (!validStatuses.includes(status)) {
    return response(res, 400, true, 'Invalid status. Must be one of: PENDING, CONFIRMED, COMPLETED, CANCELLED', null);
  }

  try {
    // Cek apakah booking exists
    const [rows] = await db.query('SELECT id FROM bookings WHERE id = ?', [id]);

    if (rows.length === 0) {
      return response(res, 404, true, 'Booking not found', null);
    }

    // Update status
    await db.query(
      'UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );

    return response(res, 200, false, `Booking #${id} status updated to ${status}`, { id, status });
  } catch (error) {
    console.error('Error updating booking status:', error);
    return response(res, 500, true, 'Failed to update booking status', null);
  }
};

const cancelMyBooking = async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;

  if (!userId) {
    return response(res, 401, true, 'Unauthorized', null);
  }

  try {
    // Cek booking milik user ini
    const [rows] = await db.query(
      'SELECT id, status, payment_status, external_id, payment_request_id, payment_gateway FROM bookings WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (rows.length === 0) {
      return response(res, 404, true, 'Booking tidak ditemukan', null);
    }

    const booking = rows[0];

    // Hanya bisa cancel jika masih PENDING
    // CONFIRMED sudah diproses agent → tidak bisa cancel sendiri
    if (booking.status !== 'PENDING') {
      return response(res, 400, true,
        booking.status === 'CONFIRMED'
          ? 'Booking sudah dikonfirmasi. Hubungi agen untuk pembatalan.'
          : `Booking tidak dapat dibatalkan (status: ${booking.status})`,
        null
      );
    }

    // Update status ke CANCELLED
    await db.query(
      `UPDATE bookings 
       SET status = 'CANCELLED', payment_status = 'CANCELLED', updated_at = NOW() 
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    // Batalkan tagihan spesifik di Payment Gateway yang digunakan saat checkout
    if (booking.external_id) {
      const latestTransaction = booking.payment_gateway
        ? await PaymentTransaction.findLatestByExternalId(booking.external_id, booking.payment_gateway)
        : null;

      await payment_service.cancelTransaction(
        booking.external_id, 
        booking.payment_gateway, 
        booking.payment_request_id || null,
        latestTransaction?.gateway_invoice_id || null
      );
    }

    return response(res, 200, false, 'Booking berhasil dibatalkan', { id: Number(id), status: 'CANCELLED' });

  } catch (error) {
    console.error('Error cancelling booking:', error);
    return response(res, 500, true, 'Gagal membatalkan booking', null);
  }
};

const rescheduleMyBooking = async (req, res) => {
  const { id } = req.params;
  const { new_date } = req.body;
  const userId = req.user?.id;

  if (!userId) {
    return response(res, 401, true, 'Unauthorized', null);
  }

  if (!new_date) {
    return response(res, 400, true, 'Tanggal baru wajib diisi', null);
  }

  // Validasi format tanggal
  const parsedDate = new Date(new_date);
  if (isNaN(parsedDate.getTime())) {
    return response(res, 400, true, 'Format tanggal tidak valid', null);
  }

  // Tanggal baru harus di masa depan
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsedDate < today) {
    return response(res, 400, true, 'Tanggal baru harus di masa depan', null);
  }

  try {
    const [rows] = await db.query(
      'SELECT id, status, payment_status, date, original_date, reschedule_count FROM bookings WHERE id = ? AND user_id = ?',
      [id, userId]
    );

    if (rows.length === 0) {
      return response(res, 404, true, 'Booking tidak ditemukan', null);
    }

    const booking = rows[0];

    // Hanya booking yang sudah lunas (PAID) dan aktif yang bisa di-reschedule
    if (booking.payment_status !== 'PAID' || booking.status === 'CANCELLED' || booking.status === 'COMPLETED') {
      return response(res, 400, true,
        `Booking tidak dapat di-reschedule. Pastikan pembayaran sudah lunas dan status belum dibatalkan/selesai.`,
        null
      );
    }

    // Maksimal 1x reschedule
    if (booking.reschedule_count >= 1) {
      return response(res, 400, true,
        'Booking ini sudah pernah di-reschedule. Maksimal 1 kali reschedule per booking.',
        null
      );
    }

    // Simpan original_date hanya jika pertama kali reschedule
    const originalDate = booking.original_date || booking.date;

    await db.query(
      `UPDATE bookings 
       SET date = ?, 
           original_date = ?, 
           reschedule_count = reschedule_count + 1, 
           rescheduled_at = NOW(),
           updated_at = NOW() 
       WHERE id = ? AND user_id = ?`,
      [new_date, originalDate, id, userId]
    );

    return response(res, 200, false, 'Booking berhasil di-reschedule', {
      id: Number(id),
      newDate: new_date,
      originalDate: originalDate ? new Date(originalDate).toISOString().split('T')[0] : null,
      rescheduleCount: booking.reschedule_count + 1,
    });

  } catch (error) {
    console.error('Error rescheduling booking:', error);
    return response(res, 500, true, 'Gagal melakukan reschedule booking', null);
  }
};

module.exports = { getAllBookings, updateBookingStatus, getMyBookings, cancelMyBooking, rescheduleMyBooking };
