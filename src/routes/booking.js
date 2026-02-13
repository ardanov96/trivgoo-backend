const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking');
const auth = require('../middleware/auth'); // Pastikan ini ada sesuai folder kamu

// Get all bookings dengan filter/search
router.get('/', auth, bookingController.getAllBookings);

// Update status booking
router.patch('/:id/status', auth, bookingController.updateBookingStatus);

module.exports = router;