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
  get_campaign_joined_products,
} = require('../models/promo_campaign');

// ─── Auth helpers ─────────────────────────────────────────────────────────────

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

/**
 * GET /api/v1/promo-campaigns/my-submissions
 * Agent melihat semua produk miliknya yang sudah didaftarkan ke campaign manapun,
 * beserta status flash sale request miliknya.
 */
async function my_submissions(req, res) {
  try {
    const user = get_session_user(req);
    if (!user) return misc.response(res, 401, true, 'Unauthorized');

    const { pool: db } = require('../configs/db');
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (Number(page) - 1) * Number(limit);

    // ── Campaign submissions ──────────────────────────────────────────────────
    const campaign_params = [user.id];
    let campaign_where = 'WHERE p.owner_id = ?';
    if (status) {
      campaign_where += ' AND pcp.status = ?';
      campaign_params.push(status);
    }

    const [campaign_rows] = await db.execute(
      `SELECT
         pcp.id              AS join_id,
         pcp.campaign_id,
         pcp.discount_pct,
         pcp.sale_price,
         pcp.status          AS join_status,
         pcp.joined_at,
         pc.name             AS campaign_name,
         pc.starts_at        AS campaign_starts_at,
         pc.ends_at          AS campaign_ends_at,
         pc.is_active        AS campaign_is_active,
         p.id                AS product_id,
         p.name              AS product_name,
         p.price             AS product_price,
         p.currency          AS product_currency,
         p.image_url         AS product_image
       FROM promo_campaign_products pcp
       JOIN products        p  ON p.id  = pcp.scope_id
       JOIN promo_campaigns pc ON pc.id = pcp.campaign_id
       ${campaign_where}
         AND pcp.scope_type = 'product'
       ORDER BY pcp.joined_at DESC
       LIMIT ${Number(limit)} OFFSET ${offset}`,
      campaign_params
    );

    const [[campaign_count]] = await db.execute(
      `SELECT COUNT(*) AS total
       FROM promo_campaign_products pcp
       JOIN products p ON p.id = pcp.scope_id
       ${campaign_where} AND pcp.scope_type = 'product'`,
      campaign_params
    );

    // ── Flash sale submissions ────────────────────────────────────────────────
    const flash_params = [user.id];
    let flash_where = 'WHERE fsr.agent_id = ?';
    if (status) {
      flash_where += ' AND fsr.status = ?';
      flash_params.push(status);
    }

    const [flash_rows] = await db.execute(
      `SELECT
         fsr.id,
         fsr.product_id,
         fsr.discount_pct,
         fsr.sale_price,
         fsr.status,
         fsr.created_at,
         fsr.updated_at,
         p.name      AS product_name,
         p.price     AS product_price,
         p.currency  AS product_currency,
         p.image_url AS product_image
       FROM flash_sale_requests fsr
       JOIN products p ON p.id = fsr.product_id
       ${flash_where}
       ORDER BY fsr.created_at DESC`,
      flash_params
    );

    return misc.response(res, 200, false, 'OK', {
      campaign_submissions: {
        data: campaign_rows.map(r => ({
          join_id:            r.join_id,
          campaign_id:        r.campaign_id,
          campaign_name:      r.campaign_name,
          campaign_starts_at: r.campaign_starts_at,
          campaign_ends_at:   r.campaign_ends_at,
          campaign_is_active: Number(r.campaign_is_active),
          product_id:         r.product_id,
          product_name:       r.product_name,
          product_price:      Number(r.product_price),
          product_currency:   r.product_currency,
          product_image:      r.product_image,
          discount_pct:       r.discount_pct != null ? Number(r.discount_pct) : null,
          sale_price:         r.sale_price   != null ? Number(r.sale_price)   : null,
          join_status:        r.join_status,
          joined_at:          r.joined_at,
        })),
        meta: {
          total:       Number(campaign_count.total),
          page:        Number(page),
          limit:       Number(limit),
          total_pages: Math.ceil(Number(campaign_count.total) / Number(limit)),
        },
      },
      flash_submissions: flash_rows.map(r => ({
        id:               r.id,
        product_id:       r.product_id,
        product_name:     r.product_name,
        product_price:    Number(r.product_price),
        product_currency: r.product_currency,
        product_image:    r.product_image,
        discount_pct:     Number(r.discount_pct),
        sale_price:       r.sale_price != null ? Number(r.sale_price) : null,
        status:           r.status,
        created_at:       r.created_at,
        updated_at:       r.updated_at,
      })),
    });
  } catch (e) {
    console.error('[promo_campaign.my_submissions]', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

// ─── Admin controllers ────────────────────────────────────────────────────────

/**
 * GET /api/v1/promo-campaigns
 */
async function list_all(req, res) {
  try {
    ensure_admin(req);

    const { q, type, active_only, page, limit } = req.query;
    const result = await list_campaigns({
      q:           q || undefined,
      type:        type || undefined,
      active_only: active_only === '1',
      page:        to_number_or_null(page)  || 1,
      limit:       to_number_or_null(limit) || 20,
    });

    return misc.response(res, 200, false, 'OK', result);
  } catch (e) {
    console.error('[promo_campaign.list_all]', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

/**
 * POST /api/v1/promo-campaigns
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
 * PUT /api/v1/promo-campaigns/:id
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
 * DELETE /api/v1/promo-campaigns/:id
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
 * PATCH /api/v1/promo-campaigns/:id/toggle
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
 * Status awal: 'pending' — menunggu approval admin.
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

    const pct = Number(discount_pct);
    if (!Number.isFinite(pct) || pct <= 0 || pct >= 100) {
      return misc.response(res, 400, true, 'discount_pct harus antara 1–99');
    }

    const campaign = await get_campaign_by_id(campaign_id);
    if (!campaign) return misc.response(res, 404, true, 'Campaign tidak ditemukan');

    const now = new Date();
    if (!campaign.is_active || new Date(campaign.ends_at) < now) {
      return misc.response(res, 400, true, 'Campaign sudah tidak aktif');
    }

    if (campaign.discount_type === 'percent' && pct < Number(campaign.discount_value)) {
      return misc.response(res, 400, true, `Diskon minimal ${campaign.discount_value}% untuk campaign ini`);
    }

    const { pool: db } = require('../configs/db');

    const [[product]] = await db.execute(
      `SELECT id, owner_id, price FROM products WHERE id = ? LIMIT 1`,
      [Number(product_id)]
    );
    if (!product) return misc.response(res, 404, true, 'Produk tidak ditemukan');
    if (product.owner_id !== user.id && user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      return misc.response(res, 403, true, 'Produk bukan milik kamu');
    }

    // Cek apakah sudah ada entry (pending/active) untuk produk ini di campaign ini
    const [[existing]] = await db.execute(
      `SELECT id, status FROM promo_campaign_products
       WHERE campaign_id = ? AND scope_type = 'product' AND scope_id = ?
       LIMIT 1`,
      [campaign_id, Number(product_id)]
    );
    if (existing) {
      const msg = existing.status === 'pending'
        ? 'Produk ini sedang menunggu review admin'
        : existing.status === 'active'
          ? 'Produk ini sudah aktif di campaign ini'
          : 'Produk ini sudah terdaftar di campaign ini';
      return misc.response(res, 409, true, msg);
    }

    const computed_sale_price = sale_price
      ? Number(sale_price)
      : Math.round(Number(product.price) * (1 - pct / 100));

    // Insert dengan status 'pending' — butuh approval admin
    const [ins] = await db.execute(
      `INSERT INTO promo_campaign_products
         (campaign_id, scope_type, scope_id, discount_pct, sale_price, status)
       VALUES (?, 'product', ?, ?, ?, 'pending')`,
      [campaign_id, Number(product_id), pct, computed_sale_price]
    );

    return misc.response(res, 200, false, 'Produk berhasil diajukan ke campaign, menunggu review admin', {
      join_id:      ins.insertId,
      campaign_id,
      product_id:   Number(product_id),
      discount_pct: pct,
      sale_price:   computed_sale_price,
      status:       'pending',
    });
  } catch (e) {
    console.error('[promo_campaign.join_campaign]', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

/**
 * GET /api/v1/promo-campaigns/:id/joined-products  (admin)
 * Query params: page, limit
 */
async function get_joined_products(req, res) {
  try {
    ensure_admin(req);

    const id = Number.parseInt(req.params.id, 10);
    if (!id) return misc.response(res, 400, true, 'id tidak valid');

    const campaign = await get_campaign_by_id(id);
    if (!campaign) return misc.response(res, 404, true, 'Campaign tidak ditemukan');

    const page  = to_number_or_null(req.query.page)  || 1;
    const limit = to_number_or_null(req.query.limit) || 8;

    const result = await get_campaign_joined_products(id, page, limit);

    return misc.response(res, 200, false, 'OK', {
      campaign,
      products: result.products,
      meta:     result.meta,
    });
  } catch (e) {
    console.error('[promo_campaign.get_joined_products]', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

/**
 * PATCH /api/v1/promo-campaigns/:id/joined-products/:join_id  (admin)
 * Admin approve atau reject pengajuan produk ke campaign.
 * Body: { action: 'approve' | 'reject' }
 */
async function review_joined_product(req, res) {
  try {
    ensure_admin(req);

    const campaign_id = Number.parseInt(req.params.id, 10);
    const join_id     = Number.parseInt(req.params.join_id, 10);
    if (!campaign_id || !join_id) return misc.response(res, 400, true, 'id tidak valid');

    const { action } = req.body;
    if (!['approve', 'reject'].includes(action)) {
      return misc.response(res, 400, true, 'action harus approve atau reject');
    }

    const { pool: db } = require('../configs/db');

    const [[row]] = await db.execute(
      `SELECT * FROM promo_campaign_products WHERE id = ? AND campaign_id = ? LIMIT 1`,
      [join_id, campaign_id]
    );
    if (!row) return misc.response(res, 404, true, 'Data tidak ditemukan');
    if (row.status !== 'pending') {
      return misc.response(res, 400, true, `Pengajuan ini sudah diproses (status: ${row.status})`);
    }

    const new_status = action === 'approve' ? 'active' : 'rejected';
    await db.execute(
      `UPDATE promo_campaign_products SET status = ? WHERE id = ?`,
      [new_status, join_id]
    );

    return misc.response(res, 200, false, `Pengajuan berhasil ${action === 'approve' ? 'disetujui' : 'ditolak'}`, {
      join_id,
      campaign_id,
      status: new_status,
    });
  } catch (e) {
    console.error('[promo_campaign.review_joined_product]', e);
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

// ─── Flash Sale controllers ───────────────────────────────────────────────────

/**
 * POST /api/v1/promo-campaigns/flash-sale
 * Agent mengajukan flash sale mandiri (tanpa join campaign).
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

/**
 * GET /api/v1/promo-campaigns/flash-sale-requests  (admin)
 */
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
         ap.name      AS product_name,
         ap.price     AS product_price,
         ap.currency  AS product_currency,
         ap.image_url AS product_image,
         u.name       AS agent_name
       FROM flash_sale_requests fsr
       JOIN products ap ON ap.id = fsr.product_id
       JOIN users    u  ON u.id  = fsr.agent_id
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
        total:       Number(countRow.total),
        page:        Number(page),
        limit:       Number(limit),
        total_pages: Math.ceil(Number(countRow.total) / Number(limit)),
      },
    });
  } catch (e) {
    console.error('[list_flash_sale_requests]', e);
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/**
 * PATCH /api/v1/promo-campaigns/flash-sale-requests/:id  (admin)
 */
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

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  get_active,
  get_one,
  get_campaign_products,
  get_joined_products,
  review_joined_product,
  my_submissions,
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