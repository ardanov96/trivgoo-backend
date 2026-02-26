const BookingLock = require('../models/booking_lock');

/**
 * Helper untuk mengambil identitas owner cart:
 * - Jika user login, gunakan user_id dari req.user (middleware auth)
 * - Jika guest, gunakan cart_token dari body / header
 */
function resolveOwner(req) {
  const userId = req.user?.id || null;
  const cartToken =
    req.body?.cartToken ||
    req.headers['x-cart-token'] ||
    null;

  return { userId, cartToken };
}

// POST /api/v1/cart/lock
// Dipanggil saat user masuk ke halaman Booking/Checkout untuk membuat soft lock (booking timer)
const createBookingLock = async (req, res) => {
  try {
    const { userId, cartToken } = resolveOwner(req);
    const {
      productId,
      quantity = 1,
      startDate = null,
      endDate = null,
      ttlSeconds = 15 * 60,
      metadata = {},
    } = req.body || {};

    if (!productId) {
      return res.status(400).json({
        error: true,
        message: 'productId is required',
      });
    }

    const lock = await BookingLock.createOrRefresh({
      userId,
      cartToken,
      productId,
      quantity,
      startDate,
      endDate,
      ttlSeconds,
      metadata,
    });

    return res.json({
      error: false,
      data: lock,
    });
  } catch (err) {
    console.error('Error creating booking lock:', err);
    return res.status(500).json({
      error: true,
      message: 'Failed to create booking lock',
    });
  }
};

// GET /api/v1/cart/locks
// Mengambil semua soft lock aktif milik user / guest (untuk halaman Cart)
const listActiveLocks = async (req, res) => {
  try {
    const { userId, cartToken } = resolveOwner(req);

    if (!userId && !cartToken) {
      return res.status(400).json({
        error: true,
        message: 'Missing owner identifier (user or cart token)',
      });
    }

    const locks = await BookingLock.listActiveForOwner({ userId, cartToken });

    return res.json({
      error: false,
      data: locks,
    });
  } catch (err) {
    console.error('Error listing booking locks:', err);
    return res.status(500).json({
      error: true,
      message: 'Failed to load booking locks',
    });
  }
};

// GET /api/v1/cart/locks/:id
// Validasi satu lock (digunakan sebelum membuat booking final)
const validateLockById = async (req, res) => {
  try {
    const { id } = req.params;
    const lock = await BookingLock.findActiveById(id);

    if (!lock) {
      return res.status(404).json({
        error: true,
        message: 'Lock not found or expired',
      });
    }

    return res.json({
      error: false,
      data: lock,
    });
  } catch (err) {
    console.error('Error validating booking lock:', err);
    return res.status(500).json({
      error: true,
      message: 'Failed to validate booking lock',
    });
  }
};

module.exports = {
  createBookingLock,
  listActiveLocks,
  validateLockById,
};

