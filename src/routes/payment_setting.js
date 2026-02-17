// src/routes/payment_setting.js
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment_setting');

// Ini akan merespon ke POST /api/v1/admin/payment-settings
router.get('/', paymentController.getPaymentSettings);
router.post('/', paymentController.updatePaymentSettings);

module.exports = router;