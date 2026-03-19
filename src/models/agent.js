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

async function get_agent_dashboard_stats(user_id) {
  const sql = `
    SELECT
      COUNT(DISTINCT b.id)                                      AS total_bookings,
      COALESCE(SUM(b.total_price), 0)                          AS total_revenue,
      COUNT(DISTINCT CASE WHEN b.status = 'PENDING' THEN b.id END)   AS pending_bookings,
      COUNT(DISTINCT CASE WHEN b.status = 'CONFIRMED' THEN b.id END) AS confirmed_bookings,
      COUNT(DISTINCT CASE WHEN b.status = 'CANCELLED' THEN b.id END) AS cancelled_bookings
    FROM bookings b
    JOIN products p ON b.product_id = p.id
    WHERE p.owner_id = ?
  `;
  const [rows] = await db.query(sql, [user_id]);
  return rows[0] || {};
}

async function get_agent_weekly_sales(user_id) {
  const sql = `
    SELECT
      DAYNAME(b.created_at)             AS day,
      COALESCE(SUM(b.total_price), 0)  AS total_sales,
      COUNT(b.id)                       AS total_orders
    FROM bookings b
    JOIN products p ON b.product_id = p.id
    WHERE p.owner_id = ?
      AND b.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
    GROUP BY DAYOFWEEK(b.created_at), DAYNAME(b.created_at)
    ORDER BY DAYOFWEEK(b.created_at)
  `;
  const [rows] = await db.query(sql, [user_id]);
  return rows;
}

// ── Agent Booking Management ──────────────────────────────────────────────────

async function get_agent_bookings(owner_id, { status, payment_status, search, page = 1, limit = 20 } = {}) {
  const oid = Number(owner_id);
  if (!Number.isFinite(oid) || oid <= 0) return { data: [], meta: { page: 1, limit: 20, total: 0, total_pages: 0 } };

  let where = 'WHERE p.owner_id = ?';
  const params = [oid];

  if (status && status !== 'all') {
    where += ' AND b.status = ?';
    params.push(status.toUpperCase());
  }

  if (payment_status && payment_status !== 'all') {
    where += ' AND b.payment_status = ?';
    params.push(payment_status.toUpperCase());
  }

  if (search && search.trim()) {
    where += ' AND (b.user_name LIKE ? OR b.product_name LIKE ? OR b.external_id LIKE ? OR CAST(b.id AS CHAR) LIKE ?)';
    const s = `%${search.trim()}%`;
    params.push(s, s, s, s);
  }

  // Count total
  const [countRows] = await db.query(
    `SELECT COUNT(DISTINCT b.id) AS total FROM bookings b JOIN products p ON b.product_id = p.id ${where}`,
    params
  );
  const total = countRows[0]?.total || 0;

  // Pagination
  const pg = Math.max(1, Number(page));
  const lim = Math.min(100, Math.max(1, Number(limit)));
  const offset = (pg - 1) * lim;
  const total_pages = Math.ceil(total / lim);

  // Fetch data
  const [rows] = await db.query(
    `SELECT
      b.id,
      b.user_id,
      b.product_id,
      b.product_name,
      b.user_name,
      b.quantity,
      b.total_price,
      b.date,
      b.status,
      b.external_id,
      b.payment_url,
      b.payment_status,
      b.payment_gateway,
      b.payment_method,
      b.paid_at,
      b.created_at,
      b.updated_at,
      b.payment_expires_at,
      p.image_url AS product_image,
      u.email AS customer_email,
      up.phone AS customer_phone
    FROM bookings b
    JOIN products p ON b.product_id = p.id
    LEFT JOIN users u ON b.user_id = u.id
    LEFT JOIN user_profiles up ON up.user_id = b.user_id
    ${where}
    ORDER BY b.created_at DESC
    LIMIT ? OFFSET ?`,
    [...params, lim, offset]
  );

  const data = rows.map(r => ({
    id: r.id,
    userId: r.user_id,
    productId: r.product_id,
    productName: r.product_name,
    userName: r.user_name,
    quantity: r.quantity,
    totalPrice: parseFloat(r.total_price),
    date: r.date ? new Date(r.date).toISOString().split('T')[0] : null,
    status: r.status,
    externalId: r.external_id,
    paymentUrl: r.payment_url,
    paymentStatus: r.payment_status,
    paymentGateway: r.payment_gateway,
    paymentMethod: r.payment_method,
    paidAt: r.paid_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    productImage: r.product_image || null,
    customerEmail: r.customer_email || null,
    customerPhone: r.customer_phone || null,
    paymentExpiredAt: r.payment_expires_at || null,
  }));

  return { data, meta: { page: pg, limit: lim, total, total_pages } };
}

async function get_agent_booking_detail(booking_id, owner_id) {
  const bid = Number(booking_id);
  const oid = Number(owner_id);
  if (!Number.isFinite(bid) || bid <= 0) return null;
  if (!Number.isFinite(oid) || oid <= 0) return null;

  const [rows] = await db.query(
    `SELECT
      b.*,
      p.image_url AS product_image,
      p.name AS p_name,
      p.location AS product_location,
      u.email AS customer_email,
      u.name AS customer_name_from_users,
      up.phone AS customer_phone,
      up.address_line AS customer_address,
      pt.status AS pt_status,
      pt.payment_method AS pt_payment_method,
      pt.payment_channel AS pt_payment_channel,
      pt.paid_at AS pt_paid_at,
      pt.gateway_transaction_id AS pt_gateway_txn_id
    FROM bookings b
    JOIN products p ON b.product_id = p.id
    LEFT JOIN users u ON b.user_id = u.id
    LEFT JOIN user_profiles up ON up.user_id = b.user_id
    LEFT JOIN payment_transactions pt ON pt.booking_id = b.id
    WHERE b.id = ? AND p.owner_id = ?
    LIMIT 1`,
    [bid, oid]
  );

  if (!rows[0]) return null;
  const r = rows[0];

  return {
    id: r.id,
    userId: r.user_id,
    productId: r.product_id,
    productName: r.product_name,
    productImage: r.product_image || null,
    productLocation: r.product_location || null,
    userName: r.user_name,
    customerEmail: r.customer_email || null,
    customerPhone: r.customer_phone || null,
    customerAddress: r.customer_address || null,
    quantity: r.quantity,
    totalPrice: parseFloat(r.total_price),
    date: r.date ? new Date(r.date).toISOString().split('T')[0] : null,
    status: r.status,
    externalId: r.external_id,
    paymentUrl: r.payment_url,
    paymentStatus: r.payment_status,
    paymentGateway: r.payment_gateway,
    paymentMethod: r.payment_method || r.pt_payment_method || null,
    paymentChannel: r.pt_payment_channel || null,
    paidAt: r.paid_at || r.pt_paid_at || null,
    gatewayTransactionId: r.pt_gateway_txn_id || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    paymentExpiredAt: r.payment_expires_at || null,
  };
}

async function update_agent_booking_status(booking_id, owner_id, new_status) {
  const bid = Number(booking_id);
  const oid = Number(owner_id);
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('Invalid booking_id');
  if (!Number.isFinite(oid) || oid <= 0) throw new Error('Invalid owner_id');

  const valid = new Set(['CONFIRMED', 'COMPLETED', 'CANCELLED']);
  const st = String(new_status || '').toUpperCase();
  if (!valid.has(st)) throw new Error('Invalid status. Must be CONFIRMED, COMPLETED, or CANCELLED');

  // Verify ownership via products
  const [rows] = await db.query(
    `SELECT b.id, b.status
     FROM bookings b
     JOIN products p ON b.product_id = p.id
     WHERE b.id = ? AND p.owner_id = ?
     LIMIT 1`,
    [bid, oid]
  );

  if (!rows[0]) throw new Error('Booking not found or not owned by this agent');

  const current = rows[0].status;
  // Validate transitions
  if (st === 'CONFIRMED' && current !== 'PENDING') {
    throw new Error('Can only confirm PENDING bookings');
  }
  if (st === 'COMPLETED' && current !== 'CONFIRMED') {
    throw new Error('Can only complete CONFIRMED bookings');
  }
  if (st === 'CANCELLED' && (current === 'COMPLETED' || current === 'CANCELLED')) {
    throw new Error(`Cannot cancel a booking that is already ${current}`);
  }

  await db.query(
    'UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?',
    [st, bid]
  );

  return { id: bid, status: st };
}

module.exports = {
  upsert_agent_verification,
  find_verification_by_user_id,
  update_agent_verification_status,
  set_agent_verification_decision,
  list_agent_users_with_verification,
  get_agent_dashboard_stats,
  get_agent_weekly_sales,
  get_agent_bookings,
  get_agent_booking_detail,
  update_agent_booking_status,
};
