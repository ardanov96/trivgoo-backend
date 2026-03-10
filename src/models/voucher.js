// src/models/voucher.js
const db = require('../configs/db');

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt_voucher(row) {
  if (!row) return null;
  // scope_ids is a JSON column — MySQL2 already parses it, do NOT JSON.parse again
  return {
    id:              row.id,
    code:            row.code,
    description:     row.description,
    type:            row.type,
    value:           Number(row.value),
    max_discount:    row.max_discount != null ? Number(row.max_discount) : null,
    min_transaction: Number(row.min_transaction),
    scope:           row.scope,
    scope_ids:       row.scope_ids || null,   // already a JS array from MySQL2
    max_usage:       row.max_usage != null ? Number(row.max_usage) : null,
    used_count:      Number(row.used_count || 0),
    per_user:        Number(row.per_user),
    starts_at:       row.starts_at,
    expires_at:      row.expires_at,
    is_active:       Number(row.is_active),
    created_by:      row.created_by,
    created_at:      row.created_at,
    updated_at:      row.updated_at,
  };
}

function fmt_usage(row) {
  if (!row) return null;
  return {
    id:               row.id,
    voucher_id:       row.voucher_id,
    voucher_code:     row.voucher_code || null,
    user_id:          row.user_id,
    user_name:        row.user_name || null,
    user_email:       row.user_email || null,
    order_id:         row.order_id,
    original_amount:  Number(row.original_amount),
    discount_amount:  Number(row.discount_amount),
    final_amount:     Number(row.final_amount),
    used_at:          row.used_at,
  };
}

// ─── Vouchers ─────────────────────────────────────────────────────────────────

async function list_vouchers({ q, type, is_active, page = 1, limit = 20 } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const params = [];
  let where = 'WHERE 1=1';

  if (q) {
    where += ' AND (code LIKE ? OR description LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  if (type) {
    where += ' AND type = ?';
    params.push(type);
  }
  if (is_active !== undefined && is_active !== null && is_active !== '') {
    where += ' AND is_active = ?';
    params.push(Number(is_active));
  }

  const [rows] = await db.execute(
    `SELECT * FROM vouchers ${where} ORDER BY created_at DESC LIMIT ${Number(limit)} OFFSET ${offset}`,
    params
  );

  const [[countRow]] = await db.execute(
    `SELECT COUNT(*) AS total FROM vouchers ${where}`, params
  );

  return {
    vouchers: rows.map(fmt_voucher),
    total:    Number(countRow.total),
    page:     Number(page),
    limit:    Number(limit),
  };
}

async function get_voucher_by_id(id) {
  const [[row]] = await db.execute(`SELECT * FROM vouchers WHERE id = ? LIMIT 1`, [id]);
  if (!row) return null;

  const [restrictions] = await db.execute(
    `SELECT * FROM voucher_restrictions WHERE voucher_id = ?`, [id]
  );

  return { ...fmt_voucher(row), restrictions };
}

async function get_voucher_by_code(code) {
  const [[row]] = await db.execute(
    `SELECT * FROM vouchers WHERE code = ? LIMIT 1`, [code]
  );
  if (!row) return null;
  const [restrictions] = await db.execute(
    `SELECT * FROM voucher_restrictions WHERE voucher_id = ?`, [row.id]
  );
  return { ...fmt_voucher(row), restrictions };
}

async function get_active_vouchers() {
  const [rows] = await db.execute(
    `SELECT * FROM vouchers
     WHERE is_active = 1
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (expires_at IS NULL OR expires_at >= NOW())
     ORDER BY created_at DESC`
  );
  return rows.map(fmt_voucher);
}

async function create_voucher(payload, created_by = null) {
  const scope_ids_val = payload.scope_ids
    ? (typeof payload.scope_ids === 'string' ? payload.scope_ids : JSON.stringify(payload.scope_ids))
    : null;

  const [ins] = await db.execute(
    `INSERT INTO vouchers
       (code, description, type, value, max_discount, min_transaction,
        scope, scope_ids, max_usage, used_count, per_user,
        starts_at, expires_at, is_active, created_by)
     VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?,?,?)`,
    [
      payload.code.toUpperCase(),
      payload.description || null,
      payload.type || 'percent',
      Number(payload.value),
      payload.max_discount != null ? Number(payload.max_discount) : null,
      Number(payload.min_transaction) || 0,
      payload.scope || 'all',
      scope_ids_val,
      payload.max_usage != null ? Number(payload.max_usage) : null,
      Number(payload.per_user != null ? payload.per_user : 1),
      payload.starts_at || null,
      payload.expires_at || null,
      payload.is_active != null ? Number(payload.is_active) : 1,
      created_by,
    ]
  );
  return get_voucher_by_id(ins.insertId);
}

async function update_voucher(id, payload) {
  const existing = await get_voucher_by_id(id);
  if (!existing) return null;

  const fields = [], values = [];
  const sf = (col, val) => { fields.push(`${col} = ?`); values.push(val); };

  if (payload.code            !== undefined) sf('code',            payload.code.toUpperCase().trim());
  if (payload.description     !== undefined) sf('description',     payload.description ?? null);
  if (payload.type            !== undefined) sf('type',            payload.type);
  if (payload.value           !== undefined) sf('value',           Number(payload.value));
  if (payload.max_discount    !== undefined) sf('max_discount',    payload.max_discount != null ? Number(payload.max_discount) : null);
  if (payload.min_transaction !== undefined) sf('min_transaction', Number(payload.min_transaction));
  if (payload.scope           !== undefined) sf('scope',           payload.scope);
  if (payload.scope_ids !== undefined) {
    const sid = payload.scope_ids;
    sf('scope_ids', sid ? (typeof sid === 'string' ? sid : JSON.stringify(sid)) : null);
  }
  if (payload.max_usage       !== undefined) sf('max_usage',       payload.max_usage != null ? Number(payload.max_usage) : null);
  if (payload.per_user        !== undefined) sf('per_user',        Number(payload.per_user));
  if (payload.starts_at       !== undefined) sf('starts_at',       payload.starts_at || null);
  if (payload.expires_at      !== undefined) sf('expires_at',      payload.expires_at || null);
  if (payload.is_active       !== undefined) sf('is_active',       Number(payload.is_active));

  if (!fields.length) return existing;
  sf('updated_at', new Date());

  await db.execute(`UPDATE vouchers SET ${fields.join(', ')} WHERE id = ?`, [...values, id]);
  return get_voucher_by_id(id);
}

async function delete_voucher(id) {
  const [[row]] = await db.execute(`SELECT id FROM vouchers WHERE id = ? LIMIT 1`, [id]);
  if (!row) return false;
  await db.execute(`DELETE FROM vouchers WHERE id = ?`, [id]);
  return true;
}

async function toggle_voucher(id) {
  const [[row]] = await db.execute(`SELECT id, is_active FROM vouchers WHERE id = ? LIMIT 1`, [id]);
  if (!row) return null;
  const new_val = row.is_active ? 0 : 1;
  await db.execute(`UPDATE vouchers SET is_active = ?, updated_at = NOW() WHERE id = ?`, [new_val, id]);
  return get_voucher_by_id(id);
}

// ─── Voucher Usages ───────────────────────────────────────────────────────────

async function list_usages({ voucher_id, user_id, page = 1, limit = 20 } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const params = [];
  let where = 'WHERE 1=1';

  if (voucher_id) { where += ' AND vu.voucher_id = ?'; params.push(voucher_id); }
  if (user_id)    { where += ' AND vu.user_id = ?';    params.push(user_id); }

  const [rows] = await db.execute(
    `SELECT vu.*, v.code AS voucher_code, u.name AS user_name, u.email AS user_email
     FROM voucher_usages vu
     JOIN vouchers v ON v.id = vu.voucher_id
     JOIN users u    ON u.id = vu.user_id
     ${where}
     ORDER BY vu.used_at DESC
     LIMIT ${Number(limit)} OFFSET ${offset}`,
    params
  );

  const [[countRow]] = await db.execute(
    `SELECT COUNT(*) AS total FROM voucher_usages vu ${where}`, params
  );

  return {
    usages: rows.map(fmt_usage),
    total:  Number(countRow.total),
    page:   Number(page),
    limit:  Number(limit),
  };
}

// ─── Voucher Restrictions ─────────────────────────────────────────────────────

async function list_restrictions(voucher_id) {
  const [rows] = await db.execute(
    `SELECT * FROM voucher_restrictions WHERE voucher_id = ? ORDER BY id ASC`,
    [voucher_id]
  );
  return rows;
}

async function add_restriction(voucher_id, { type, ref_id, note } = {}) {
  const [ins] = await db.execute(
    `INSERT INTO voucher_restrictions (voucher_id, type, ref_id, note) VALUES (?, ?, ?, ?)`,
    [voucher_id, type, ref_id || null, note || null]
  );
  const [[row]] = await db.execute(
    `SELECT * FROM voucher_restrictions WHERE id = ?`, [ins.insertId]
  );
  return row;
}

async function delete_restriction(id) {
  const [[row]] = await db.execute(`SELECT id FROM voucher_restrictions WHERE id = ? LIMIT 1`, [id]);
  if (!row) return false;
  await db.execute(`DELETE FROM voucher_restrictions WHERE id = ?`, [id]);
  return true;
}

// ─── Validate voucher di checkout ─────────────────────────────────────────────

async function validate_voucher(code, { user_id, amount } = {}) {
  const voucher = await get_voucher_by_code(code);

  if (!voucher)           return { valid: false, reason: 'Voucher tidak ditemukan' };
  if (!voucher.is_active) return { valid: false, reason: 'Voucher tidak aktif' };

  const now = new Date();
  if (voucher.starts_at && new Date(voucher.starts_at) > now)
    return { valid: false, reason: 'Voucher belum aktif' };
  if (voucher.expires_at && new Date(voucher.expires_at) < now)
    return { valid: false, reason: 'Voucher sudah kadaluarsa' };
  if (voucher.max_usage != null && voucher.used_count >= voucher.max_usage)
    return { valid: false, reason: 'Kuota voucher habis' };
  if (Number(amount) < Number(voucher.min_transaction))
    return { valid: false, reason: `Minimum transaksi Rp ${Number(voucher.min_transaction).toLocaleString('id-ID')}` };

  if (user_id && voucher.per_user) {
    const [[used]] = await db.execute(
      `SELECT COUNT(*) AS cnt FROM voucher_usages WHERE voucher_id = ? AND user_id = ?`,
      [voucher.id, user_id]
    );
    if (Number(used.cnt) >= voucher.per_user)
      return { valid: false, reason: 'Voucher sudah pernah digunakan' };
  }

  let discount = 0;
  if (voucher.type === 'percent') {
    discount = Math.floor((Number(amount) * voucher.value) / 100);
    if (voucher.max_discount != null) discount = Math.min(discount, voucher.max_discount);
  } else {
    discount = voucher.value;
  }
  discount = Math.min(discount, Number(amount));

  return { valid: true, voucher, discount, final_amount: Number(amount) - discount };
}

module.exports = {
  list_vouchers,
  get_voucher_by_id,
  get_voucher_by_code,
  get_active_vouchers,
  create_voucher,
  update_voucher,
  delete_voucher,
  toggle_voucher,
  list_usages,
  list_restrictions,
  add_restriction,
  delete_restriction,
  validate_voucher,
};