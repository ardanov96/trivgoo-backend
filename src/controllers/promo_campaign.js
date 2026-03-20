// src/controllers/promo_campaign.js
const misc = require('../helpers/response');
const {
  list_campaigns,
  get_active_campaigns,
  get_campaign_by_id,
  create_campaign,
  update_campaign,
  delete_campaign,
  toggle_campaign,
  get_products_by_campaign,
  get_analytics_summary,
  get_analytics_daily,
} = require('../models/promo_campaign');

// ─── Auth helpers (sama persis dengan pola agent_products.js) ────────────────

function get_session_user(req) {
  return req?.session?.user || null;
}

function ensure_admin(req) {
  const user = get_session_user(req);
  if (!user) {
    const err = new Error('Unauthorized');
    err.status_code = 401;
    throw err;
  }
  if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
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

// ─── Public controllers ───────────────────────────────────────────────────────

/**
 * GET /api/v1/promo-campaigns/active
 * Dipanggil homepage untuk banner & flash sale section
 */
async function get_active(req, res) {
  try {
    const campaigns = await get_active_campaigns();
    return misc.response(res, 200, false, 'OK', { campaigns });
  } catch (e) {
    console.error('[promo_campaign.get_active]', e);
    return misc.response(res, 500, true, e.message || 'Internal server error');
  }
}

/**
 * GET /api/v1/promo-campaigns/:id
 */
async function get_one(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!id) return misc.response(res, 400, true, 'id tidak valid');

    const campaign = await get_campaign_by_id(id);
    if (!campaign) return misc.response(res, 404, true, 'Campaign tidak ditemukan');

    return misc.response(res, 200, false, 'OK', { campaign });
  } catch (e) {
    console.error('[promo_campaign.get_one]', e);
    return misc.response(res, 500, true, e.message || 'Internal server error');
  }
}

/**
 * GET /api/v1/promo-campaigns/:id/products
 */
async function get_campaign_products(req, res) {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!id) return misc.response(res, 400, true, 'id tidak valid');

    const products = await get_products_by_campaign(id);
    if (products === null) return misc.response(res, 404, true, 'Campaign tidak ditemukan');

    return misc.response(res, 200, false, 'OK', { products });
  } catch (e) {
    console.error('[promo_campaign.get_campaign_products]', e);
    return misc.response(res, 500, true, e.message || 'Internal server error');
  }
}

// ─── Admin controllers ────────────────────────────────────────────────────────

/**
 * GET /api/v1/admin/promo-campaigns
 */
async function list_all(req, res) {
  try {
    ensure_admin(req);

    const { q, type, active_only, page, limit } = req.query;
    const result = await list_campaigns({
      q: q || undefined,
      type: type || undefined,
      active_only: active_only === '1',
      page: to_number_or_null(page) || 1,
      limit: to_number_or_null(limit) || 20,
    });

    return misc.response(res, 200, false, 'OK', result);
  } catch (e) {
    console.error('[promo_campaign.list_all]', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

/**
 * POST /api/v1/admin/promo-campaigns
 */
async function create(req, res) {
  try {
    const user = ensure_admin(req);

    const {
      name, description, type,
      discount_type, discount_value,
      max_discount, min_transaction,
      scope, scope_ids,
      min_tier_id, starts_at, ends_at,
      max_usage, per_user, is_active,
      banner_image,
    } = req.body;

    if (!name || !starts_at || !ends_at) {
      return misc.response(res, 400, true, 'name, starts_at, dan ends_at wajib diisi');
    }
    if (discount_value == null || isNaN(Number(discount_value))) {
      return misc.response(res, 400, true, 'discount_value wajib berupa angka');
    }

    const campaign = await create_campaign(
      {
        name, description, type,
        discount_type, discount_value,
        max_discount, min_transaction,
        scope, scope_ids,
        min_tier_id, starts_at, ends_at,
        max_usage, per_user, is_active,
        banner_image,
      },
      user.id
    );

    return misc.response(res, 201, false, 'Campaign berhasil dibuat', { campaign });
  } catch (e) {
    console.error('[promo_campaign.create]', e);
    if (e.code === 'ER_DUP_ENTRY') {
      return misc.response(res, 409, true, 'Nama campaign sudah digunakan');
    }
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

/**
 * PUT /api/v1/admin/promo-campaigns/:id
 */
async function update(req, res) {
  try {
    ensure_admin(req);

    const id = Number.parseInt(req.params.id, 10);
    if (!id) return misc.response(res, 400, true, 'id tidak valid');

    const campaign = await update_campaign(id, req.body);
    if (!campaign) return misc.response(res, 404, true, 'Campaign tidak ditemukan');

    return misc.response(res, 200, false, 'Campaign diperbarui', { campaign });
  } catch (e) {
    console.error('[promo_campaign.update]', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

/**
 * DELETE /api/v1/admin/promo-campaigns/:id
 */
async function remove(req, res) {
  try {
    ensure_admin(req);

    const id = Number.parseInt(req.params.id, 10);
    if (!id) return misc.response(res, 400, true, 'id tidak valid');

    const deleted = await delete_campaign(id);
    if (!deleted) return misc.response(res, 404, true, 'Campaign tidak ditemukan');

    return misc.response(res, 200, false, 'Campaign berhasil dihapus');
  } catch (e) {
    console.error('[promo_campaign.remove]', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

/**
 * PATCH /api/v1/admin/promo-campaigns/:id/toggle
 */
async function toggle(req, res) {
  try {
    ensure_admin(req);

    const id = Number.parseInt(req.params.id, 10);
    if (!id) return misc.response(res, 400, true, 'id tidak valid');

    const campaign = await toggle_campaign(id);
    if (!campaign) return misc.response(res, 404, true, 'Campaign tidak ditemukan');

    return misc.response(res, 200, false, 'Status campaign diperbarui', { campaign });
  } catch (e) {
    console.error('[promo_campaign.toggle]', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}


/**
 * POST /api/v1/promo-campaigns/:id/join
 * Agent mendaftarkan produknya ke campaign tertentu.
 * Body: { product_id, discount_pct, sale_price }
 */
async function join_campaign(req, res) {
  try {
    const user = get_session_user(req);
    if (!user) return misc.response(res, 401, true, 'Unauthorized');
 
    const campaign_id = Number.parseInt(req.params.id, 10);
    if (!campaign_id) return misc.response(res, 400, true, 'campaign_id tidak valid');
 
    const { product_id, discount_pct, sale_price } = req.body;
 
    if (!product_id || !discount_pct) {
      return misc.response(res, 400, true, 'product_id dan discount_pct wajib diisi');
    }
 
    // Cek campaign masih aktif
    const campaign = await get_campaign_by_id(campaign_id);
    if (!campaign) return misc.response(res, 404, true, 'Campaign tidak ditemukan');
 
    const now = new Date();
    if (!campaign.is_active || new Date(campaign.ends_at) < now) {
      return misc.response(res, 400, true, 'Campaign sudah tidak aktif');
    }
 
    // Validasi min diskon (jika campaign tipe percent)
    if (campaign.discount_type === 'percent' && Number(discount_pct) < Number(campaign.discount_value)) {
      return misc.response(res, 400, true, `Diskon minimal ${campaign.discount_value}% untuk campaign ini`);
    }
 
    // Simpan ke tabel promo_campaign_products (scope = product)
    const { pool: db } = require('../configs/db');
    await db.execute(
      `INSERT IGNORE INTO promo_campaign_products (campaign_id, scope_type, scope_id)
       VALUES (?, 'product', ?)`,
      [campaign_id, Number(product_id)]
    );
 
    // Opsional: simpan juga discount override ke tabel khusus jika ada
    // Untuk sementara cukup insert ke pivot table
    return misc.response(res, 200, false, 'Produk berhasil didaftarkan ke campaign', {
      campaign_id,
      product_id: Number(product_id),
      discount_pct: Number(discount_pct),
      sale_price: sale_price ? Number(sale_price) : null,
    });
  } catch (e) {
    console.error('[promo_campaign.join_campaign]', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

// ─── Analytics controllers ────────────────────────────────────────────────────

/** GET /api/v1/promo-campaigns/analytics/summary */
async function analytics_summary(req, res) {
  try {
    ensure_admin(req);
    const { source_type, date_from, date_to } = req.query;
    const data = await get_analytics_summary({ source_type, date_from, date_to });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /api/v1/promo-campaigns/analytics/daily */
async function analytics_daily(req, res) {
  try {
    ensure_admin(req);
    const { source_type, source_id, date_from, date_to } = req.query;
    if (!source_type || !source_id)
      return misc.response(res, 400, true, 'source_type dan source_id wajib diisi');
    const data = await get_analytics_daily({
      source_type, source_id: Number(source_id), date_from, date_to,
    });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/**
 * POST /api/v1/promo-campaigns/flash-sale
 * Agent membuat flash sale mandiri untuk produknya sendiri
 * (tanpa harus join campaign yang sudah ada).
 * Body: { product_id, discount_pct, sale_price }
 */
async function flash_sale(req, res) {
  try {
    const user = get_session_user(req);
    if (!user) return misc.response(res, 401, true, 'Unauthorized');

    const { product_id, discount_pct, sale_price } = req.body;
    if (!product_id || !discount_pct) {
      return misc.response(res, 400, true, 'product_id dan discount_pct wajib diisi');
    }

    const pct = Number(discount_pct);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      return misc.response(res, 400, true, 'discount_pct harus antara 1–99');
    }

    const { pool: db } = require('../configs/db');

    // Cek apakah sudah ada request pending untuk produk ini
    const [[existing]] = await db.execute(
      `SELECT id FROM flash_sale_requests WHERE product_id = ? AND status = 'pending' LIMIT 1`,
      [Number(product_id)]
    );
    if (existing) {
      return misc.response(res, 409, true, 'Produk ini sudah memiliki request flash sale yang pending');
    }

    const [ins] = await db.execute(
      `INSERT INTO flash_sale_requests (product_id, agent_id, discount_pct, sale_price, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [Number(product_id), user.id, pct, sale_price ? Number(sale_price) : null]
    );

    return misc.response(res, 200, false, 'Flash sale berhasil diajukan', {
      id:           ins.insertId,
      product_id:   Number(product_id),
      discount_pct: pct,
      sale_price:   sale_price ? Number(sale_price) : null,
      status:       'pending',
    });
  } catch (e) {
    console.error('[promo_campaign.flash_sale]', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

async function list_flash_sale_requests(req, res) {
  try {
    ensure_admin(req);
    const { pool: db } = require('../configs/db');
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    let where = 'WHERE 1=1';
    const params = [];
    if (status) { where += ' AND fsr.status = ?'; params.push(status); }

    const [rows] = await db.execute(
      `SELECT
        fsr.*,
        ap.name       AS product_name,
        ap.price      AS product_price,
        ap.currency   AS product_currency,
        ap.image_url  AS product_image,
        u.name        AS agent_name
      FROM flash_sale_requests fsr
      JOIN products ap ON ap.id = fsr.product_id
      JOIN users u ON u.id = fsr.agent_id
      ${where}
      ORDER BY fsr.created_at DESC
      LIMIT ${Number(limit)} OFFSET ${offset}`,
      params
    );

    const [[countRow]] = await db.execute(
      `SELECT COUNT(*) AS total FROM flash_sale_requests fsr ${where}`,
      params
    );

    return misc.response(res, 200, false, 'OK', {
      data: rows,
      meta: {
        total: Number(countRow.total),
        page: Number(page),
        limit: Number(limit),
        total_pages: Math.ceil(Number(countRow.total) / Number(limit)),
      },
    });
  } catch (e) {
    console.error('[list_flash_sale_requests]', e);
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

async function update_flash_sale_request(req, res) {
  try {
    ensure_admin(req);
    const { pool: db } = require('../configs/db');
    const id = Number(req.params.id);
    const { action } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return misc.response(res, 400, true, 'action harus approve atau reject');
    }

    const [[row]] = await db.execute(
      `SELECT * FROM flash_sale_requests WHERE id = ? LIMIT 1`, [id]
    );
    if (!row) return misc.response(res, 404, true, 'Request tidak ditemukan');
    if (row.status !== 'pending') {
      return misc.response(res, 400, true, 'Request ini sudah diproses');
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await db.execute(
      `UPDATE flash_sale_requests SET status = ?, updated_at = NOW() WHERE id = ?`,
      [newStatus, id]
    );

    return misc.response(res, 200, false, `Request ${newStatus}`, { id, status: newStatus });
  } catch (e) {
    console.error('[update_flash_sale_request]', e);
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

module.exports = {
  get_active,
  get_one,
  get_campaign_products,
  list_all,
  create,
  update,
  remove,
  toggle,
  join_campaign,
  flash_sale, 
  list_flash_sale_requests,
  update_flash_sale_request,
  analytics_summary,
  analytics_daily,
};