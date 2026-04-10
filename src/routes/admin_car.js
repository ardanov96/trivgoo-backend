// src/routes/admin_car.js
const express    = require('express');
const Route      = express.Router();
const adminCar   = require('../controllers/admin_car');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// All routes require authentication + admin role
Route.use(requireAuth, requireAdmin);

// Image upload (used by the form before saving the car)
Route.post('/upload/car-image', adminCar.upload_car_image);

// Car CRUD
Route.get('/',     adminCar.list_cars);
Route.get('/:id',  adminCar.get_car);
Route.post('/',    adminCar.create_car);
Route.put('/:id',  adminCar.update_car);
Route.delete('/:id', adminCar.delete_car);

module.exports = Route;