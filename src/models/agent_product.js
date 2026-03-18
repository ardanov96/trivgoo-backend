// src/models/agent_product.js  (atau src/models/product.js sesuai nama file kamu)
// FILE LENGKAP — ganti seluruh isi file yang lama dengan ini

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

function resolve_image_url(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const BASE_URL =
    process.env.BASE_URL ||
    process.env.API_URL_DEV ||
    'http://localhost:4000';
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_URL}${cleanPath}`;
}

function safe_parse_json(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); }
  catch { return fallback; }
}

function normalize_image_path(path) {
  if (!path) return null;
  if (!path.startsWith('http://') && !path.startsWith('https://')) return path;
  const BASE_URL =
    process.env.BASE_URL ||
    process.env.API_URL_DEV ||
    'http://localhost:4000';
  try {
    const url = new URL(path);
    return url.pathname.replace(/^\//, '');
  } catch {
    return path;
  }
}

// ── Finders ───────────────────────────────────────────────────────────────────

async function find_product_row_by_id(product_id) {
  const rows = await query(
    `SELECT p.*, u.specialization AS owner_specialization
     FROM products p
     JOIN users u ON u.id = p.owner_id
     WHERE p.id = ?
     LIMIT 1`,
    [product_id],
  );
  return rows[0] || null;
}

async function find_product_images(product_id) {
  const rows = await query(
    `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC`,
    [product_id],
  );
  return rows.map((r) => r.image_url);
}

async function find_product_blocked_dates(product_id) {
  const rows = await query(
    `SELECT DATE_FORMAT(blocked_date, '%Y-%m-%d') AS blocked_date
     FROM product_blocked_dates
     WHERE product_id = ?
     ORDER BY blocked_date ASC`,
    [product_id],
  );
  return rows.map((r) => r.blocked_date);
}

// ── NEW: Voucher helpers ──────────────────────────────────────────────────────

/**
 * Ambil semua voucher yang dilampirkan ke sebuah product.
 */
async function find_product_vouchers(product_id) {
  const rows = await query(
    `SELECT v.*
     FROM product_vouchers pv
     JOIN vouchers v ON v.id = pv.voucher_id
     WHERE pv.product_id = ?
     ORDER BY v.created_at DESC`,
    [product_id],
  );
  return rows;
}

// ── Response builder ──────────────────────────────────────────────────────────

async function build_product_response(row) {
  if (!row) return null;

  const images_raw    = await find_product_images(row.id);
  const blocked_dates = await find_product_blocked_dates(row.id);
  const vouchers      = await find_product_vouchers(row.id);   // ← NEW
  const features      = safe_parse_json(row.features, []);
  const details       = safe_parse_json(row.details, null);
  const specialization = row.owner_specialization ?? null;

  const image  = resolve_image_url(row.image_url);
  const images = images_raw.map((f) => resolve_image_url(f));

  return {
    id:             row.id,
    owner_id:       row.owner_id,
    category_id:    row.category_id,
    name:           row.name,
    description:    row.description,
    price:          Number(row.price),
    currency:       row.currency,
    location:       row.location,
    lat:            row.lat,
    lng:            row.lng,
    image,
    image_url:      image,
    images,
    features,
    details,
    daily_capacity: row.daily_capacity,
    blocked_dates,
    vouchers,           // ← NEW: array voucher objects
    rating:    row.rating ? Number(row.rating) : 0,
    is_active: !!row.is_active,
    created_at: row.created_at,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

async function create_product(payload) {
  const result = await query(
    `INSERT INTO products (
       owner_id, category_id, name, description, price, currency,
       location, image_url, features, details, daily_capacity
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      payload.owner_id,
      payload.category_id,
      payload.name,
      payload.description,
      payload.price,
      payload.currency,
      payload.location,
      normalize_image_path(payload.image_url),
      payload.features ? JSON.stringify(payload.features) : null,
      payload.details  ? JSON.stringify(payload.details)  : null,
      payload.daily_capacity || 10,
    ],
  );

  const product_id = result.insertId;

  if (Array.isArray(payload.images) && payload.images.length > 0) {
    for (let i = 0; i < payload.images.length; i++) {
      await query(
        `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?,?,?)`,
        [product_id, normalize_image_path(payload.images[i]), i],
      );
    }
  }

  if (Array.isArray(payload.blocked_dates) && payload.blocked_dates.length > 0) {
    for (const date of payload.blocked_dates) {
      await query(
        `INSERT IGNORE INTO product_blocked_dates (product_id, blocked_date) VALUES (?,?)`,
        [product_id, date],
      );
    }
  }

  const row = await find_product_row_by_id(product_id);
  return build_product_response(row);
}

async function update_product(product_id, owner_id, payload) {
  const existing = await find_product_row_by_id(product_id);
  if (!existing) return null;

  if (Number(existing.owner_id) !== Number(owner_id)) {
    const err = new Error('Forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }

  await query(
    `UPDATE products SET
       category_id    = ?,
       name           = ?,
       description    = ?,
       price          = ?,
       currency       = ?,
       location       = ?,
       image_url      = ?,
       features       = ?,
       details        = ?,
       daily_capacity = ?,
       updated_at     = CURRENT_TIMESTAMP
     WHERE id = ? AND owner_id = ?`,
    [
      payload.category_id,
      payload.name,
      payload.description,
      payload.price,
      payload.currency,
      payload.location,
      normalize_image_path(payload.image_url),
      payload.features ? JSON.stringify(payload.features) : null,
      payload.details  ? JSON.stringify(payload.details)  : null,
      payload.daily_capacity || 10,
      product_id,
      owner_id,
    ],
  );

  await query(`DELETE FROM product_images WHERE product_id = ?`, [product_id]);
  if (Array.isArray(payload.images) && payload.images.length > 0) {
    for (let i = 0; i < payload.images.length; i++) {
      await query(
        `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?,?,?)`,
        [product_id, normalize_image_path(payload.images[i]), i],
      );
    }
  }

  await query(`DELETE FROM product_blocked_dates WHERE product_id = ?`, [product_id]);
  if (Array.isArray(payload.blocked_dates) && payload.blocked_dates.length > 0) {
    for (const date of payload.blocked_dates) {
      await query(
        `INSERT IGNORE INTO product_blocked_dates (product_id, blocked_date) VALUES (?,?)`,
        [product_id, date],
      );
    }
  }

  const row = await find_product_row_by_id(product_id);
  return build_product_response(row);
}

async function get_product_by_id_for_owner(product_id, owner_id) {
  const row = await find_product_row_by_id(product_id);
  if (!row) return null;
  if (Number(row.owner_id) !== Number(owner_id)) return null;
  return build_product_response(row);
}

async function list_products_by_owner(owner_id) {
  const rows = await query(
    `SELECT
       p.id, p.owner_id, p.category_id, p.name, p.description, p.price,
       p.currency, p.location, p.image_url, p.daily_capacity, p.rating,
       p.is_active, p.created_at,
       u.specialization AS owner_specialization
     FROM products p
     JOIN users u ON u.id = p.owner_id
     WHERE p.owner_id = ?
     ORDER BY p.created_at DESC`,
    [owner_id],
  );

  return rows.map((row) => {
    const resolved = resolve_image_url(row.image_url);
    return {
      id:             row.id,
      owner_id:       row.owner_id,
      category_id:    row.category_id,
      name:           row.name,
      description:    row.description,
      price:          Number(row.price),
      currency:       row.currency,
      location:       row.location,
      image:          resolved,
      image_url:      resolved,
      daily_capacity: row.daily_capacity,
      rating:         row.rating ? Number(row.rating) : 0,
      is_active:      !!row.is_active,
      created_at:     row.created_at,
    };
  });
}

// ── NEW: Voucher CRUD ─────────────────────────────────────────────────────────

/**
 * Ambil semua voucher yang terlampir ke sebuah product.
 * Bisa dipanggil oleh siapa saja (tidak harus owner).
 */
async function get_product_vouchers(product_id) {
  return find_product_vouchers(product_id);
}

/**
 * Set (replace) semua voucher untuk sebuah product.
 * Hanya owner yang boleh mengubah.
 * @param {number} product_id
 * @param {number} owner_id
 * @param {number[]} voucher_ids
 */
async function set_product_vouchers(product_id, owner_id, voucher_ids) {
  // Pastikan product milik owner
  const existing = await find_product_row_by_id(product_id);
  if (!existing) return null;

  if (Number(existing.owner_id) !== Number(owner_id)) {
    const err = new Error('Forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }

  // Hapus semua relasi lama
  await query(`DELETE FROM product_vouchers WHERE product_id = ?`, [product_id]);

  // Insert relasi baru
  if (Array.isArray(voucher_ids) && voucher_ids.length > 0) {
    for (const vid of voucher_ids) {
      const numVid = Number(vid);
      if (!Number.isFinite(numVid) || numVid <= 0) continue;
      await query(
        `INSERT IGNORE INTO product_vouchers (product_id, voucher_id) VALUES (?,?)`,
        [product_id, numVid],
      );
    }
  }

  // Kembalikan daftar voucher terbaru
  return get_product_vouchers(product_id);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  create_product,
  update_product,
  get_product_by_id_for_owner,
  list_products_by_owner,
  get_product_vouchers,     // ← NEW
  set_product_vouchers,     // ← NEW
};