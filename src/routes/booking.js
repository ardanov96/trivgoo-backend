const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking');
const { requireAuth } = require('../middleware/auth');

// Get bookings for logged-in customer
router.get('/my', requireAuth, bookingController.getMyBookings);

// Get all bookings dengan filter/search (admin)
router.get('/', requireAuth, bookingController.getAllBookings);

// Update status booking
router.patch('/:id/status', requireAuth, bookingController.updateBookingStatus);

// Cancel booking
router.patch('/:id/cancel', requireAuth, bookingController.cancelMyBooking);

module.exports = router;