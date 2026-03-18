// src/controllers/agent_product.js
// FILE LENGKAP — ganti seluruh isi file yang lama dengan ini

const misc = require('../helpers/response');
const {
  create_product,
  update_product,
  get_product_by_id_for_owner,
  list_products_by_owner,
  get_product_vouchers,       // ← NEW
  set_product_vouchers,       // ← NEW
  add_product_image_for_owner,
  update_product_image_for_owner,
  list_product_images_for_owner,
  reorder_product_images_for_owner,
  delete_product_for_owner,
  set_product_active_for_owner,
} = require('../models/product');

// ── Helpers ───────────────────────────────────────────────────────────────────

function get_session_user(req) {
  return req?.session?.user || null;
}

function ensure_agent(req) {
  const user = get_session_user(req);
  if (!user) {
    const err = new Error('Unauthorized');
    err.status_code = 401;
    throw err;
  }
  if (user.role !== 'AGENT') {
    const err = new Error('Forbidden');
    err.status_code = 403;
    throw err;
  }
  return user;
}

function to_number_or_null(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function to_number_or_default(v, def) {
  const n = to_number_or_null(v);
  return n === null ? def : n;
}

function ensure_array(v) {
  return Array.isArray(v) ? v : [];
}

// ── Product CRUD ──────────────────────────────────────────────────────────────

async function list_my_products(req, res) {
  try {
    const user = ensure_agent(req);
    const data = await list_products_by_owner(user.id);
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

async function get_my_product(req, res) {
  try {
    const user = ensure_agent(req);
    const product_id = Number.parseInt(req.params.id, 10);
    if (!product_id) return misc.response(res, 400, true, 'product_id tidak valid');

    const product = await get_product_by_id_for_owner(product_id, user.id);
    if (!product) return misc.response(res, 404, true, 'Product tidak ditemukan');

    return misc.response(res, 200, false, 'OK', product);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

async function create_my_product(req, res) {
  try {
    const user = ensure_agent(req);

    const {
      category_id, name, description, price, currency, location,
      image_url, images, features, details, daily_capacity, blocked_dates, lat, lng,
    } = req.body;

    if (!category_id || !name || !description || price == null || !currency || !location) {
      return misc.response(res, 400, true, 'Field wajib belum lengkap');
    }

    const payload = {
      owner_id:       user.id,
      category_id:    Number(category_id),
      name:           String(name).trim(),
      description:    String(description).trim(),
      price:          Number(price),
      currency:       String(currency).trim(),
      location:       String(location).trim(),
      image_url,
      images,
      features,
      details,
      daily_capacity: to_number_or_default(daily_capacity, 10),
      blocked_dates,
      lat,
      lng,
    };

    const product = await create_product(payload);
    return misc.response(res, 201, false, 'Product created', product);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

async function update_my_product(req, res) {
  try {
    const user = ensure_agent(req);
    const product_id = req.params.id;
    if (!product_id) return misc.response(res, 400, true, 'product_id tidak valid');

    const payload = {
      owner_id:       user.id,
      category_id:    Number(req.body?.category_id),
      name:           req.body?.name,
      description:    req.body?.description,
      price:          Number(req.body?.price),
      currency:       req.body?.currency,
      location:       req.body?.location,
      image_url:      req.body?.image_url,
      images:         req.body?.images,
      features:       req.body?.features,
      details:        req.body?.details,
      daily_capacity: to_number_or_default(req.body?.daily_capacity, 10),
      blocked_dates:  req.body?.blocked_dates,
      lat:            req.body?.lat,
      lng:            req.body?.lng,
    };

    const product = await update_product(product_id, user.id, payload);
    if (!product) return misc.response(res, 404, true, 'Product tidak ditemukan');

    return misc.response(res, 200, false, 'Product updated', product);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

async function delete_my_product(req, res) {
  try {
    const user = ensure_agent(req);
    const product_id = Number.parseInt(req.params.id, 10);
    if (!product_id) return misc.response(res, 400, true, 'product_id tidak valid');

    const result = await delete_product_for_owner(product_id, user.id);
    if (!result || !result.affected_rows) return misc.response(res, 404, true, 'Product tidak ditemukan');

    return misc.response(res, 200, false, 'Product deleted');
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || (e.code === 'FORBIDDEN' ? 403 : 500), true, e.message || 'Internal server error');
  }
}

async function update_my_product_status(req, res) {
  try {
    const user = ensure_agent(req);
    const product_id = Number.parseInt(req.params.id, 10);
    if (!product_id) return misc.response(res, 400, true, 'product_id tidak valid');

    let { is_active } = req.body;
    if (typeof is_active === 'string') is_active = is_active === '1' || is_active === 'true';
    if (typeof is_active !== 'boolean') return misc.response(res, 400, true, 'is_active field wajib boolean');

    const result = await set_product_active_for_owner(product_id, user.id, is_active);
    if (!result || !result.affected_rows) return misc.response(res, 404, true, 'Product tidak ditemukan');

    const updated = await get_product_by_id_for_owner(product_id, user.id);
    return misc.response(res, 200, false, 'Product status updated', updated);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || (e.code === 'FORBIDDEN' ? 403 : 500), true, e.message || 'Internal server error');
  }
}

// ── NEW: Voucher endpoints ────────────────────────────────────────────────────

/**
 * GET /agent/products/:id/vouchers
 * Ambil daftar voucher yang terlampir ke product milik agent ini.
 */
async function list_my_product_vouchers(req, res) {
  try {
    const user       = ensure_agent(req);
    const product_id = Number.parseInt(req.params.id, 10);
    if (!product_id) return misc.response(res, 400, true, 'product_id tidak valid');

    // Pastikan product milik agent ini
    const product = await get_product_by_id_for_owner(product_id, user.id);
    if (!product) return misc.response(res, 404, true, 'Product tidak ditemukan');

    const vouchers = await get_product_vouchers(product_id);
    return misc.response(res, 200, false, 'OK', vouchers);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || (e.code === 'FORBIDDEN' ? 403 : 500), true, e.message || 'Internal server error');
  }
}

/**
 * PUT /agent/products/:id/vouchers
 * Body: { voucher_ids: number[] }
 * Replace semua voucher yang terlampir ke product.
 */
async function set_my_product_vouchers(req, res) {
  try {
    const user       = ensure_agent(req);
    const product_id = Number.parseInt(req.params.id, 10);
    if (!product_id) return misc.response(res, 400, true, 'product_id tidak valid');

    const voucher_ids = Array.isArray(req.body?.voucher_ids)
      ? req.body.voucher_ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
      : [];

    const vouchers = await set_product_vouchers(product_id, user.id, voucher_ids);
    if (vouchers === null) return misc.response(res, 404, true, 'Product tidak ditemukan');

    return misc.response(res, 200, false, 'Vouchers updated', vouchers);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || (e.code === 'FORBIDDEN' ? 403 : 500), true, e.message || 'Internal server error');
  }
}

// ── Image endpoints (tidak berubah) ──────────────────────────────────────────

async function list_my_product_images(req, res) {
  try {
    const user = ensure_agent(req);
    const product_id = Number.parseInt(req.params.id, 10);
    if (!product_id) return misc.response(res, 400, true, 'product_id tidak valid');
    const images = await list_product_images_for_owner(product_id, user.id);
    return misc.response(res, 200, false, 'OK', images);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

async function add_my_product_images(req, res) {
  try {
    const user = ensure_agent(req);
    const product_id = Number.parseInt(req.params.id, 10);
    if (!product_id) return misc.response(res, 400, true, 'product_id tidak valid');

    if (Array.isArray(req.body?.images)) {
      await add_product_images_bulk_for_owner(product_id, user.id, req.body.images);
    } else {
      const { image_url, sort_order } = req.body || {};
      if (!image_url) return misc.response(res, 400, true, 'image_url wajib diisi');
      await add_product_image_for_owner(product_id, user.id, {
        image_url,
        sort_order: to_number_or_default(sort_order, 0),
      });
    }

    const images = await list_product_images_for_owner(product_id, user.id);
    return misc.response(res, 201, false, 'Product images added', images);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

async function update_my_product_image(req, res) {
  try {
    const user = ensure_agent(req);
    const product_id = Number.parseInt(req.params.id, 10);
    const image_id   = Number.parseInt(req.params.image_id, 10);
    if (!product_id) return misc.response(res, 400, true, 'product_id tidak valid');
    if (!image_id)   return misc.response(res, 400, true, 'image_id tidak valid');

    const payload = {};
    if (typeof req.body?.image_url  !== 'undefined') payload.image_url  = req.body.image_url;
    if (typeof req.body?.sort_order !== 'undefined') payload.sort_order = to_number_or_null(req.body.sort_order);

    if (Object.keys(payload).length === 0) return misc.response(res, 400, true, 'Tidak ada field yang diupdate');

    const result = await update_product_image_for_owner(product_id, user.id, image_id, payload);
    if (!result?.affected_rows) return misc.response(res, 404, true, 'Image tidak ditemukan');

    const images = await list_product_images_for_owner(product_id, user.id);
    return misc.response(res, 200, false, 'Product image updated', images);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

async function delete_my_product_image(req, res) {
  try {
    const user = ensure_agent(req);
    const product_id = Number.parseInt(req.params.id, 10);
    const image_id   = Number.parseInt(req.params.image_id, 10);
    if (!product_id) return misc.response(res, 400, true, 'product_id tidak valid');
    if (!image_id)   return misc.response(res, 400, true, 'image_id tidak valid');

    const result = await delete_product_image_for_owner(product_id, user.id, image_id);
    if (!result?.affected_rows) return misc.response(res, 404, true, 'Image tidak ditemukan');

    const images = await list_product_images_for_owner(product_id, user.id);
    return misc.response(res, 200, false, 'Product image deleted', images);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

async function reorder_my_product_images(req, res) {
  try {
    const user = ensure_agent(req);
    const product_id = Number.parseInt(req.params.id, 10);
    if (!product_id) return misc.response(res, 400, true, 'product_id tidak valid');

    const order = ensure_array(req.body?.order).map((x) => ({
      id:         to_number_or_null(x?.id),
      sort_order: to_number_or_null(x?.sort_order),
    }));

    if (order.length === 0) return misc.response(res, 400, true, 'order kosong / invalid');

    await reorder_product_images_for_owner(product_id, user.id, order);
    const images = await list_product_images_for_owner(product_id, user.id);
    return misc.response(res, 200, false, 'Product images reordered', images);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  list_my_products,
  get_my_product,
  create_my_product,
  update_my_product,
  delete_my_product,
  update_my_product_status,

  list_my_product_vouchers,   // ← NEW
  set_my_product_vouchers,    // ← NEW

  list_my_product_images,
  add_my_product_images,
  update_my_product_image,
  delete_my_product_image,
  reorder_my_product_images,
};