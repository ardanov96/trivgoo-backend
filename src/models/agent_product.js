// src/models/agent_product.js

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

function normalize_image_path(path) {
  if (!path) return null;
  if (!path.startsWith('http://') && !path.startsWith('https://')) {
    return '/' + path.replace(/^\/+/, '');
  }
  try {
    const url = new URL(path);
    return '/' + url.pathname.replace(/^\/+/, '');
  } catch {
    return '/' + path.replace(/^https?:\/\/[^/]+\/?/, '').replace(/^\/+/, '');
  }
}

function resolve_image_url(path) {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const BASE_URL =
    process.env.BASE_URL ||
    process.env.API_URL_DEV ||
    'http://localhost:4000';
  const cleanBase = BASE_URL.replace(/\/+$/, '');
  const cleanPath = '/' + path.replace(/^\/+/, '');
  return `${cleanBase}${cleanPath}`;
}

function safe_parse_json(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); }
  catch { return fallback; }
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

// ── Voucher helpers ───────────────────────────────────────────────────────────

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
  const vouchers      = await find_product_vouchers(row.id);
  const features      = safe_parse_json(row.features, []);
  const details       = safe_parse_json(row.details, null);

  // ── Delivery config: parse dari JSON column ─────────────────────────────
  const delivery_config = safe_parse_json(row.delivery_config, null);
  // ────────────────────────────────────────────────────────────────────────

  const image  = resolve_image_url(row.image_url);
  const images = images_raw.map((f) => ({ url: resolve_image_url(f) }));

  return {
    id:              row.id,
    owner_id:        row.owner_id,
    category_id:     row.category_id,
    name:            row.name,
    description:     row.description,
    price:           Number(row.price),
    currency:        row.currency,
    location:        row.location,
    lat:             row.lat,
    lng:             row.lng,
    image,
    image_url:       image,
    images,
    features,
    details,
    daily_capacity:  row.daily_capacity,
    blocked_dates,
    vouchers,
    delivery_config, // ← field baru, null jika belum diset
    rating:          row.rating ? Number(row.rating) : 0,
    is_active:       !!row.is_active,
    created_at:      row.created_at,
    // SEO fields
    seo_title:       row.seo_title       || null,
    seo_description: row.seo_description || null,
    seo_slug:        row.seo_slug        || null,
    seo_keyword:     row.seo_keyword     || null,
    seo_canonical:   row.seo_canonical   || null,
    seo_og_image:    row.seo_og_image    || null,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

async function create_product(payload) {
  // delivery_config hanya relevan untuk transport (category_id 3),
  // tapi tidak salah menyimpannya untuk kategori lain sebagai NULL.
  const delivery_config_json = payload.delivery_config
    ? JSON.stringify(payload.delivery_config)
    : null;

  const result = await query(
    `INSERT INTO products (
       owner_id, category_id, name, description, price, currency,
       location, image_url, features, details, daily_capacity,
       lat, lng,
       seo_title, seo_description, seo_slug, seo_keyword, seo_canonical, seo_og_image,
       delivery_config
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
      payload.lat  || null,
      payload.lng  || null,
      payload.seo_title        || null,
      payload.seo_description  || null,
      payload.seo_slug         || null,
      payload.seo_keyword      || null,
      payload.seo_canonical    || null,
      payload.seo_og_image     || null,
      delivery_config_json,
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

  const delivery_config_json = payload.delivery_config
    ? JSON.stringify(payload.delivery_config)
    : null;

  await query(
    `UPDATE products SET
       category_id     = ?,
       name            = ?,
       description     = ?,
       price           = ?,
       currency        = ?,
       location        = ?,
       image_url       = ?,
       features        = ?,
       details         = ?,
       daily_capacity  = ?,
       lat             = ?,
       lng             = ?,
       seo_title       = ?,
       seo_description = ?,
       seo_slug        = ?,
       seo_keyword     = ?,
       seo_canonical   = ?,
       seo_og_image    = ?,
       delivery_config = ?,
       updated_at      = CURRENT_TIMESTAMP
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
      payload.lat  || null,
      payload.lng  || null,
      payload.seo_title        || null,
      payload.seo_description  || null,
      payload.seo_slug         || null,
      payload.seo_keyword      || null,
      payload.seo_canonical    || null,
      payload.seo_og_image     || null,
      delivery_config_json,
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

// ── Voucher CRUD ──────────────────────────────────────────────────────────────

async function get_product_vouchers(product_id) {
  return find_product_vouchers(product_id);
}

async function set_product_vouchers(product_id, owner_id, voucher_ids) {
  const existing = await find_product_row_by_id(product_id);
  if (!existing) return null;

  if (Number(existing.owner_id) !== Number(owner_id)) {
    const err = new Error('Forbidden');
    err.code = 'FORBIDDEN';
    throw err;
  }

  await query(`DELETE FROM product_vouchers WHERE product_id = ?`, [product_id]);

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

  return get_product_vouchers(product_id);
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  create_product,
  update_product,
  get_product_by_id_for_owner,
  list_products_by_owner,
  get_product_vouchers,
  set_product_vouchers,
};