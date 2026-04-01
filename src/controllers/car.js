const misc = require('../helpers/response');
const { list_all_cars, get_car_by_id } = require('../models/car');

const BASE_URL = process.env.BASE_URL || process.env.API_URL_DEV || 'http://localhost:4001'

function format_car(car) {
  if (!car) return null;

  let image = car.image || null;

  if (image) {
    if (image.startsWith('http')) {
      // Sudah full URL — strip jadi path relatif agar resolveImageUrl() di frontend bisa handle
      try {
        image = new URL(image).pathname;
      } catch {
        // biarkan apa adanya
      }
    } else {
      // Path relatif — pastikan diawali /
      image = '/' + image.replace(/^\//, '').replace(/^public\//, '');
    }
  }

  return { ...car, image };
}

async function list_cars(req, res) {
  try {
    const cars = await list_all_cars();
    return misc.response(res, 200, false, 'OK', cars.map(format_car));
  } catch (err) {
    console.error(err);
    return misc.response(res, 500, true, err.message || 'Internal server error');
  }
}

async function get_car(req, res) {
  try {
    const car_id = parseInt(req.params.id, 10);
    if (!car_id) return misc.response(res, 400, true, 'car_id tidak valid');

    const car = await get_car_by_id(car_id);
    if (!car) return misc.response(res, 404, true, 'Car tidak ditemukan');

    return misc.response(res, 200, false, 'OK', format_car(car));
  } catch (err) {
    console.error(err);
    return misc.response(res, 500, true, err.message || 'Internal server error');
  }
}

module.exports = { list_cars, get_car };