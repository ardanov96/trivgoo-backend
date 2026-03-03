const express = require("express");
const Route = express.Router();
const paymentController = require('../controllers/payment');

Route.post('/create-payment', paymentController.createPayment);

// Midtrans Notification Handler, URL ini harus sama dengan URL yang ada di Midtrans serta bersifat public
Route.post('/notification', paymentController.handleNotification);

module.exports = Route;