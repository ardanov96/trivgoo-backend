const express = require('express');
const Route = express.Router();
const userController = require('../controllers/user');
// Assuming requireAuth middleware exists and is in helpers or middleware
// In TRIVGOO it's usually inside src/helpers/auth.js or similar
const { requireAuth } = require('../middleware/auth');

// Endpoint untuk menyimpan FCM Token bagi pengguna yang sudah login
Route.post('/fcm-token', requireAuth, userController.save_fcm_token);

module.exports = Route;
