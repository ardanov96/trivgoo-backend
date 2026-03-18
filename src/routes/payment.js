const express = require("express");
const Route = express.Router();
const paymentController = require('../controllers/payment');
const { execute } = require('../configs/db');

Route.post('/create-payment', paymentController.createPayment);

// DOKU Notification Handler, URL ini harus sama dengan URL callback DOKU serta bersifat public
Route.post('/notification', paymentController.handleNotification);

Route.post('/confirm-callback', async (req, res) => {
  try {
    const { invoice_number, status } = req.body;
    if (invoice_number && status === 'SUCCESS') {
      await execute(
        `UPDATE bookings SET status = 'CONFIRMED', payment_status = 'PAID', updated_at = NOW() WHERE external_id = ?`,
        [invoice_number]
      );
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[confirm-callback] Error:', e.message); res.json({ success: false, message: e.message });
  }
});

module.exports = Route;