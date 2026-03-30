// api-trivgoo/src/models/agentVoucher.js
// Voucher yang dibuat oleh Agent (bukan Admin)
// Disimpan di tabel yang SAMA (vouchers) dengan field created_by = agent user id
// dan scope_owner = 'agent' untuk membedakan dengan voucher admin

const db = require('../configs/db');

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmt_voucher(row) {
  if (!row) return null;
  return {
    id:              row.id,
    code:            row.code,
    description:     row.description,
    type:            row.type,
    value:           Number(row.value),
    max_discount:    row.max_discount != null ? Number(row.max_discount) : null,
    min_transaction: Number(row.min_transaction),
    scope:           row.scope,
    scope_ids:       row.scope_ids || null,
    max_usage:       row.max_usage != null ? Number(row.max_usage) : null,
    used_count:      Number(row.used_count || 0),
    per_user:        Number(row.per_user),
    starts_at:       row.starts_at,
    expires_at:      row.expires_at,
    is_active:       Number(row.is_active),
    scope_owner:     row.scope_owner || 'admin',
    created_by:      row.created_by,
    created_at:      row.created_at,
    updated_at:      row.updated_at,
    usage_count:     Number(row.usage_count || row.used_count || 0),
  };
}

// ─── Agent Vouchers ───────────────────────────────────────────────────────────

/**
 * List semua voucher milik agent tertentu
 */
async function list_agent_vouchers(agent_id, { q, type, is_active, page = 1, limit = 20 } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const params = [agent_id];
  let where = 'WHERE created_by = ? AND scope_owner = ?';
  params.push('agent');

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

/**
 * Get single voucher milik agent (ownership check)
 */
async function get_agent_voucher_by_id(id, agent_id) {
  const [[row]] = await db.execute(
    `SELECT * FROM vouchers WHERE id = ? AND created_by = ? AND scope_owner = 'agent' LIMIT 1`,
    [id, agent_id]
  );
  return fmt_voucher(row);
}

/**
 * Cek apakah kode voucher sudah ada (global, termasuk admin)
 */
async function voucher_code_exists(code, exclude_id = null) {
  let sql = `SELECT id FROM vouchers WHERE code = ?`;
  const params = [code.toUpperCase()];
  if (exclude_id) {
    sql += ` AND id != ?`;
    params.push(exclude_id);
  }
  const [[row]] = await db.execute(sql, params);
  return !!row;
}

/**
 * Buat voucher baru oleh agent
 */
async function create_agent_voucher(payload, agent_id) {
  const scope_ids_val = payload.scope_ids
    ? (typeof payload.scope_ids === 'string' ? payload.scope_ids : JSON.stringify(payload.scope_ids))
    : null;

  const [ins] = await db.execute(
    `INSERT INTO vouchers
       (code, description, type, value, max_discount, min_transaction,
        scope, scope_ids, max_usage, used_count, per_user,
        starts_at, expires_at, is_active, created_by, scope_owner)
     VALUES (?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)`,
    [
      payload.code.toUpperCase().trim(),
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
      agent_id,
      'agent',
    ]
  );

  return get_agent_voucher_by_id(ins.insertId, agent_id);
}

/**
 * Update voucher milik agent (ownership check)
 */
async function update_agent_voucher(id, agent_id, payload) {
  const existing = await get_agent_voucher_by_id(id, agent_id);
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
  if (payload.max_usage  !== undefined) sf('max_usage',  payload.max_usage != null ? Number(payload.max_usage) : null);
  if (payload.per_user   !== undefined) sf('per_user',   Number(payload.per_user));
  if (payload.starts_at  !== undefined) sf('starts_at',  payload.starts_at || null);
  if (payload.expires_at !== undefined) sf('expires_at', payload.expires_at || null);
  if (payload.is_active  !== undefined) sf('is_active',  Number(payload.is_active));

  if (!fields.length) return existing;
  sf('updated_at', new Date());

  await db.execute(
    `UPDATE vouchers SET ${fields.join(', ')} WHERE id = ? AND created_by = ? AND scope_owner = 'agent'`,
    [...values, id, agent_id]
  );

  return get_agent_voucher_by_id(id, agent_id);
}

/**
 * Toggle aktif/nonaktif voucher agent
 */
async function toggle_agent_voucher(id, agent_id) {
  const [[row]] = await db.execute(
    `SELECT id, is_active FROM vouchers WHERE id = ? AND created_by = ? AND scope_owner = 'agent' LIMIT 1`,
    [id, agent_id]
  );
  if (!row) return null;

  const new_val = row.is_active ? 0 : 1;
  await db.execute(
    `UPDATE vouchers SET is_active = ?, updated_at = NOW() WHERE id = ? AND created_by = ? AND scope_owner = 'agent'`,
    [new_val, id, agent_id]
  );

  return get_agent_voucher_by_id(id, agent_id);
}

/**
 * Hapus voucher agent (ownership check)
 */
async function delete_agent_voucher(id, agent_id) {
  const [[row]] = await db.execute(
    `SELECT id FROM vouchers WHERE id = ? AND created_by = ? AND scope_owner = 'agent' LIMIT 1`,
    [id, agent_id]
  );
  if (!row) return false;

  await db.execute(`DELETE FROM vouchers WHERE id = ?`, [id]);
  return true;
}

/**
 * Ambil semua voucher aktif milik agent tertentu (untuk VoucherSelector di AddProduct)
 */
async function get_active_agent_vouchers(agent_id) {
  const [rows] = await db.execute(
    `SELECT * FROM vouchers
     WHERE created_by = ?
       AND scope_owner = 'agent'
       AND is_active = 1
       AND (starts_at IS NULL OR starts_at <= NOW())
       AND (expires_at IS NULL OR expires_at >= NOW())
     ORDER BY created_at DESC`,
    [agent_id]
  );
  return rows.map(fmt_voucher);
}

/**
 * Usage stats untuk dashboard agent
 */
async function get_agent_voucher_stats(agent_id) {
  const [[stats]] = await db.execute(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN is_active = 1 AND (expires_at IS NULL OR expires_at >= NOW()) THEN 1 ELSE 0 END) AS active,
       SUM(used_count) AS total_usage
     FROM vouchers
     WHERE created_by = ? AND scope_owner = 'agent'`,
    [agent_id]
  );

  return {
    total:       Number(stats.total || 0),
    active:      Number(stats.active || 0),
    inactive:    Number(stats.total || 0) - Number(stats.active || 0),
    total_usage: Number(stats.total_usage || 0),
  };
}

module.exports = {
  list_agent_vouchers,
  get_agent_voucher_by_id,
  voucher_code_exists,
  create_agent_voucher,
  update_agent_voucher,
  toggle_agent_voucher,
  delete_agent_voucher,
  get_active_agent_vouchers,
  get_agent_voucher_stats,
};