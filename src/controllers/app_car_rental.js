const { success, failure } = require('../helpers/app_response');
const {
  list_car_rentals,
  get_car_rental_detail,
  get_car_rental_filters,
} = require('../models/app_car_rental');

async function list(req, res) {
  try {
    const result = await list_car_rentals(req.query || {});
    return success(res, {
      data: result.data,
      meta: result.meta,
    });
  } catch (err) {
    console.error('[APP CAR RENTAL LIST] error:', err);
    return failure(res, {
      status: 500,
      message: 'Failed to load car rentals',
      code: 'CAR_RENTAL_LIST_FAILED',
    });
  }
}

async function detail(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!id) {
      return failure(res, {
        status: 400,
        message: 'id tidak valid',
        code: 'VALIDATION_ERROR',
      });
    }

    const data = await get_car_rental_detail(id, req.query || {});
    if (!data) {
      return failure(res, {
        status: 404,
        message: 'Car rental tidak ditemukan',
        code: 'CAR_RENTAL_NOT_FOUND',
      });
    }

    return success(res, { data });
  } catch (err) {
    console.error('[APP CAR RENTAL DETAIL] error:', err);
    return failure(res, {
      status: 500,
      message: 'Failed to load car rental detail',
      code: 'CAR_RENTAL_DETAIL_FAILED',
    });
  }
}

async function filters(req, res) {
  try {
    const data = await get_car_rental_filters();
    return success(res, { data });
  } catch (err) {
    console.error('[APP CAR RENTAL FILTERS] error:', err);
    return failure(res, {
      status: 500,
      message: 'Failed to load car rental filters',
      code: 'CAR_RENTAL_FILTERS_FAILED',
    });
  }
}

module.exports = {
  list,
  detail,
  filters,
};
