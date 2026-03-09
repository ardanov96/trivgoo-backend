// src/models/promo.js
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

// ── Promo Campaigns ───────────────────────────────────────────────────────────

async function list_campaigns({ q, type, is_active, page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const params = [];
  const conditions = [];

  if (q) {
    conditions.push(`(pc.name LIKE ? OR pc.description LIKE ?)`);
    params.push(`%${q}%`, `%${q}%`);
  }
  if (type) {
    conditions.push(`pc.type = ?`);
    params.push(type);
  }
  if (is_active !== undefined && is_active !== null && is_active !== '') {
    conditions.push(`pc.is_active = ?`);
    params.push(Number(is_active));
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await query(
    `SELECT
       pc.*,
       mt.name AS min_tier_name, mt.color AS min_tier_color,
       COUNT(DISTINCT pcp.id) AS product_count
     FROM promo_campaigns pc
     LEFT JOIN membership_tiers mt ON mt.id = pc.min_tier_id
     LEFT JOIN promo_campaign_products pcp ON pcp.campaign_id = pc.id
     ${where}
     GROUP BY pc.id
     ORDER BY pc.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const count_rows = await query(
    `SELECT COUNT(*) AS total FROM promo_campaigns pc ${where}`,
    params
  );

  const campaigns = rows.map(row => ({
    ...row,
    min_tier: row.min_tier_name
      ? { id: row.min_tier_id, name: row.min_tier_name, color: row.min_tier_color }
      : null,
    product_count: Number(row.product_count),
  }));

  return {
    campaigns,
    meta: {
      total: count_rows[0].total,
      page,
      limit,
      total_pages: Math.ceil(count_rows[0].total / limit),
    },
  };
}

async function get_campaign_by_id(id) {
  const rows = await query(
    `SELECT pc.*, mt.name AS min_tier_name, mt.color AS min_tier_color
     FROM promo_campaigns pc
     LEFT JOIN membership_tiers mt ON mt.id = pc.min_tier_id
     WHERE pc.id = ? LIMIT 1`,
    [id]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    ...row,
    min_tier: row.min_tier_name
      ? { id: row.min_tier_id, name: row.min_tier_name, color: row.min_tier_color }
      : null,
  };
}

async function create_campaign(payload) {
  const result = await query(
    `INSERT INTO promo_campaigns
       (name, slug, description, banner_image, type, discount_type, discount_value,
        max_discount, min_transaction, scope, min_tier_id, starts_at, ends_at,
        max_usage, per_user, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      payload.name,
      payload.slug || payload.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      payload.description ?? null,
      payload.banner_image ?? null,
      payload.type,
      payload.discount_type,
      payload.discount_value,
      payload.max_discount ?? null,
      payload.min_transaction ?? 0,
      payload.scope ?? 'all',
      payload.min_tier_id ?? null,
      payload.starts_at,
      payload.ends_at,
      payload.max_usage ?? null,
      payload.per_user ?? 1,
      payload.is_active ?? 1,
    ]
  );

  // attach scope_ids jika ada
  if (Array.isArray(payload.scope_ids) && payload.scope_ids.length > 0) {
    for (const id of payload.scope_ids) {
      await query(
        `INSERT INTO promo_campaign_products (campaign_id, scope_type, scope_id)
         VALUES (?, ?, ?)`,
        [result.insertId, payload.scope, id]
      );
    }
  }

  return get_campaign_by_id(result.insertId);
}

async function update_campaign(id, payload) {
  const fields = [];
  const values = [];

  const allowed = ['name', 'description', 'banner_image', 'type', 'discount_type',
    'discount_value', 'max_discount', 'min_transaction', 'scope', 'min_tier_id',
    'starts_at', 'ends_at', 'max_usage', 'per_user', 'is_active'];

  for (const key of allowed) {
    if (payload[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(payload[key] === '' ? null : payload[key]);
    }
  }

  if (fields.length > 0) {
    await query(
      `UPDATE promo_campaigns SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`,
      [...values, id]
    );
  }

  // update scope_ids
  if (Array.isArray(payload.scope_ids)) {
    await query(`DELETE FROM promo_campaign_products WHERE campaign_id = ?`, [id]);
    for (const sid of payload.scope_ids) {
      await query(
        `INSERT INTO promo_campaign_products (campaign_id, scope_type, scope_id)
         VALUES (?, ?, ?)`,
        [id, payload.scope ?? 'product', sid]
      );
    }
  }

  return get_campaign_by_id(id);
}

async function delete_campaign(id) {
  await query(`DELETE FROM promo_campaign_products WHERE campaign_id = ?`, [id]);
  const result = await query(`DELETE FROM promo_campaigns WHERE id = ?`, [id]);
  return { affected_rows: result.affectedRows };
}

// ── Analytics ─────────────────────────────────────────────────────────────────

async function get_analytics_summary({ source_type, date_from, date_to } = {}) {
  const params = [];
  const conditions = [];

  if (source_type) {
    conditions.push(`pa.source_type = ?`);
    params.push(source_type);
  }
  if (date_from) {
    conditions.push(`pa.date >= ?`);
    params.push(date_from);
  }
  if (date_to) {
    conditions.push(`pa.date <= ?`);
    params.push(date_to);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await query(
    `SELECT
       pa.source_type,
       pa.source_id,
       CASE
         WHEN pa.source_type = 'voucher'   THEN v.code
         WHEN pa.source_type = 'campaign'  THEN pc.name
         ELSE 'Unknown'
       END AS source_name,
       SUM(pa.impressions)          AS total_impressions,
       SUM(pa.attempts)             AS total_attempts,
       SUM(pa.success_count)        AS total_success,
       SUM(pa.fail_count)           AS total_fail,
       SUM(pa.total_discount_given) AS total_discount_given,
       SUM(pa.total_revenue)        AS total_revenue
     FROM promo_analytics pa
     LEFT JOIN vouchers v       ON v.id  = pa.source_id AND pa.source_type = 'voucher'
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
    conversion_rate: row.total_attempts > 0
      ? Math.round((row.total_success / row.total_attempts) * 10000) / 100
      : 0,
  }));
}

async function get_analytics_daily({ source_type, source_id, date_from, date_to }) {
  const params = [source_type, source_id];
  const conditions = [`pa.source_type = ?`, `pa.source_id = ?`];

  if (date_from) { conditions.push(`pa.date >= ?`); params.push(date_from); }
  if (date_to)   { conditions.push(`pa.date <= ?`); params.push(date_to); }

  return query(
    `SELECT
       DATE_FORMAT(pa.date, '%Y-%m-%d') AS date,
       SUM(pa.impressions)          AS impressions,
       SUM(pa.attempts)             AS attempts,
       SUM(pa.success_count)        AS success_count,
       SUM(pa.fail_count)           AS fail_count,
       SUM(pa.total_discount_given) AS total_discount_given,
       SUM(pa.total_revenue)        AS total_revenue
     FROM promo_analytics pa
     WHERE ${conditions.join(' AND ')}
     GROUP BY DATE_FORMAT(pa.date, '%Y-%m-%d')
     ORDER BY pa.date ASC`,
    params
  );
}

// Helper: catat analytics (dipanggil dari voucher/checkout controller)
async function record_analytics(source_type, source_id, { impressions = 0, attempts = 0, success = 0, fail = 0, discount = 0, revenue = 0 } = {}) {
  const today = new Date().toISOString().split('T')[0];
  await query(
    `INSERT INTO promo_analytics
       (source_type, source_id, date, impressions, attempts, success_count, fail_count, total_discount_given, total_revenue)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
  get_campaign_by_id,
  create_campaign,
  update_campaign,
  delete_campaign,
  get_analytics_summary,
  get_analytics_daily,
  record_analytics,
};