// src/models/car.js
const db = require('../configs/db');

// ── Public ────────────────────────────────────────────────────────────────────

async function list_all_cars() {
  const [rows] = await db.query(`
    SELECT
      id, name, slug, brand, model_year,
      transmission, seats, fuel_type, image, description,
      created_at, updated_at
    FROM cars
    ORDER BY brand ASC, name ASC
  `);
  return rows;
}

async function get_car_by_id(car_id) {
  const [rows] = await db.query(
    `SELECT * FROM cars WHERE id = ? LIMIT 1`,
    [car_id]
  );
  return rows[0] || null;
}

// ── Admin – list with pagination + search ─────────────────────────────────────
// KUNCI FIX: LIMIT dan OFFSET di-interpolasi langsung ke string SQL (bukan ?)
// karena mysql2 execute() strict soal tipe — string "10" ditolak, harus integer.
// db.query() (conn.query) lebih toleran tapi tetap lebih aman pakai interpolasi
// untuk angka yang sudah kita validasi sendiri.

async function admin_list_cars({ page = 1, limit = 10, search = '' } = {}) {
  const _page   = Math.max(1, parseInt(page,  10) || 1);
  const _limit  = Math.min(50, parseInt(limit, 10) || 10);
  const _offset = (_page - 1) * _limit;
  const like    = `%${search}%`;

  const hasSearch = search.length > 0;
  const whereClause = hasSearch
    ? `WHERE name LIKE ? OR brand LIKE ? OR model_year LIKE ?`
    : '';
  const searchParams = hasSearch ? [like, like, like] : [];

  // COUNT
  const [countRows] = await db.query(
    `SELECT COUNT(*) AS total FROM cars ${whereClause}`,
    searchParams
  );
  const total       = countRows[0]?.total ?? 0;
  const total_pages = Math.max(1, Math.ceil(total / _limit));

  // DATA — LIMIT/OFFSET diinterpolasi langsung, bukan sebagai ?
  const [data] = await db.query(
    `SELECT
       id, name, slug, brand, model_year,
       transmission, seats, fuel_type, image, description,
       created_at, updated_at
     FROM cars
     ${whereClause}
     ORDER BY brand ASC, name ASC
     LIMIT ${_limit} OFFSET ${_offset}`,
    searchParams
  );

  return { data, total, total_pages, page: _page };
}

// ── Admin – create ────────────────────────────────────────────────────────────

async function create_car({ name, slug, brand, model_year, transmission, seats, fuel_type, image, description }) {
  const [result] = await db.execute(
    `INSERT INTO cars (name, slug, brand, model_year, transmission, seats, fuel_type, image, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, slug, brand, String(model_year), transmission, parseInt(seats) || 5, fuel_type, image ?? null, description ?? null]
  );
  return get_car_by_id(result.insertId);
}

// ── Admin – update ────────────────────────────────────────────────────────────

async function update_car(car_id, { name, slug, brand, model_year, transmission, seats, fuel_type, image, description }) {
  await db.execute(
    `UPDATE cars
     SET name=?, slug=?, brand=?, model_year=?, transmission=?, seats=?, fuel_type=?, image=?, description=?, updated_at=NOW()
     WHERE id=?`,
    [name, slug, brand, String(model_year), transmission, parseInt(seats) || 5, fuel_type, image ?? null, description ?? null, parseInt(car_id)]
  );
  return get_car_by_id(car_id);
}

// ── Admin – delete ────────────────────────────────────────────────────────────

async function delete_car(car_id) {
  const [result] = await db.execute(
    `DELETE FROM cars WHERE id = ?`,
    [parseInt(car_id)]
  );
  return result.affectedRows > 0;
}

// ── Slug uniqueness check ─────────────────────────────────────────────────────

async function slug_exists(slug, exclude_id = null) {
  const [rows] = exclude_id
    ? await db.query(`SELECT id FROM cars WHERE slug = ? AND id != ? LIMIT 1`, [slug, exclude_id])
    : await db.query(`SELECT id FROM cars WHERE slug = ? LIMIT 1`, [slug]);
  return rows.length > 0;
}

module.exports = {
  list_all_cars,
  get_car_by_id,
  admin_list_cars,
  create_car,
  update_car,
  delete_car,
  slug_exists,
};