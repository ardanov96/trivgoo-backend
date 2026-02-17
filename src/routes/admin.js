const express = require('express');
const Route = express.Router();

const admin = require('../controllers/admin');
const bookingController = require('../controllers/booking');
const paymentSettingRoutes = require('./payment_setting');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Route.use(requireAuth, requireAdmin);

Route.get('/users/agents', admin.list_agents);
Route.get('/users/customers', admin.list_customers);
Route.post('/agents/:user_id/verification', admin.update_agent_verification);
Route.get('/agents/products', admin.list_agent_products);
Route.get('/agents/products/:product_id', admin.get_agent_product_detail);
Route.get('/bookings', bookingController.getAllBookings);
Route.patch('/bookings/:id/status', bookingController.updateBookingStatus);
Route.get('/dashboard/summary', admin.dashboard_summary);
Route.use('/payment-settings', paymentSettingRoutes);

module.exports = Route;
