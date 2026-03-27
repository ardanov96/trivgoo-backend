const express = require("express");
const Route = express.Router();
const paymentController = require('../controllers/payment');

// Main Checkout Endpoint
Route.post('/create-payment', paymentController.createPayment);

// Split Webhooks (Source of Truth)
Route.post('/webhook/xendit', paymentController.handleXenditWebhook);
Route.post('/webhook/doku', paymentController.handleDokuWebhook);

// Legacy alias to not break existing DOKU integrations
Route.post('/notification', paymentController.handleDokuWebhook);

// Secure confirm-callback
// Previously allowed the frontend to forcefully update status to PAID, which was a huge vulnerability.
// Now acts as a no-op waiting space while the secure backend webhooks do the real DB updates.
Route.post('/confirm-callback', async (req, res) => {
  res.json({ 
    success: true, 
    message: 'Callback received safely. Official sync relies on backend webhooks.' 
  });
});

module.exports = Route;