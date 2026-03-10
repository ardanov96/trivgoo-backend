// src/models/promo_campaign.js
const db = require('../configs/db');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safe_parse_json(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); }
  catch { return fallback; }
}

function generate_slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim() + '-' + Date.now();
}

function format_campaign(row) {
  if (!row) return null;
  return {
    id:              row.id,
    name:            row.name,
    slug:            row.slug,
    description:     row.description,
    banner_image:    row.banner_image,
    type:            row.type,
    discount_type:   row.discount_type,
    discount_value:  Number(row.discount_value),
    max_discount:    row.max_discount != null ? Number(row.max_discount) : null,
    min_transaction: Number(row.min_transaction),
    scope:           row.scope,
    min_tier_id:     row.min_tier_id,
    min_tier_name:   row.min_tier_name || null,
    starts_at:       row.starts_at,
    ends_at:         row.ends_at,
    max_usage:       row.max_usage != null ? Number(row.max_usage) : null,
    used_count:      Number(row.used_count || 0),
    per_user:        Number(row.per_user),
    is_active:       Number(row.is_active),
    created_by:      row.created_by,
    created_at:      row.created_at,
    updated_at:      row.updated_at,
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * List semua campaign dengan filter opsional
 */
async function list_campaigns({ q, type, active_only, page = 1, limit = 20 } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const params = [];

  let where = 'WHERE 1=1';

  if (q) {
    where += ' AND pc.name LIKE ?';
    params.push(`%${q}%`);
  }
  if (type) {
    where += ' AND pc.type = ?';
    params.push(type);
  }
  if (active_only) {
    where += ' AND pc.is_active = 1 AND pc.starts_at <= NOW() AND pc.ends_at >= NOW()';
  }

  const [rows] = await db.execute(
    `SELECT pc.*, mt.name AS min_tier_name
     FROM promo_campaigns pc
     LEFT JOIN membership_tiers mt ON mt.id = pc.min_tier_id
     ${where}
     ORDER BY pc.created_at DESC
     LIMIT ${Number(limit)} OFFSET ${offset}`,
    params
  );

  const [[countRow]] = await db.execute(
    `SELECT COUNT(*) AS total FROM promo_campaigns pc ${where}`,
    params
  );

  return {
    campaigns: rows.map(format_campaign),
    total: Number(countRow.total),
    page: Number(page),
    limit: Number(limit),
  };
}

/**
 * Ambil campaign yang sedang aktif (untuk homepage)
 */
async function get_active_campaigns() {
  const [rows] = await db.execute(
    `SELECT pc.*, mt.name AS min_tier_name
     FROM promo_campaigns pc
     LEFT JOIN membership_tiers mt ON mt.id = pc.min_tier_id
     WHERE pc.is_active = 1
       AND pc.starts_at <= NOW()
       AND pc.ends_at >= NOW()
     ORDER BY pc.starts_at ASC`
  );
  return rows.map(format_campaign);
}

/**
 * Ambil satu campaign by ID
 */
async function get_campaign_by_id(id) {
  const [[row]] = await db.execute(
    `SELECT pc.*, mt.name AS min_tier_name
     FROM promo_campaigns pc
     LEFT JOIN membership_tiers mt ON mt.id = pc.min_tier_id
     WHERE pc.id = ?
     LIMIT 1`,
    [id]
  );
  if (!row) return null;

  const [scope_items] = await db.execute(
    `SELECT scope_type, scope_id FROM promo_campaign_products WHERE campaign_id = ?`,
    [id]
  );

  return { ...format_campaign(row), scope_items };
}

/**
 * Buat campaign baru
 */
async function create_campaign(payload, created_by = null) {
  const slug = generate_slug(payload.name);

  const result = await db.transaction(async (conn) => {
    const [ins] = await conn.execute(
      `INSERT INTO promo_campaigns
         (name, slug, description, banner_image, type,
          discount_type, discount_value, max_discount, min_transaction,
          scope, min_tier_id, starts_at, ends_at,
          max_usage, per_user, is_active, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        payload.name,
        slug,
        payload.description || null,
        payload.banner_image || null,
        payload.type || 'seasonal',
        payload.discount_type || 'percent',
        Number(payload.discount_value) || 0,
        payload.max_discount != null ? Number(payload.max_discount) : null,
        Number(payload.min_transaction) || 0,
        payload.scope || 'all',
        payload.min_tier_id || null,
        payload.starts_at,
        payload.ends_at,
        payload.max_usage != null ? Number(payload.max_usage) : null,
        payload.per_user != null ? Number(payload.per_user) : 1,
        payload.is_active != null ? Number(payload.is_active) : 1,
        created_by,
      ]
    );

    const campaign_id = ins.insertId;

    // Insert scope items jika scope bukan 'all'
    const scope = payload.scope || 'all';
    if (scope !== 'all' && Array.isArray(payload.scope_ids) && payload.scope_ids.length > 0) {
      for (const sid of payload.scope_ids) {
        await conn.execute(
          `INSERT IGNORE INTO promo_campaign_products (campaign_id, scope_type, scope_id)
           VALUES (?, ?, ?)`,
          [campaign_id, scope, Number(sid)]
        );
      }
    }

    return campaign_id;
  });

  return get_campaign_by_id(result);
}

/**
 * Update campaign
 */
async function update_campaign(id, payload) {
  const existing = await get_campaign_by_id(id);
  if (!existing) return null;

  await db.transaction(async (conn) => {
    const fields = [];
    const values = [];

    const set_field = (col, val) => { fields.push(`${col} = ?`); values.push(val); };

    if (payload.name        !== undefined) set_field('name',            payload.name);
    if (payload.description !== undefined) set_field('description',     payload.description ?? null);
    if (payload.banner_image!== undefined) set_field('banner_image',    payload.banner_image ?? null);
    if (payload.type        !== undefined) set_field('type',            payload.type);
    if (payload.discount_type  !== undefined) set_field('discount_type',   payload.discount_type);
    if (payload.discount_value !== undefined) set_field('discount_value',  Number(payload.discount_value));
    if (payload.max_discount   !== undefined) set_field('max_discount',    payload.max_discount != null ? Number(payload.max_discount) : null);
    if (payload.min_transaction!== undefined) set_field('min_transaction', Number(payload.min_transaction));
    if (payload.scope        !== undefined) set_field('scope',          payload.scope);
    if (payload.min_tier_id  !== undefined) set_field('min_tier_id',    payload.min_tier_id ?? null);
    if (payload.starts_at    !== undefined) set_field('starts_at',      payload.starts_at);
    if (payload.ends_at      !== undefined) set_field('ends_at',        payload.ends_at);
    if (payload.max_usage    !== undefined) set_field('max_usage',      payload.max_usage != null ? Number(payload.max_usage) : null);
    if (payload.per_user     !== undefined) set_field('per_user',       Number(payload.per_user));
    if (payload.is_active    !== undefined) set_field('is_active',      Number(payload.is_active));

    set_field('updated_at', new Date());

    if (fields.length > 0) {
      await conn.execute(
        `UPDATE promo_campaigns SET ${fields.join(', ')} WHERE id = ?`,
        [...values, id]
      );
    }

    // Update scope items
    if (payload.scope !== undefined) {
      await conn.execute(`DELETE FROM promo_campaign_products WHERE campaign_id = ?`, [id]);

      if (payload.scope !== 'all' && Array.isArray(payload.scope_ids) && payload.scope_ids.length > 0) {
        for (const sid of payload.scope_ids) {
          await conn.execute(
            `INSERT IGNORE INTO promo_campaign_products (campaign_id, scope_type, scope_id)
             VALUES (?, ?, ?)`,
            [id, payload.scope, Number(sid)]
          );
        }
      }
    }
  });

  return get_campaign_by_id(id);
}

/**
 * Hapus campaign
 */
async function delete_campaign(id) {
  const [[row]] = await db.execute(`SELECT id FROM promo_campaigns WHERE id = ? LIMIT 1`, [id]);
  if (!row) return false;
  await db.execute(`DELETE FROM promo_campaigns WHERE id = ?`, [id]);
  return true;
}

/**
 * Toggle is_active
 */
async function toggle_campaign(id) {
  const [[row]] = await db.execute(`SELECT id, is_active FROM promo_campaigns WHERE id = ? LIMIT 1`, [id]);
  if (!row) return null;
  const new_active = row.is_active ? 0 : 1;
  await db.execute(`UPDATE promo_campaigns SET is_active = ?, updated_at = NOW() WHERE id = ?`, [new_active, id]);
  return get_campaign_by_id(id);
}

/**
 * Ambil produk yang masuk dalam scope campaign
 */
async function get_products_by_campaign(id) {
  const [[campaign]] = await db.execute(`SELECT scope FROM promo_campaigns WHERE id = ? LIMIT 1`, [id]);
  if (!campaign) return null;

  if (campaign.scope === 'all') {
    const [rows] = await db.execute(
      `SELECT p.id, p.name, p.price, p.currency, p.category_id, p.image_url, p.location
       FROM products p WHERE p.is_active = 1 ORDER BY p.name ASC`
    );
    return rows;
  }

  const [scope_items] = await db.execute(
    `SELECT scope_type, scope_id FROM promo_campaign_products WHERE campaign_id = ?`,
    [id]
  );
  if (!scope_items.length) return [];

  if (campaign.scope === 'category') {
    const cat_ids = scope_items.map((s) => s.scope_id);
    const placeholders = cat_ids.map(() => '?').join(',');
    const [rows] = await db.execute(
      `SELECT p.id, p.name, p.price, p.currency, p.category_id, p.image_url, p.location
       FROM products p
       WHERE p.category_id IN (${placeholders}) AND p.is_active = 1
       ORDER BY p.name ASC`,
      cat_ids
    );
    return rows;
  }

  if (campaign.scope === 'product') {
    const prod_ids = scope_items.map((s) => s.scope_id);
    const placeholders = prod_ids.map(() => '?').join(',');
    const [rows] = await db.execute(
      `SELECT p.id, p.name, p.price, p.currency, p.category_id, p.image_url, p.location
       FROM products p
       WHERE p.id IN (${placeholders}) AND p.is_active = 1
       ORDER BY p.name ASC`,
      prod_ids
    );
    return rows;
  }

  return [];
}

// ─── Analytics ────────────────────────────────────────────────────────────────

async function get_analytics_summary({ source_type, date_from, date_to } = {}) {
  const params = [];
  let where = 'WHERE 1=1';

  if (source_type) { where += ' AND pa.source_type = ?'; params.push(source_type); }
  if (date_from)   { where += ' AND pa.date >= ?';       params.push(date_from); }
  if (date_to)     { where += ' AND pa.date <= ?';       params.push(date_to); }

  const [rows] = await db.execute(
    `SELECT
       pa.source_type,
       pa.source_id,
       CASE
         WHEN pa.source_type = 'voucher'  THEN v.code
         WHEN pa.source_type = 'campaign' THEN pc.name
         ELSE 'Unknown'
       END AS source_name,
       SUM(pa.impressions)          AS total_impressions,
       SUM(pa.attempts)             AS total_attempts,
       SUM(pa.success_count)        AS total_success,
       SUM(pa.fail_count)           AS total_fail,
       SUM(pa.total_discount_given) AS total_discount_given,
       SUM(pa.total_revenue)        AS total_revenue
     FROM promo_analytics pa
     LEFT JOIN vouchers v        ON v.id  = pa.source_id AND pa.source_type = 'voucher'
     LEFT JOIN promo_campaigns pc ON pc.id = pa.source_id AND pa.source_type = 'campaign'
     ${where}
     GROUP BY pa.source_type, pa.source_id
     ORDER BY total_success DESC`,
    params
  );

  return rows.map(row => ({
    ...row,
    total_impressions:    Number(row.total_impressions),
    total_attempts:       Number(row.total_attempts),
    total_success:        Number(row.total_success),
    total_fail:           Number(row.total_fail),
    total_discount_given: Number(row.total_discount_given),
    total_revenue:        Number(row.total_revenue),
    conversion_rate: Number(row.total_attempts) > 0
      ? Math.round((Number(row.total_success) / Number(row.total_attempts)) * 10000) / 100
      : 0,
  }));
}

async function get_analytics_daily({ source_type, source_id, date_from, date_to } = {}) {
  const params = [source_type, Number(source_id)];
  let where = 'WHERE pa.source_type = ? AND pa.source_id = ?';

  if (date_from) { where += ' AND pa.date >= ?'; params.push(date_from); }
  if (date_to)   { where += ' AND pa.date <= ?'; params.push(date_to); }

  const [rows] = await db.execute(
    `SELECT
       DATE_FORMAT(pa.date, '%Y-%m-%d') AS date,
       SUM(pa.impressions)          AS impressions,
       SUM(pa.attempts)             AS attempts,
       SUM(pa.success_count)        AS success_count,
       SUM(pa.fail_count)           AS fail_count,
       SUM(pa.total_discount_given) AS total_discount_given,
       SUM(pa.total_revenue)        AS total_revenue
     FROM promo_analytics pa
     ${where}
     GROUP BY DATE_FORMAT(pa.date, '%Y-%m-%d')
     ORDER BY DATE_FORMAT(pa.date, '%Y-%m-%d') ASC`,
    params
  );

  return rows.map(row => ({
    ...row,
    impressions:          Number(row.impressions),
    attempts:             Number(row.attempts),
    success_count:        Number(row.success_count),
    fail_count:           Number(row.fail_count),
    total_discount_given: Number(row.total_discount_given),
    total_revenue:        Number(row.total_revenue),
  }));
}

async function record_analytics(source_type, source_id, {
  impressions = 0, attempts = 0, success = 0, fail = 0, discount = 0, revenue = 0
} = {}) {
  const today = new Date().toISOString().split('T')[0];
  await db.execute(
    `INSERT INTO promo_analytics
       (source_type, source_id, date, impressions, attempts, success_count, fail_count,
        total_discount_given, total_revenue)
     VALUES (?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       impressions          = impressions          + VALUES(impressions),
       attempts             = attempts             + VALUES(attempts),
       success_count        = success_count        + VALUES(success_count),
       fail_count           = fail_count           + VALUES(fail_count),
       total_discount_given = total_discount_given + VALUES(total_discount_given),
       total_revenue        = total_revenue        + VALUES(total_revenue)`,
    [source_type, source_id, today, impressions, attempts, success, fail, discount, revenue]
  );
}

module.exports = {
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
  record_analytics,
};