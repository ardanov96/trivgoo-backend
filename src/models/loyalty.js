// src/models/loyalty.js
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

// ── Point Balance ─────────────────────────────────────────────────────────────

async function get_point_balance(user_id) {
  const rows = await query(
    `SELECT balance, lifetime_earned, lifetime_spent, lifetime_expired
     FROM point_balances WHERE user_id = ? LIMIT 1`,
    [user_id]
  );
  if (rows[0]) return rows[0];
  // Buat row baru jika belum ada
  await query(
    `INSERT INTO point_balances (user_id, balance, lifetime_earned, lifetime_spent, lifetime_expired)
     VALUES (?, 0, 0, 0, 0)
     ON DUPLICATE KEY UPDATE user_id = user_id`,
    [user_id]
  );
  return { balance: 0, lifetime_earned: 0, lifetime_spent: 0, lifetime_expired: 0 };
}

async function upsert_point_balance(user_id, delta_balance, delta_earned = 0, delta_spent = 0, delta_expired = 0) {
  await query(
    `INSERT INTO point_balances (user_id, balance, lifetime_earned, lifetime_spent, lifetime_expired)
     VALUES (?, GREATEST(0, ?), ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       balance          = GREATEST(0, balance + ?),
       lifetime_earned  = lifetime_earned  + ?,
       lifetime_spent   = lifetime_spent   + ?,
       lifetime_expired = lifetime_expired + ?`,
    [
      user_id,
      delta_balance, delta_earned, delta_spent, delta_expired,
      delta_balance, delta_earned, delta_spent, delta_expired,
    ]
  );
}

// ── Point Transactions ────────────────────────────────────────────────────────

async function get_point_transactions(user_id, { page = 1, limit = 10, type } = {}) {
  const offset = (page - 1) * limit;
  const params = [user_id];
  let where_extra = '';

  if (type) {
    where_extra = ' AND type = ?';
    params.push(type);
  }

  const rows = await query(
    `SELECT id, type, points, balance_after, ref_type, ref_id, note, expires_at, created_at
     FROM point_transactions
     WHERE user_id = ?${where_extra}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const count_rows = await query(
    `SELECT COUNT(*) AS total FROM point_transactions WHERE user_id = ?${where_extra}`,
    params
  );

  return {
    transactions: rows,
    meta: {
      total: count_rows[0].total,
      page,
      limit,
      total_pages: Math.ceil(count_rows[0].total / limit),
    },
  };
}

async function create_point_transaction(user_id, { type, points, balance_after, ref_type = null, ref_id = null, note = null, expires_at = null }) {
  const result = await query(
    `INSERT INTO point_transactions
       (user_id, type, points, balance_after, ref_type, ref_id, note, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [user_id, type, points, balance_after, ref_type, ref_id, note, expires_at]
  );
  return result.insertId;
}

// ── Membership Tiers ──────────────────────────────────────────────────────────

async function get_all_tiers() {
  return query(
    `SELECT id, name, slug, description, icon, color, min_spending, min_points,
            discount_percent, point_multiplier, max_discount_per_order, level, is_active
     FROM membership_tiers
     WHERE is_active = 1
     ORDER BY level ASC`
  );
}

async function get_all_tiers_admin() {
  return query(
    `SELECT id, name, slug, description, icon, color, min_spending, min_points,
            discount_percent, point_multiplier, max_discount_per_order, level, is_active
     FROM membership_tiers
     ORDER BY level ASC`
  );
}

async function get_tier_by_id(id) {
  const rows = await query(
    `SELECT * FROM membership_tiers WHERE id = ? LIMIT 1`, [id]
  );
  return rows[0] || null;
}

async function create_tier(payload) {
  const result = await query(
    `INSERT INTO membership_tiers
       (name, slug, description, icon, color, min_spending, min_points,
        discount_percent, point_multiplier, max_discount_per_order, level, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      payload.name, payload.slug, payload.description ?? null,
      payload.icon ?? null, payload.color ?? null,
      payload.min_spending ?? 0, payload.min_points ?? 0,
      payload.discount_percent ?? 0, payload.point_multiplier ?? 1,
      payload.max_discount_per_order ?? null,
      payload.level ?? 0, payload.is_active ?? 1,
    ]
  );
  return get_tier_by_id(result.insertId);
}

async function update_tier(id, payload) {
  const fields = [];
  const values = [];

  const allowed = ['name', 'slug', 'description', 'icon', 'color', 'min_spending',
    'min_points', 'discount_percent', 'point_multiplier', 'max_discount_per_order',
    'level', 'is_active'];

  for (const key of allowed) {
    if (payload[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(payload[key]);
    }
  }

  if (fields.length === 0) return get_tier_by_id(id);

  await query(
    `UPDATE membership_tiers SET ${fields.join(', ')} WHERE id = ?`,
    [...values, id]
  );
  return get_tier_by_id(id);
}

async function delete_tier(id) {
  const result = await query(
    `DELETE FROM membership_tiers WHERE id = ?`, [id]
  );
  return { affected_rows: result.affectedRows };
}

// ── User Membership ───────────────────────────────────────────────────────────

async function get_user_membership(user_id) {
  const rows = await query(
    `SELECT um.*, mt.name AS tier_name, mt.slug AS tier_slug,
            mt.color AS tier_color, mt.description AS tier_description,
            mt.icon AS tier_icon, mt.discount_percent, mt.point_multiplier,
            mt.max_discount_per_order, mt.level AS tier_level,
            mt.min_spending, mt.min_points
     FROM user_memberships um
     JOIN membership_tiers mt ON mt.id = um.tier_id
     WHERE um.user_id = ? LIMIT 1`,
    [user_id]
  );
  return rows[0] || null;
}

async function upsert_user_membership(user_id, tier_id) {
  await query(
    `INSERT INTO user_memberships (user_id, tier_id, tier_achieved_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE tier_id = ?, tier_achieved_at = NOW()`,
    [user_id, tier_id, tier_id]
  );
}

async function get_user_total_spending(user_id) {
  const rows = await query(
    `SELECT COALESCE(SUM(total_price), 0) AS total
     FROM bookings
     WHERE user_id = ? AND status IN ('CONFIRMED', 'COMPLETED')`,
    [user_id]
  );
  return Number(rows[0]?.total ?? 0);
}

// Hitung tier yang sesuai berdasarkan spending & points
async function resolve_tier_for_user(user_id) {
  const spending = await get_user_total_spending(user_id);
  const balance_row = await get_point_balance(user_id);
  const total_points = Number(balance_row.lifetime_earned ?? 0);

  const tiers = await query(
    `SELECT * FROM membership_tiers WHERE is_active = 1 ORDER BY level DESC`
  );

  for (const tier of tiers) {
    if (spending >= Number(tier.min_spending) && total_points >= Number(tier.min_points)) {
      return tier;
    }
  }

  // Kembalikan tier terendah (level 0)
  return tiers[tiers.length - 1] || null;
}

// ── Point Redemptions ─────────────────────────────────────────────────────────

async function get_redemptions(user_id) {
  return query(
    `SELECT pr.*, v.code AS voucher_code
     FROM point_redemptions pr
     LEFT JOIN vouchers v ON v.id = pr.voucher_id
     WHERE pr.user_id = ?
     ORDER BY pr.created_at DESC`,
    [user_id]
  );
}

async function create_redemption(user_id, { redemption_type, points_spent, voucher_id = null, voucher_value = null, order_id = null, discount_amount = null, expires_at = null }) {
  const result = await query(
    `INSERT INTO point_redemptions
       (user_id, points_spent, redemption_type, voucher_id, voucher_value, order_id, discount_amount, status, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [user_id, points_spent, redemption_type, voucher_id, voucher_value, order_id, discount_amount, expires_at]
  );
  const rows = await query(
    `SELECT pr.*, v.code AS voucher_code
     FROM point_redemptions pr
     LEFT JOIN vouchers v ON v.id = pr.voucher_id
     WHERE pr.id = ? LIMIT 1`,
    [result.insertId]
  );
  return rows[0] || null;
}

// ── Referral ──────────────────────────────────────────────────────────────────

async function get_referral_code_by_user(user_id) {
  const rows = await query(
    `SELECT rc.*, u.name AS referrer_name
     FROM referral_codes rc
     JOIN users u ON u.id = rc.user_id
     WHERE rc.user_id = ? LIMIT 1`,
    [user_id]
  );
  return rows[0] || null;
}

async function create_referral_code(user_id, code) {
  await query(
    `INSERT INTO referral_codes
       (user_id, code, referrer_points, referee_points, referee_discount, is_active)
     VALUES (?, ?, 50, 50, null, 1)`,
    [user_id, code]
  );
  return get_referral_code_by_user(user_id);
}

async function get_referral_stats_admin({ q, page = 1, limit = 20 } = {}) {
  const offset = (page - 1) * limit;
  const params = [];
  let where = '';

  if (q) {
    where = `WHERE u.name LIKE ? OR u.email LIKE ? OR rc.code LIKE ?`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const rows = await query(
    `SELECT
       u.id AS user_id, u.name AS user_name, u.email AS user_email,
       rc.code AS referral_code,
       COUNT(ru.id) AS total_uses,
       COUNT(CASE WHEN ru.referrer_rewarded = 1 THEN 1 END) AS total_rewarded,
       COALESCE(SUM(CASE WHEN ru.referrer_rewarded = 1 THEN rc.referrer_points ELSE 0 END), 0) AS total_points_given
     FROM referral_codes rc
     JOIN users u ON u.id = rc.user_id
     LEFT JOIN referral_usages ru ON ru.referral_code_id = rc.id
     ${where}
     GROUP BY rc.id, u.id, u.name, u.email, rc.code
     ORDER BY total_uses DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  const count_rows = await query(
    `SELECT COUNT(DISTINCT rc.id) AS total
     FROM referral_codes rc
     JOIN users u ON u.id = rc.user_id
     ${where}`,
    params
  );

  return {
    stats: rows,
    meta: {
      total: count_rows[0].total,
      page,
      limit,
      total_pages: Math.ceil(count_rows[0].total / limit),
    },
  };
}

module.exports = {
  // balance
  get_point_balance,
  upsert_point_balance,
  // transactions
  get_point_transactions,
  create_point_transaction,
  // tiers
  get_all_tiers,
  get_all_tiers_admin,
  get_tier_by_id,
  create_tier,
  update_tier,
  delete_tier,
  // membership
  get_user_membership,
  upsert_user_membership,
  get_user_total_spending,
  resolve_tier_for_user,
  // redemptions
  get_redemptions,
  create_redemption,
  // referral
  get_referral_code_by_user,
  create_referral_code,
  get_referral_stats_admin,
};