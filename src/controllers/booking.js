const db = require('../configs/db');
const { response } = require('../helpers/response');

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
                status  
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
      'SELECT id, status, payment_status FROM bookings WHERE id = ? AND user_id = ?',
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
 
    return response(res, 200, false, 'Booking berhasil dibatalkan', { id: Number(id), status: 'CANCELLED' });
 
  } catch (error) {
    console.error('Error cancelling booking:', error);
    return response(res, 500, true, 'Gagal membatalkan booking', null);
  }
};

module.exports = { getAllBookings, updateBookingStatus, getMyBookings, cancelMyBooking };