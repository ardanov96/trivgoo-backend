const db = require('../configs/db');
const { response } = require('../helpers/response');
const payment_service = require('../services/payment_service');

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
      sql += ` AND (id LIKE ? OR user_name LIKE ? OR product_name LIKE ?)`;
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    sql += ` ORDER BY created_at DESC`;

    const [rows] = await db.query(sql, params);

    // Format data agar sesuai dengan frontend
    const formattedRows = rows.map(row => ({
      ...row,
      // Pastikan date dalam format YYYY-MM-DD
      date: row.date ? new Date(row.date).toISOString().split('T')[0] : null,
      // Convert decimal ke float
      totalPrice: parseFloat(row.totalPrice)
    }));

    return response(res, 200, false, 'Bookings fetched successfully', formattedRows);
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return response(res, 500, true, 'Failed to fetch bookings', null);
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
    b.status,
    b.external_id as externalId,
    b.payment_url as paymentUrl,
    b.payment_status as paymentStatus,
    b.created_at as createdAt,
    b.original_date as originalDate,
    b.reschedule_count as rescheduleCount,
    p.image_url as productImage
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
      'SELECT id, status, payment_status, external_id, payment_request_id FROM bookings WHERE id = ? AND user_id = ?',
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
 
    // Batalkan juga tagihan di Payment Gateway
    if (booking.external_id) {
      // Kirim payment_request_id (UUID transaksi asli) agar DOKU dapat memverifikasi pembatalan
      await payment_service.cancelTransaction(booking.external_id, booking.payment_request_id || null);
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