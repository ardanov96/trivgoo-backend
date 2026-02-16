const db = require('../configs/db');

const AGENT_TYPES = new Set(['INDIVIDUAL', 'CORPORATE']);
const SPECIALIZATIONS = new Set(['TOUR', 'STAY', 'TRANSPORT']);
const VERIF_STATUS = new Set(['PENDING', 'APPROVED', 'VERIFIED', 'REJECTED']);

function pick_enum(val, set, fallback) {
  const v = String(val || '').toUpperCase();
  return set.has(v) ? v : fallback;
}

function normalize_upsert_payload(payload) {
  if (!payload) throw new Error('payload is required');

  const user_id = payload.user_id ?? payload.userId;
  if (!user_id) throw new Error('user_id is required');

  const uid = Number(user_id);
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('user_id is invalid');

  const agent_type = pick_enum(payload.agent_type ?? payload.agentType, AGENT_TYPES, 'INDIVIDUAL');
  const specialization = pick_enum(payload.specialization, SPECIALIZATIONS, 'TOUR');

  const id_card_number = String(payload.id_card_number).trim();
  const tax_id = String(payload.tax_id).trim();
  const bank_name = String(payload.bank_name).trim();
  const bank_account_number = String(payload.bank_account_number).trim();
  const bank_account_holder = String(payload.bank_account_holder).trim();

  if (!id_card_number) throw new Error('id_card_number is required');
  if (!tax_id) throw new Error('tax_id is required');
  if (!bank_name) throw new Error('bank_name is required');
  if (!bank_account_number) throw new Error('bank_account_number is required');
  if (!bank_account_holder) throw new Error('bank_account_holder is required');

  const company_name = payload.company_name;
  const id_document_url = payload.id_document_url;

  return {
    user_id: uid,
    agent_type,
    specialization,
    id_card_number,
    tax_id,
    company_name: company_name,
    bank_name,
    bank_account_number,
    bank_account_holder,
    id_document_url: id_document_url,
  };
}

async function upsert_agent_verification(payload) {
  const data = normalize_upsert_payload(payload);

  const sql = `
    INSERT INTO agent_verifications (
      user_id,
      agent_type,
      specialization,
      id_card_number,
      tax_id,
      company_name,
      bank_name,
      bank_account_number,
      bank_account_holder,
      id_document_url,
      status
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING'
    )
    ON DUPLICATE KEY UPDATE
      agent_type           = VALUES(agent_type),
      specialization       = VALUES(specialization),
      id_card_number       = VALUES(id_card_number),
      tax_id               = VALUES(tax_id),
      company_name         = VALUES(company_name),
      bank_name            = VALUES(bank_name),
      bank_account_number  = VALUES(bank_account_number),
      bank_account_holder  = VALUES(bank_account_holder),
      id_document_url      = VALUES(id_document_url),
      status               = 'PENDING',
      rejection_reason     = NULL,
      reviewed_at          = NULL,
      reviewed_by          = NULL,
      updated_at           = CURRENT_TIMESTAMP
  `;

  const params = [
    data.user_id,
    data.agent_type,
    data.specialization,
    data.id_card_number,
    data.tax_id,
    data.company_name,
    data.bank_name,
    data.bank_account_number,
    data.bank_account_holder,
    data.id_document_url,
  ];

  const [result] = await db.query(sql, params);
  return result;
}

async function find_verification_by_user_id(user_id) {
  const sql = `
    SELECT
      av.*,
      u.verification_status
    FROM agent_verifications av
    JOIN users u ON u.id = av.user_id
    WHERE av.user_id = ?
    ORDER BY av.id DESC
    LIMIT 1
  `;

  const [rows] = await db.query(sql, [user_id]);
  return rows[0] || null;
}

async function update_agent_verification_status(user_id, status) {
  const st = String(status || '').toUpperCase();
  if (!VERIF_STATUS.has(st)) throw new Error('Invalid verification status');

  const sql = `
    UPDATE agent_verifications
    SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `;

  const [result] = await db.query(sql, [st, user_id]);
  return result;
}

async function set_agent_verification_decision({
  user_id,
  action,
  reviewed_by = null,
  rejection_reason = null,
}) {
  const uid = Number(user_id);
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('user_id is invalid');

  const act = String(action || '').toUpperCase();
  if (!['APPROVE', 'REJECT'].includes(act)) throw new Error('action must be APPROVE or REJECT');

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [vrows] = await conn.query(
      `SELECT id FROM agent_verifications WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [uid],
    );
    if (!vrows[0]) throw new Error('Agent verification not found for this user');

    if (act === 'APPROVE') {
      await conn.query(
        `
        UPDATE agent_verifications
        SET
          status = 'APPROVED',
          reviewed_by = ?,
          reviewed_at = CURRENT_TIMESTAMP,
          rejection_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
        `,
        [reviewed_by, uid],
      );

      await conn.query(
        `
        UPDATE users
        SET verification_status = 'VERIFIED', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [uid],
      );
    } else {
      const reason = rejection_reason ? String(rejection_reason).trim() : 'Rejected by admin';

      await conn.query(
        `
        UPDATE agent_verifications
        SET
          status = 'REJECTED',
          reviewed_by = ?,
          reviewed_at = CURRENT_TIMESTAMP,
          rejection_reason = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
        `,
        [reviewed_by, reason, uid],
      );

      await conn.query(
        `
        UPDATE users
        SET verification_status = 'REJECTED', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
        [uid],
      );
    }

    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

async function list_agent_users_with_verification() {
  const sql = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.verification_status,
      u.specialization AS user_specialization,
      up.avatar_url AS avatar,
      av.id            AS v_id,
      av.user_id       AS v_user_id,
      av.agent_type    AS v_agent_type,
      av.id_card_number AS v_id_card_number,
      av.tax_id        AS v_tax_id,
      av.company_name  AS v_company_name,
      av.bank_name     AS v_bank_name,
      av.bank_account_number AS v_bank_account_number,
      av.bank_account_holder AS v_bank_account_holder,
      av.specialization AS v_specialization,
      av.id_document_url AS v_id_document_url,
      av.status        AS v_status,
      av.reviewed_by   AS v_reviewed_by,
      av.reviewed_at   AS v_reviewed_at,
      av.rejection_reason AS v_rejection_reason,
      av.created_at    AS v_created_at,
      av.updated_at    AS v_updated_at
    FROM users u
    LEFT JOIN user_profiles up
      ON up.user_id = u.id
    LEFT JOIN agent_verifications av
      ON av.user_id = u.id
     AND av.id = (
       SELECT av2.id
       FROM agent_verifications av2
       WHERE av2.user_id = u.id
       ORDER BY av2.id DESC
       LIMIT 1
     )
    WHERE u.role = 'AGENT'
    ORDER BY u.created_at DESC
  `;

  const [rows] = await db.query(sql);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    avatar: r.avatar || null,
    verification_status: r.verification_status,
    specialization: r.user_specialization || null,

    verification: r.v_id
      ? {
          id: r.v_id,
          user_id: r.v_user_id,
          agent_type: r.v_agent_type,
          id_card_number: r.v_id_card_number,
          tax_id: r.v_tax_id,
          company_name: r.v_company_name,
          bank_name: r.v_bank_name,
          bank_account_number: r.v_bank_account_number,
          bank_account_holder: r.v_bank_account_holder,
          specialization: r.v_specialization,
          id_document_url: r.v_id_document_url,
          status: r.v_status,
          reviewed_by: r.v_reviewed_by,
          reviewed_at: r.v_reviewed_at,
          rejection_reason: r.v_rejection_reason,
          created_at: r.v_created_at,
          updated_at: r.v_updated_at,
        }
      : null,
  }));
}

/**
 * NEW: Get agent dashboard statistics
 * @param {number} agent_id - User ID of the agent
 */
async function get_agent_dashboard_stats(agent_id) {
  const uid = Number(agent_id);
  if (!Number.isFinite(uid) || uid <= 0) {
    throw new Error('Invalid agent_id');
  }

  const sql = `
    SELECT
      -- Total commission dari bookings yang COMPLETED
      -- Asumsi: products yang dimiliki agent akan di-booking oleh customer
      (
        SELECT COALESCE(SUM(b.total_price), 0)
        FROM bookings b
        JOIN products p ON p.id = b.product_id
        WHERE p.owner_id = ?
          AND b.status = 'COMPLETED'
      ) AS total_commission,

      -- Bookings bulan ini (untuk products milik agent ini)
      (
        SELECT COUNT(*)
        FROM bookings b
        JOIN products p ON p.id = b.product_id
        WHERE p.owner_id = ?
          AND b.date >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
      ) AS bookings_this_month,

      -- Active customers (unique customers yang pernah booking products agent ini)
      (
        SELECT COUNT(DISTINCT b.user_id)
        FROM bookings b
        JOIN products p ON p.id = b.product_id
        WHERE p.owner_id = ?
      ) AS active_customers,

      -- Total products milik agent ini
      (
        SELECT COUNT(*)
        FROM products
        WHERE owner_id = ?
          AND is_active = 1
      ) AS total_products

    FROM DUAL
  `;

  const [rows] = await db.query(sql, [uid, uid, uid, uid]);
  return rows[0];
}

/**
 * NEW: Get weekly sales performance for agent
 * @param {number} agent_id - User ID of the agent
 */
async function get_agent_weekly_sales(agent_id) {
  const uid = Number(agent_id);
  if (!Number.isFinite(uid) || uid <= 0) {
    throw new Error('Invalid agent_id');
  }

  const sql = `
    SELECT
      DAYNAME(b.date) AS day_name,
      DAYOFWEEK(b.date) AS day_num,
      COALESCE(SUM(b.total_price), 0) AS sales
    FROM bookings b
    JOIN products p ON p.id = b.product_id
    WHERE p.owner_id = ?
      AND b.status = 'COMPLETED'
      AND b.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    GROUP BY day_name, day_num
    ORDER BY day_num
  `;

  const [rows] = await db.query(sql, [uid]);

  // Format ke struktur yang diharapkan frontend
  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const salesMap = new Map();

  rows.forEach(row => {
    const dayIndex = row.day_num - 1; // MySQL DAYOFWEEK: 1=Sunday, convert to 0-indexed
    salesMap.set(dayIndex, Number(row.sales));
  });

  // Buat array lengkap untuk 7 hari terakhir
  return daysOfWeek.map((name, index) => ({
    name,
    sales: salesMap.get(index) || 0
  }));
}

module.exports = {
  upsert_agent_verification,
  find_verification_by_user_id,
  update_agent_verification_status,
  set_agent_verification_decision,
  list_agent_users_with_verification,
  get_agent_dashboard_stats,
  get_agent_weekly_sales,
};