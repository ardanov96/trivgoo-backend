const conn = require('../configs/db');

async function query(sql, params = []) {
  try {
    const [rows] = await conn.execute(sql, params);
    return rows;
  } catch (err) {
    err.message = `${err.message}\nSQL: ${sql}`;
    throw err;
  }
}

async function list_all_cars() {
  return await query(`
    SELECT
      id,
      name,
      slug,
      brand,
      model_year,
      transmission,
      seats,
      fuel_type,
      image,
      description
    FROM cars
    ORDER BY brand ASC, name ASC
  `);
}

async function get_car_by_id(car_id) {
  const rows = await query(
    `SELECT * FROM cars WHERE id = ? LIMIT 1`,
    [car_id]
  );
  return rows[0] || null;
}

module.exports = { list_all_cars, get_car_by_id };