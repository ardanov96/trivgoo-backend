const express = require('express');
const Route = express.Router();
const agent = require('../controllers/agent');
const agentProduct = require('../controllers/agent_product');
const userController = require('../controllers/user');

const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// VERIFICATION ROUTES
Route.post('/verification', requireAuth, upload.fields([{ name: 'idDocument', maxCount: 1 }, { name: 'skDocument', maxCount: 1 }]), agent.submit_verification);
Route.get('/verification', requireAuth, agent.get_my_verification);

// DASHBOARD ROUTES
Route.get('/dashboard/stats', requireAuth, agent.get_dashboard_stats);
Route.get('/dashboard/weekly-sales', requireAuth, agent.get_weekly_sales);

// BOOKING MANAGEMENT ROUTES
Route.get('/bookings', requireAuth, agent.get_my_bookings);
Route.get('/bookings/:id', requireAuth, agent.get_my_booking_detail);
Route.patch('/bookings/:id/status', requireAuth, agent.update_my_booking_status);

// CUSTOMER MANAGEMENT (CRM) ROUTES
Route.get('/customers', requireAuth, agent.get_my_customers);

// PRODUCT ROUTES
Route.get('/products', requireAuth, agentProduct.list_my_products);
Route.post('/products', requireAuth, agentProduct.create_my_product);

// VOUCHER ROUTES
Route.get('/products/:id/vouchers', requireAuth, agentProduct.list_my_product_vouchers);
Route.put('/products/:id/vouchers', requireAuth, agentProduct.set_my_product_vouchers);

Route.get('/products/:id/images', requireAuth, agentProduct.list_my_product_images);
Route.post('/products/:id/images', requireAuth, agentProduct.add_my_product_images);
Route.put('/products/:id/images/reorder', requireAuth, agentProduct.reorder_my_product_images);
Route.put('/products/:id/images/:image_id', requireAuth, agentProduct.update_my_product_image);
Route.delete('/products/:id/images/:image_id', requireAuth, agentProduct.delete_my_product_image);

Route.get('/products/:id', requireAuth, agentProduct.get_my_product);
Route.put('/products/:id', requireAuth, agentProduct.update_my_product);
Route.delete('/products/:id/delete', requireAuth, agentProduct.delete_my_product);
Route.put('/products/:id/status', requireAuth, agentProduct.update_my_product_status);

// USER PROFILE ROUTES
Route.put('/profile/update', requireAuth, userController.update_my_profile);

// SETTINGS & CONFIGURATION ROUTES (ENTERPRISE)
Route.get('/profile/settings', requireAuth, agent.get_profile_settings);
Route.put('/profile', requireAuth, upload.single('avatar'), agent.update_profile_details);
Route.put('/password', requireAuth, agent.update_password);
Route.post('/bank/request-change', requireAuth, agent.request_bank_change);

const reviewController = require('../controllers/review');

// RATING & REVIEW ROUTES
Route.get('/rating/summary', requireAuth, reviewController.get_agent_rating_summary);
Route.get('/rating/reviews', requireAuth, reviewController.get_agent_reviews);
Route.post('/rating/reviews/:id/reply', requireAuth, reviewController.reply_to_review);
Route.post('/rating/reviews/:id/flag', requireAuth, reviewController.flag_review);

module.exports = Route;