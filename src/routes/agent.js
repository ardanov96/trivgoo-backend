const express = require('express');
const Route = express.Router();
const agent = require('../controllers/agent');
const agentProduct = require('../controllers/agent_product');
const userController = require('../controllers/user');

const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload'); 

// VERIFICATION ROUTES
Route.post('/verification', requireAuth, upload.single('idDocument'), agent.submit_verification);
Route.get('/verification', requireAuth, agent.get_my_verification);

// DASHBOARD ROUTES (NEW)
Route.get('/dashboard/stats', requireAuth, agent.get_dashboard_stats);
Route.get('/dashboard/weekly-sales', requireAuth, agent.get_weekly_sales);

// PRODUCT ROUTES
Route.get('/products', requireAuth, agentProduct.list_my_products);
Route.get('/products/:id', requireAuth, agentProduct.get_my_product);
Route.post('/products', requireAuth, agentProduct.create_my_product);
Route.put('/products/:id', requireAuth, agentProduct.update_my_product);
Route.delete('/products/:id/delete', requireAuth, agentProduct.delete_my_product);

// allow agent to enable/disable own listing without removing it
Route.put('/products/:id/status', requireAuth, agentProduct.update_my_product_status);

// PRODUCT IMAGES ROUTES
Route.get('/products/:id/images', requireAuth, agentProduct.list_my_product_images);
Route.post('/products/:id/images', requireAuth, agentProduct.add_my_product_images);
Route.put('/products/:id/images/reorder', requireAuth, agentProduct.reorder_my_product_images);
Route.put('/products/:id/images/:image_id', requireAuth, agentProduct.update_my_product_image);
Route.delete('/products/:id/images/:image_id', requireAuth, agentProduct.delete_my_product_image);

// USER PROFILE ROUTES
Route.put('/profile/update', requireAuth, userController.update_my_profile);

module.exports = Route;