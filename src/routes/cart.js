const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cart');

// NOTE:
// Route ini sengaja TIDAK dipasang middleware auth wajib,
// agar bisa digunakan baik oleh user login maupun guest.
// Identitas guest dibedakan dengan cart_token dari header/body.

// Soft lock (booking timer) saat user masuk ke halaman Booking/Checkout
router.post('/lock', cartController.createBookingLock);

// List semua lock aktif untuk owner (digunakan untuk halaman Cart)
router.get('/locks', cartController.listActiveLocks);

// Validasi satu lock by id (opsional untuk finalisasi booking)
router.get('/locks/:id', cartController.validateLockById);

module.exports = router;

