// src/models/loyalty.js
const db = require('../configs/db');

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt_tier(row) {
  if (!row) return null;
  return {
    id:                   row.id,
    name:                 row.name,
    slug:                 row.slug,
    description:          row.description,
    icon:                 row.icon,
    color:                row.color,
    min_spending:         Number(row.min_spending),
    min_points:           Number(row.min_points),
    discount_percent:     Number(row.discount_percent),
    point_multiplier:     Number(row.point_multiplier),
    max_discount_per_order: row.max_discount_per_order != null ? Number(row.max_discount_per_order) : null,
    level:                Number(row.level),
    is_active:            Number(row.is_active),
  };
}

function fmt_balance(row) {
  if (!row) return null;
  return {
    balance:          Number(row.balance),
    lifetime_earned:  Number(row.lifetime_earned),
    lifetime_spent:   Number(row.lifetime_spent),
    lifetime_expired: Number(row.lifetime_expired),
  };
}

function fmt_transaction(row) {
  if (!row) return null;
  return {
    id:            row.id,
    type:          row.type,
    points:        Number(row.points),
    balance_after: Number(row.balance_after),
    ref_type:      row.ref_type,
    ref_id:        row.ref_id,
    note:          row.note,
    expires_at:    row.expires_at,
    created_at:    row.created_at,
  };
}

function fmt_redemption(row) {
  if (!row) return null;
  return {
    id:               row.id,
    points_spent:     Number(row.points_spent),
    redemption_type:  row.redemption_type,
    voucher_id:       row.voucher_id,
    voucher_value:    row.voucher_value != null ? Number(row.voucher_value) : null,
    voucher_code:     row.voucher_code || null,
    order_id:         row.order_id,
    discount_amount:  row.discount_amount != null ? Number(row.discount_amount) : null,
    status:           row.status,
    expires_at:       row.expires_at,
    created_at:       row.created_at,
  };
}

// ─── Membership Tiers ─────────────────────────────────────────────────────────

async function get_all_tiers() {
  const [rows] = await db.execute(
    `SELECT * FROM membership_tiers WHERE is_active = 1 ORDER BY level ASC`
  );
  return rows.map(fmt_tier);
}

async function get_tier_by_id(id) {
  const [[row]] = await db.execute(
    `SELECT * FROM membership_tiers WHERE id = ? LIMIT 1`, [id]
  );
  return fmt_tier(row);
}

// Admin CRUD
async function list_tiers_admin() {
  const [rows] = await db.execute(`SELECT * FROM membership_tiers ORDER BY level ASC`);
  return rows.map(fmt_tier);
}

async function create_tier(payload) {
  const [res] = await db.execute(
    `INSERT INTO membership_tiers
       (name, slug, description, icon, color, min_spending, min_points,
        discount_percent, point_multiplier, max_discount_per_order, level, is_active)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      payload.name,
      payload.slug || payload.name.toLowerCase().replace(/\s+/g, '-'),
      payload.description || null,
      payload.icon || null,
      payload.color || null,
      Number(payload.min_spending) || 0,
      Number(payload.min_points) || 0,
      Number(payload.discount_percent) || 0,
      Number(payload.point_multiplier) || 1,
      payload.max_discount_per_order != null ? Number(payload.max_discount_per_order) : null,
      Number(payload.level) || 1,
      payload.is_active != null ? Number(payload.is_active) : 1,
    ]
  );
  return get_tier_by_id(res.insertId);
}

async function update_tier(id, payload) {
  const fields = [], values = [];
  const sf = (col, val) => { fields.push(`${col} = ?`); values.push(val); };

  if (payload.name               !== undefined) sf('name',                   payload.name);
  if (payload.slug               !== undefined) sf('slug',                   payload.slug);
  if (payload.description        !== undefined) sf('description',            payload.description ?? null);
  if (payload.icon               !== undefined) sf('icon',                   payload.icon ?? null);
  if (payload.color              !== undefined) sf('color',                  payload.color ?? null);
  if (payload.min_spending       !== undefined) sf('min_spending',           Number(payload.min_spending));
  if (payload.min_points         !== undefined) sf('min_points',             Number(payload.min_points));
  if (payload.discount_percent   !== undefined) sf('discount_percent',       Number(payload.discount_percent));
  if (payload.point_multiplier   !== undefined) sf('point_multiplier',       Number(payload.point_multiplier));
  if (payload.max_discount_per_order !== undefined) sf('max_discount_per_order', payload.max_discount_per_order != null ? Number(payload.max_discount_per_order) : null);
  if (payload.level              !== undefined) sf('level',                  Number(payload.level));
  if (payload.is_active          !== undefined) sf('is_active',              Number(payload.is_active));

  if (!fields.length) return get_tier_by_id(id);
  sf('updated_at', new Date());
  await db.execute(`UPDATE membership_tiers SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
  return get_tier_by_id(id);
}

async function delete_tier(id) {
  const [[row]] = await db.execute(`SELECT id FROM membership_tiers WHERE id = ? LIMIT 1`, [id]);
  if (!row) return false;
  await db.execute(`DELETE FROM membership_tiers WHERE id = ?`, [id]);
  return true;
}

// ─── User Membership ──────────────────────────────────────────────────────────

async function get_user_membership(user_id) {
  // Ambil membership user
  const [[mem]] = await db.execute(
    `SELECT um.*, mt.name AS tier_name, mt.slug AS tier_slug, mt.description AS tier_description,
            mt.icon AS tier_icon, mt.color AS tier_color,
            mt.min_spending AS tier_min_spending, mt.min_points AS tier_min_points,
            mt.discount_percent, mt.point_multiplier, mt.max_discount_per_order,
            mt.level AS tier_level
     FROM user_memberships um
     JOIN membership_tiers mt ON mt.id = um.tier_id
     WHERE um.user_id = ?
     LIMIT 1`,
    [user_id]
  );

  if (!mem) return null;

  // Ambil tier berikutnya
  const [[next_tier]] = await db.execute(
    `SELECT * FROM membership_tiers
     WHERE level > ? AND is_active = 1
     ORDER BY level ASC LIMIT 1`,
    [mem.tier_level]
  );

  const spending = Number(mem.total_spending);
  const progress_percent = next_tier
    ? Math.min(100, Math.round((spending / Number(next_tier.min_spending)) * 100))
    : 100;
  const spending_to_next = next_tier
    ? Math.max(0, Number(next_tier.min_spending) - spending)
    : 0;

  return {
    tier: {
      id:                     mem.tier_id,
      name:                   mem.tier_name,
      slug:                   mem.tier_slug,
      description:            mem.tier_description,
      icon:                   mem.tier_icon,
      color:                  mem.tier_color,
      min_spending:           Number(mem.tier_min_spending),
      min_points:             Number(mem.tier_min_points),
      discount_percent:       Number(mem.discount_percent),
      point_multiplier:       Number(mem.point_multiplier),
      max_discount_per_order: mem.max_discount_per_order != null ? Number(mem.max_discount_per_order) : null,
      level:                  Number(mem.tier_level),
    },
    total_spending:      spending,
    total_points_earned: Number(mem.total_points_earned),
    tier_achieved_at:    mem.tier_achieved_at,
    tier_expires_at:     mem.tier_expires_at,
    next_tier:           next_tier ? fmt_tier(next_tier) : null,
    progress_percent,
    spending_to_next,
  };
}

// Admin: list semua user membership
async function list_user_memberships({ page = 1, limit = 20, tier_id, q } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const params = [];
  let where = 'WHERE 1=1';

  if (tier_id) { where += ' AND um.tier_id = ?'; params.push(tier_id); }
  if (q)       { where += ' AND (u.name LIKE ? OR u.email LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }

  const [rows] = await db.execute(
    `SELECT um.*, u.name AS user_name, u.email AS user_email,
            mt.name AS tier_name, mt.slug AS tier_slug, mt.color AS tier_color, mt.icon AS tier_icon
     FROM user_memberships um
     JOIN users u  ON u.id  = um.user_id
     JOIN membership_tiers mt ON mt.id = um.tier_id
     ${where}
     ORDER BY um.total_spending DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );

  const [[countRow]] = await db.execute(
    `SELECT COUNT(*) AS total FROM user_memberships um
     JOIN users u ON u.id = um.user_id ${where}`,
    params
  );

  return {
    memberships: rows.map((r) => ({
      user_id:             r.user_id,
      user_name:           r.user_name,
      user_email:          r.user_email,
      tier_id:             r.tier_id,
      tier_name:           r.tier_name,
      tier_slug:           r.tier_slug,
      tier_color:          r.tier_color,
      tier_icon:           r.tier_icon,
      total_spending:      Number(r.total_spending),
      total_points_earned: Number(r.total_points_earned),
      tier_achieved_at:    r.tier_achieved_at,
      tier_expires_at:     r.tier_expires_at,
    })),
    total: Number(countRow.total),
    page:  Number(page),
    limit: Number(limit),
  };
}

// ─── Point Balance ────────────────────────────────────────────────────────────

async function get_balance(user_id) {
  const [[row]] = await db.execute(
    `SELECT * FROM point_balances WHERE user_id = ? LIMIT 1`, [user_id]
  );
  if (!row) {
    // Return zero balance jika belum ada record
    return { balance: 0, lifetime_earned: 0, lifetime_spent: 0, lifetime_expired: 0 };
  }
  return fmt_balance(row);
}

// ─── Point Transactions ───────────────────────────────────────────────────────

async function get_transactions(user_id, { page = 1, limit = 20, type } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const params = [user_id];
  let where = 'WHERE user_id = ?';

  if (type) { where += ' AND type = ?'; params.push(type); }

  const [rows] = await db.execute(
    `SELECT * FROM point_transactions ${where}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );

  const [[countRow]] = await db.execute(
    `SELECT COUNT(*) AS total FROM point_transactions ${where}`, params
  );

  return {
    transactions: rows.map(fmt_transaction),
    meta: {
      total: Number(countRow.total),
      page:  Number(page),
      limit: Number(limit),
    },
  };
}

// ─── Point Redemptions ────────────────────────────────────────────────────────

async function get_redemptions(user_id) {
  const [rows] = await db.execute(
    `SELECT pr.*, v.code AS voucher_code
     FROM point_redemptions pr
     LEFT JOIN vouchers v ON v.id = pr.voucher_id
     WHERE pr.user_id = ?
     ORDER BY pr.created_at DESC`,
    [user_id]
  );
  return rows.map(fmt_redemption);
}

async function create_redemption(user_id, { redemption_type, points, order_id } = {}) {
  // Validasi saldo
  const balance = await get_balance(user_id);
  if (balance.balance < points) {
    throw Object.assign(new Error('Saldo poin tidak cukup'), { status_code: 400 });
  }

  const POINT_TO_IDR = 10; // 1 poin = Rp 10
  const voucher_value = points * POINT_TO_IDR;

  return db.transaction(async (conn) => {
    // Insert redemption
    const [ins] = await conn.execute(
      `INSERT INTO point_redemptions
         (user_id, points_spent, redemption_type, voucher_value, order_id, status, expires_at)
       VALUES (?, ?, ?, ?, ?, 'pending', DATE_ADD(NOW(), INTERVAL 30 DAY))`,
      [user_id, points, redemption_type, voucher_value, order_id || null]
    );

    // Kurangi saldo
    await conn.execute(
      `UPDATE point_balances
       SET balance = balance - ?, lifetime_spent = lifetime_spent + ?, updated_at = NOW()
       WHERE user_id = ?`,
      [points, points, user_id]
    );

    // Catat transaksi
    const [[bal]] = await conn.execute(
      `SELECT balance FROM point_balances WHERE user_id = ?`, [user_id]
    );
    await conn.execute(
      `INSERT INTO point_transactions
         (user_id, type, points, balance_after, note, created_at, updated_at)
       VALUES (?, 'spend_redemption', ?, ?, ?, NOW(), NOW())`,
      [user_id, -points, bal?.balance ?? 0, `Penukaran poin (${redemption_type})`]
    );

    // Ambil kembali data
    const [[redemption]] = await conn.execute(
      `SELECT pr.*, v.code AS voucher_code
       FROM point_redemptions pr
       LEFT JOIN vouchers v ON v.id = pr.voucher_id
       WHERE pr.id = ? LIMIT 1`,
      [ins.insertId]
    );
    return fmt_redemption(redemption);
  });
}

// ─── Referral ────────────────────────────────────────────────────────────────

async function get_referral_code(user_id) {
  const [[row]] = await db.execute(
    `SELECT * FROM referral_codes WHERE user_id = ? LIMIT 1`, [user_id]
  );
  if (!row) return null;
  return {
    id:                row.id,
    code:              row.code,
    referrer_points:   Number(row.referrer_points),
    referrer_discount: row.referrer_discount != null ? Number(row.referrer_discount) : null,
    referee_points:    Number(row.referee_points),
    referee_discount:  row.referee_discount != null ? Number(row.referee_discount) : null,
    min_transaction:   Number(row.min_transaction),
    total_uses:        Number(row.total_uses),
    max_uses:          row.max_uses != null ? Number(row.max_uses) : null,
    is_active:         Number(row.is_active),
    created_at:        row.created_at,
  };
}

function generate_code(user_id) {
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TRV${String(user_id).padStart(4, '0')}${suffix}`;
}

async function generate_referral_code(user_id) {
  // Cek sudah ada atau belum
  const existing = await get_referral_code(user_id);
  if (existing) return existing;

  const code = generate_code(user_id);
  await db.execute(
    `INSERT INTO referral_codes
       (user_id, code, referrer_points, referrer_discount,
        referee_points, referee_discount, min_transaction, max_uses, is_active)
     VALUES (?, ?, 500, 25000, 250, 15000, 300000, 20, 1)`,
    [user_id, code]
  );
  return get_referral_code(user_id);
}

// Admin: semua referral codes + stats
async function list_referral_codes({ page = 1, limit = 20 } = {}) {
  const offset = (Number(page) - 1) * Number(limit);

  const [rows] = await db.execute(
    `SELECT rc.*, u.name AS user_name, u.email AS user_email
     FROM referral_codes rc
     JOIN users u ON u.id = rc.user_id
     ORDER BY rc.total_uses DESC
     LIMIT ? OFFSET ?`,
    [Number(limit), offset]
  );

  const [[countRow]] = await db.execute(`SELECT COUNT(*) AS total FROM referral_codes`);

  return {
    codes: rows.map((r) => ({
      id:                r.id,
      code:              r.code,
      user_id:           r.user_id,
      user_name:         r.user_name,
      user_email:        r.user_email,
      referrer_points:   Number(r.referrer_points),
      referee_points:    Number(r.referee_points),
      total_uses:        Number(r.total_uses),
      max_uses:          r.max_uses != null ? Number(r.max_uses) : null,
      is_active:         Number(r.is_active),
      created_at:        r.created_at,
    })),
    total: Number(countRow.total),
    page:  Number(page),
    limit: Number(limit),
  };
}

async function list_referral_usages({ page = 1, limit = 20, status } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const params = [];
  let where = 'WHERE 1=1';
  if (status) { where += ' AND ru.status = ?'; params.push(status); }

  const [rows] = await db.execute(
    `SELECT ru.*,
            rc.code AS referral_code,
            ref.name AS referrer_name, ref.email AS referrer_email,
            ree.name AS referee_name,  ree.email AS referee_email
     FROM referral_usages ru
     JOIN referral_codes rc ON rc.id = ru.referral_code_id
     JOIN users ref ON ref.id = ru.referrer_id
     JOIN users ree ON ree.id = ru.referee_id
     ${where}
     ORDER BY ru.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset]
  );

  const [[countRow]] = await db.execute(
    `SELECT COUNT(*) AS total FROM referral_usages ru ${where}`, params
  );

  return {
    usages: rows.map((r) => ({
      id:                       r.id,
      referral_code:            r.referral_code,
      referrer_name:            r.referrer_name,
      referrer_email:           r.referrer_email,
      referee_name:             r.referee_name,
      referee_email:            r.referee_email,
      referrer_rewarded:        Number(r.referrer_rewarded),
      referee_rewarded:         Number(r.referee_rewarded),
      qualifying_order_amount:  r.qualifying_order_amount != null ? Number(r.qualifying_order_amount) : null,
      status:                   r.status,
      created_at:               r.created_at,
    })),
    total: Number(countRow.total),
    page:  Number(page),
    limit: Number(limit),
  };
}

// Admin: summary stats referral
async function get_referral_stats() {
  const [[totals]] = await db.execute(
    `SELECT
       COUNT(*) AS total_usages,
       SUM(referrer_rewarded) AS total_referrer_rewarded,
       SUM(referee_rewarded) AS total_referee_rewarded,
       SUM(qualifying_order_amount) AS total_qualifying_amount
     FROM referral_usages WHERE status = 'rewarded'`
  );
  const [[codes]] = await db.execute(
    `SELECT COUNT(*) AS total_codes, SUM(total_uses) AS total_uses FROM referral_codes`
  );

  return {
    total_codes:               Number(codes.total_codes),
    total_uses:                Number(codes.total_uses || 0),
    total_rewarded_usages:     Number(totals.total_usages),
    total_referrer_rewarded:   Number(totals.total_referrer_rewarded || 0),
    total_referee_rewarded:    Number(totals.total_referee_rewarded || 0),
    total_qualifying_amount:   Number(totals.total_qualifying_amount || 0),
  };
}

async function get_referral_stats_admin({ q, page = 1, limit = 20 } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const params = [];
  let where = 'WHERE 1=1';

  if (q) {
    where += ' AND (u.name LIKE ? OR u.email LIKE ? OR rc.code LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const [rows] = await db.execute(
    `SELECT
       u.id   AS user_id,
       u.name AS user_name,
       u.email AS user_email,
       rc.code AS referral_code,
       rc.total_uses,
       COUNT(CASE WHEN ru.referrer_rewarded = 1 THEN 1 END) AS total_rewarded,
       COALESCE(SUM(pt.points), 0) AS total_points_given
     FROM referral_codes rc
     JOIN users u ON u.id = rc.user_id
     LEFT JOIN referral_usages ru ON ru.referral_code_id = rc.id
     LEFT JOIN point_transactions pt ON pt.user_id = rc.user_id AND pt.ref_type = 'referral'
     ${where}
     GROUP BY rc.id, u.id, u.name, u.email, rc.code, rc.total_uses
     ORDER BY rc.total_uses DESC
     LIMIT ${Number(limit)} OFFSET ${offset}`,
    params
  );

  const [[countRow]] = await db.execute(
    `SELECT COUNT(DISTINCT rc.id) AS total
     FROM referral_codes rc
     JOIN users u ON u.id = rc.user_id
     ${where}`,
    params
  );

  const total = Number(countRow.total);

  return {
    stats: rows.map(r => ({
      user_id:           r.user_id,
      user_name:         r.user_name,
      user_email:        r.user_email,
      referral_code:     r.referral_code,
      total_uses:        Number(r.total_uses),
      total_rewarded:    Number(r.total_rewarded),
      total_points_given: Number(r.total_points_given),
    })),
    meta: {
      total,
      page: Number(page),
      limit: Number(limit),
      total_pages: Math.ceil(total / Number(limit)),
    },
  };
}

// ─── Promo Analytics ─────────────────────────────────────────────────────────

async function get_analytics({ source_type, source_id, days = 7 } = {}) {
  const params = [];
  let where = `WHERE date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`;
  params.push(Number(days));

  if (source_type) { where += ' AND source_type = ?'; params.push(source_type); }
  if (source_id)   { where += ' AND source_id = ?';   params.push(source_id); }

  const [rows] = await db.execute(
    `SELECT * FROM promo_analytics ${where} ORDER BY date ASC, source_type ASC, source_id ASC`,
    params
  );

  return rows.map((r) => ({
    id:                   r.id,
    source_type:          r.source_type,
    source_id:            r.source_id,
    date:                 r.date,
    impressions:          Number(r.impressions),
    attempts:             Number(r.attempts),
    success_count:        Number(r.success_count),
    fail_count:           Number(r.fail_count),
    total_discount_given: Number(r.total_discount_given),
    total_revenue:        Number(r.total_revenue),
  }));
}

async function get_analytics_summary({ days = 30 } = {}) {
  const [[summary]] = await db.execute(
    `SELECT
       SUM(impressions)          AS total_impressions,
       SUM(attempts)             AS total_attempts,
       SUM(success_count)        AS total_success,
       SUM(fail_count)           AS total_fail,
       SUM(total_discount_given) AS total_discount,
       SUM(total_revenue)        AS total_revenue
     FROM promo_analytics
     WHERE date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [Number(days)]
  );

  return {
    total_impressions: Number(summary.total_impressions || 0),
    total_attempts:    Number(summary.total_attempts    || 0),
    total_success:     Number(summary.total_success     || 0),
    total_fail:        Number(summary.total_fail        || 0),
    total_discount:    Number(summary.total_discount    || 0),
    total_revenue:     Number(summary.total_revenue     || 0),
    conversion_rate:   summary.total_attempts > 0
      ? Math.round((summary.total_success / summary.total_attempts) * 100)
      : 0,
  };
}

// ─── Referral Reward Engine (Dual-Stage) ─────────────────────────────────────

const REFERRAL_MONTHLY_LIMIT = 10; // Max referral booking rewards per month

/**
 * Award referral points to a sponsor with full DB transaction safety.
 * Uses UNIQUE KEY (user_id, ref_type, ref_id) as ultimate anti-double-reward guard.
 *
 * @param {Object} opts
 * @param {number} opts.user_id      - Sponsor user ID
 * @param {number} opts.points       - Points to award
 * @param {string} opts.ref_type     - 'earn_referral_verify' or 'earn_referral_booking'
 * @param {number} opts.ref_id       - The referred user's ID
 * @param {string} opts.note         - Description note
 * @returns {Promise<boolean>}       - true if awarded, false if skipped (duplicate/limit)
 */
async function award_referral_points({ user_id, points, ref_type, ref_id, note }) {
  try {
    return await db.transaction(async (conn) => {
      // 1. Anti-double reward check (belt)
      const [existing] = await conn.execute(
        `SELECT id FROM point_transactions WHERE user_id = ? AND ref_type = ? AND ref_id = ? LIMIT 1`,
        [user_id, ref_type, ref_id]
      );
      if (existing.length > 0) {
        console.log(`[REFERRAL REWARD] Skipped: duplicate reward user_id=${user_id} ref_type=${ref_type} ref_id=${ref_id}`);
        return false;
      }

      // 2. Anti-abuse monthly limit (only for booking rewards)
      if (ref_type === 'earn_referral_booking') {
        const [countRows] = await conn.execute(
          `SELECT COUNT(*) as cnt FROM point_transactions 
           WHERE user_id = ? AND ref_type = 'earn_referral_booking' 
           AND created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)`,
          [user_id]
        );
        if (countRows[0] && countRows[0].cnt >= REFERRAL_MONTHLY_LIMIT) {
          console.log(`[REFERRAL REWARD] Skipped: monthly limit reached for user_id=${user_id}`);
          return false;
        }
      }

      // 3. Upsert point_balances
      await conn.execute(
        `INSERT INTO point_balances (user_id, balance, lifetime_earned)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           balance = balance + VALUES(balance),
           lifetime_earned = lifetime_earned + VALUES(lifetime_earned),
           updated_at = NOW()`,
        [user_id, points, points]
      );

      // 4. Get current balance for balance_after
      const [[bal]] = await conn.execute(
        `SELECT balance FROM point_balances WHERE user_id = ?`, [user_id]
      );

      // 5. Insert transaction record (UNIQUE KEY is the suspender / final guard)
      await conn.execute(
        `INSERT INTO point_transactions 
           (user_id, type, points, balance_after, ref_type, ref_id, note, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [user_id, ref_type, points, bal?.balance ?? points, ref_type, ref_id, note]
      );

      console.log(`[REFERRAL REWARD] Awarded ${points} pts to user_id=${user_id} (${ref_type}, ref_id=${ref_id})`);
      return true;
    });
  } catch (err) {
    // ER_DUP_ENTRY means unique constraint caught a duplicate — this is expected, not an error
    if (err.code === 'ER_DUP_ENTRY') {
      console.log(`[REFERRAL REWARD] Skipped (unique constraint): user_id=${user_id} ref_type=${ref_type}`);
      return false;
    }
    console.error('[REFERRAL REWARD] Error:', err);
    throw err;
  }
}

module.exports = {
  // Tiers
  get_all_tiers,
  get_tier_by_id,
  list_tiers_admin,
  create_tier,
  update_tier,
  delete_tier,
  // User membership
  get_user_membership,
  list_user_memberships,
  // Balance
  get_balance,
  // Transactions
  get_transactions,
  // Redemptions
  get_redemptions,
  create_redemption,
  // Referral
  get_referral_code,
  generate_referral_code,
  list_referral_codes,
  list_referral_usages,
  get_referral_stats,
  get_referral_stats_admin,
  // Analytics
  get_analytics,
  get_analytics_summary,
  // Referral Reward Engine
  award_referral_points,
};