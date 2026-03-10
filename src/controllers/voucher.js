// src/controllers/voucher.js
const misc = require('../helpers/response');
const m    = require('../models/voucher');

function get_session_user(req) { return req?.session?.user || null; }

function ensure_auth(req) {
  const user = get_session_user(req);
  if (!user) { const e = new Error('Unauthorized'); e.status_code = 401; throw e; }
  return user;
}

function ensure_admin(req) {
  const user = ensure_auth(req);
  if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
    const e = new Error('Forbidden'); e.status_code = 403; throw e;
  }
  return user;
}

// ─── PUBLIC / CUSTOMER ────────────────────────────────────────────────────────

/** GET /vouchers/active */
async function get_active(req, res) {
  try {
    const data = await m.get_active_vouchers();
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, 500, true, e.message);
  }
}

/** GET /vouchers/validate?code=XX&amount=YY */
async function validate(req, res) {
  try {
    const user = ensure_auth(req);
    const { code, amount } = req.query;
    if (!code)   return misc.response(res, 400, true, 'code wajib diisi');
    if (!amount) return misc.response(res, 400, true, 'amount wajib diisi');

    const result = await m.validate_voucher(code, { user_id: user.id, amount: Number(amount) });
    if (!result.valid) return misc.response(res, 422, true, result.reason);
    return misc.response(res, 200, false, 'Voucher valid', {
      voucher:      result.voucher,
      discount:     result.discount,
      final_amount: result.final_amount,
    });
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /vouchers/my  — riwayat pemakaian voucher user login */
async function get_my_usages(req, res) {
  try {
    const user = ensure_auth(req);
    const { page, limit } = req.query;
    const data = await m.list_usages({ user_id: user.id, page, limit });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

/** GET /vouchers */
async function list_all(req, res) {
  try {
    ensure_admin(req);
    const { q, type, is_active, page, limit } = req.query;
    const data = await m.list_vouchers({ q, type, is_active, page, limit });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /vouchers/:id */
async function get_one(req, res) {
  try {
    ensure_admin(req);
    const data = await m.get_voucher_by_id(req.params.id);
    if (!data) return misc.response(res, 404, true, 'Voucher tidak ditemukan');
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** POST /vouchers */
async function create(req, res) {
  try {
    const user = ensure_admin(req);
    const { code, type, value, expires_at } = req.body;
    if (!code)       return misc.response(res, 400, true, 'code wajib diisi');
    if (!type)       return misc.response(res, 400, true, 'type wajib diisi');
    if (!value)      return misc.response(res, 400, true, 'value wajib diisi');
    if (!expires_at) return misc.response(res, 400, true, 'expires_at wajib diisi');

    const data = await m.create_voucher(req.body, user.id);
    return misc.response(res, 201, false, 'Voucher berhasil dibuat', data);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return misc.response(res, 409, true, 'Kode voucher sudah digunakan');
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** PUT /vouchers/:id */
async function update(req, res) {
  try {
    ensure_admin(req);
    const data = await m.update_voucher(req.params.id, req.body);
    if (!data) return misc.response(res, 404, true, 'Voucher tidak ditemukan');
    return misc.response(res, 200, false, 'Voucher berhasil diupdate', data);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return misc.response(res, 409, true, 'Kode voucher sudah digunakan');
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** PATCH /vouchers/:id/toggle */
async function toggle(req, res) {
  try {
    ensure_admin(req);
    const data = await m.toggle_voucher(req.params.id);
    if (!data) return misc.response(res, 404, true, 'Voucher tidak ditemukan');
    return misc.response(res, 200, false, 'Status berhasil diubah', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** DELETE /vouchers/:id */
async function remove(req, res) {
  try {
    ensure_admin(req);
    const ok = await m.delete_voucher(req.params.id);
    if (!ok) return misc.response(res, 404, true, 'Voucher tidak ditemukan');
    return misc.response(res, 200, false, 'Voucher berhasil dihapus');
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /vouchers/:id/usages */
async function get_usages(req, res) {
  try {
    ensure_admin(req);
    const { page, limit } = req.query;
    const data = await m.list_usages({ voucher_id: req.params.id, page, limit });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /vouchers/:id/restrictions */
async function get_restrictions(req, res) {
  try {
    ensure_admin(req);
    const data = await m.list_restrictions(req.params.id);
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** POST /vouchers/:id/restrictions */
async function add_restriction(req, res) {
  try {
    ensure_admin(req);
    const { type, ref_id, note } = req.body;
    if (!type) return misc.response(res, 400, true, 'type wajib diisi');
    const data = await m.add_restriction(req.params.id, { type, ref_id, note });
    return misc.response(res, 201, false, 'Restriction berhasil ditambahkan', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** DELETE /vouchers/restrictions/:id */
async function delete_restriction(req, res) {
  try {
    ensure_admin(req);
    const ok = await m.delete_restriction(req.params.rid);
    if (!ok) return misc.response(res, 404, true, 'Restriction tidak ditemukan');
    return misc.response(res, 200, false, 'Restriction berhasil dihapus');
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

module.exports = {
  get_active,
  validate,
  get_my_usages,
  list_all,
  get_one,
  create,
  update,
  toggle,
  remove,
  get_usages,
  get_restrictions,
  add_restriction,
  delete_restriction,
};