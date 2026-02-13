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

module.exports = { getAllBookings, updateBookingStatus };