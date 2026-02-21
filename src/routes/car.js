const express = require('express');
const Route = express.Router();
const car = require('../controllers/car');
const { requireAuth } = require('../middleware/auth');

Route.get('/', requireAuth, car.list_cars);
Route.get('/:id', requireAuth, car.get_car);

module.exports = Route;