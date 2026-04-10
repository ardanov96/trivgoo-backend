// api-trivgoo/src/controllers/agent_voucher.js

const misc = require('../helpers/response');
const m = require('../models/agent_voucher');

function get_session_user(req) { return req?.session?.user || null; }

function ensure_agent(req) {
  const user = get_session_user(req);
  if (!user) {
    const e = new Error('Unauthorized'); e.status_code = 401; throw e;
  }
  if (user.role !== 'AGENT' && user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
    const e = new Error('Forbidden - Agent only'); e.status_code = 403; throw e;
  }
  return user;
}

// ── GET /agent/vouchers ── list voucher milik agent login ────────────────────
async function list_mine(req, res) {
  try {
    const user = ensure_agent(req);
    const { q, type, is_active, page, limit } = req.query;
    const data = await m.list_agent_vouchers(user.id, { q, type, is_active, page, limit });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── GET /agent/vouchers/stats ────────────────────────────────────────────────
async function get_stats(req, res) {
  try {
    const user = ensure_agent(req);
    const data = await m.get_agent_voucher_stats(user.id);
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── GET /agent/vouchers/active ── untuk VoucherSelector di AddProduct ────────
async function get_my_active(req, res) {
  try {
    const user = ensure_agent(req);
    const data = await m.get_active_agent_vouchers(user.id);
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── GET /agent/vouchers/:id ──────────────────────────────────────────────────
async function get_one(req, res) {
  try {
    const user = ensure_agent(req);
    const data = await m.get_agent_voucher_by_id(req.params.id, user.id);
    if (!data) return misc.response(res, 404, true, 'Voucher tidak ditemukan');
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── POST /agent/vouchers ─────────────────────────────────────────────────────
async function create(req, res) {
  try {
    const user = ensure_agent(req);
    const { code, type, value } = req.body;

    if (!code)  return misc.response(res, 400, true, 'code wajib diisi');
    if (!type)  return misc.response(res, 400, true, 'type wajib diisi');
    if (!value) return misc.response(res, 400, true, 'value wajib diisi');

    // Validasi tipe
    if (!['percent', 'fixed'].includes(type))
      return misc.response(res, 400, true, 'type harus percent atau fixed');

    // Validasi nilai persen
    if (type === 'percent' && Number(value) > 100)
      return misc.response(res, 400, true, 'Persentase tidak boleh lebih dari 100');

    // Cek duplikat kode (global — termasuk voucher admin & agent lain)
    const exists = await m.voucher_code_exists(code);
    if (exists)
      return misc.response(res, 409, true, 'Kode voucher sudah digunakan');

    const data = await m.create_agent_voucher(req.body, user.id);
    return misc.response(res, 201, false, 'Voucher berhasil dibuat', data);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return misc.response(res, 409, true, 'Kode voucher sudah digunakan');
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── PATCH /agent/vouchers/:id ────────────────────────────────────────────────
async function update(req, res) {
  try {
    const user = ensure_agent(req);

    // Cek duplikat kode jika diubah
    if (req.body.code) {
      const exists = await m.voucher_code_exists(req.body.code, req.params.id);
      if (exists)
        return misc.response(res, 409, true, 'Kode voucher sudah digunakan');
    }

    const data = await m.update_agent_voucher(req.params.id, user.id, req.body);
    if (!data) return misc.response(res, 404, true, 'Voucher tidak ditemukan atau bukan milik Anda');
    return misc.response(res, 200, false, 'Voucher berhasil diperbarui', data);
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY')
      return misc.response(res, 409, true, 'Kode voucher sudah digunakan');
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── PATCH /agent/vouchers/:id/toggle ────────────────────────────────────────
async function toggle(req, res) {
  try {
    const user = ensure_agent(req);
    const data = await m.toggle_agent_voucher(req.params.id, user.id);
    if (!data) return misc.response(res, 404, true, 'Voucher tidak ditemukan atau bukan milik Anda');
    return misc.response(res, 200, false, 'Status berhasil diubah', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── DELETE /agent/vouchers/:id ───────────────────────────────────────────────
async function remove(req, res) {
  try {
    const user = ensure_agent(req);
    const ok = await m.delete_agent_voucher(req.params.id, user.id);
    if (!ok) return misc.response(res, 404, true, 'Voucher tidak ditemukan atau bukan milik Anda');
    return misc.response(res, 200, false, 'Voucher berhasil dihapus');
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

module.exports = {
  list_mine,
  get_stats,
  get_my_active,
  get_one,
  create,
  update,
  toggle,
  remove,
};