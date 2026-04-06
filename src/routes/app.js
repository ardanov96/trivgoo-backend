const express = require('express');
const Route = express.Router();

const appAuth = require('../controllers/app_auth');
const appCarRental = require('../controllers/app_car_rental');
const { require_app_auth } = require('../middleware/app_auth');

Route.post('/auth/login', appAuth.login);
Route.get('/auth/me', require_app_auth, appAuth.me);
Route.post('/auth/refresh', appAuth.refresh);

Route.get('/lookups/car-rental-filters', appCarRental.filters);
Route.get('/car-rentals', appCarRental.list);
Route.get('/car-rentals/:id', appCarRental.detail);

module.exports = Route;
