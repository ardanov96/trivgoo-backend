// src/controllers/loyalty.js
const misc = require('../helpers/response');
const m    = require('../models/loyalty');

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function get_session_user(req) { return req?.session?.user || null; }

function ensure_auth(req) {
  const user = get_session_user(req);
  if (!user) {
    const err = new Error('Unauthorized'); err.status_code = 401; throw err;
  }
  return user;
}

function ensure_admin(req) {
  const user = ensure_auth(req);
  if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
    const err = new Error('Forbidden'); err.status_code = 403; throw err;
  }
  return user;
}

// ─── PUBLIC ──────────────────────────────────────────────────────────────────

/** GET /loyalty/tiers  — semua tier aktif (publik) */
async function get_tiers(req, res) {
  try {
    const tiers = await m.get_all_tiers();
    return misc.response(res, 200, false, 'OK', tiers);
  } catch (e) {
    console.error('[loyalty.get_tiers]', e);
    return misc.response(res, 500, true, e.message);
  }
}

// ─── CUSTOMER (butuh login) ───────────────────────────────────────────────────

/** GET /loyalty/balance */
async function get_balance(req, res) {
  try {
    const user = ensure_auth(req);
    const data = await m.get_balance(user.id);
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /loyalty/transactions */
async function get_transactions(req, res) {
  try {
    const user = ensure_auth(req);
    const { page, limit, type } = req.query;
    const data = await m.get_transactions(user.id, { page, limit, type });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /loyalty/membership */
async function get_membership(req, res) {
  try {
    const user = ensure_auth(req);
    const data = await m.get_user_membership(user.id);
    if (!data) return misc.response(res, 404, true, 'Data membership tidak ditemukan');
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /loyalty/redemptions */
async function get_redemptions(req, res) {
  try {
    const user = ensure_auth(req);
    const data = await m.get_redemptions(user.id);
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** POST /loyalty/redeem */
async function redeem(req, res) {
  try {
    const user = ensure_auth(req);
    const { redemption_type, points, order_id } = req.body;

    if (!redemption_type || !['voucher', 'checkout'].includes(redemption_type))
      return misc.response(res, 400, true, 'redemption_type harus voucher atau checkout');
    if (!points || Number(points) < 1)
      return misc.response(res, 400, true, 'points harus lebih dari 0');

    const data = await m.create_redemption(user.id, { redemption_type, points: Number(points), order_id });
    return misc.response(res, 201, false, 'Poin berhasil ditukar', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /loyalty/referral */
async function get_referral(req, res) {
  try {
    const user = ensure_auth(req);
    const data = await m.get_referral_code(user.id);
    if (!data) return misc.response(res, 404, true, 'Kode referral belum dibuat');
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** POST /loyalty/referral/generate */
async function generate_referral(req, res) {
  try {
    const user = ensure_auth(req);
    const data = await m.generate_referral_code(user.id);
    return misc.response(res, 201, false, 'Kode referral berhasil dibuat', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

/** GET /loyalty/admin/tiers */
async function admin_list_tiers(req, res) {
  try {
    ensure_admin(req);
    const data = await m.list_tiers_admin();
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** POST /loyalty/admin/tiers */
async function admin_create_tier(req, res) {
  try {
    ensure_admin(req);
    if (!req.body.name) return misc.response(res, 400, true, 'name wajib diisi');
    const data = await m.create_tier(req.body);
    return misc.response(res, 201, false, 'Tier berhasil dibuat', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** PUT /loyalty/admin/tiers/:id */
async function admin_update_tier(req, res) {
  try {
    ensure_admin(req);
    const data = await m.update_tier(req.params.id, req.body);
    if (!data) return misc.response(res, 404, true, 'Tier tidak ditemukan');
    return misc.response(res, 200, false, 'Tier berhasil diupdate', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** DELETE /loyalty/admin/tiers/:id */
async function admin_delete_tier(req, res) {
  try {
    ensure_admin(req);
    const ok = await m.delete_tier(req.params.id);
    if (!ok) return misc.response(res, 404, true, 'Tier tidak ditemukan');
    return misc.response(res, 200, false, 'Tier berhasil dihapus');
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /loyalty/admin/memberships */
async function admin_list_memberships(req, res) {
  try {
    ensure_admin(req);
    const { page, limit, tier_id, q } = req.query;
    const data = await m.list_user_memberships({ page, limit, tier_id, q });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /loyalty/admin/referral-codes */
async function admin_list_referral_codes(req, res) {
  try {
    ensure_admin(req);
    const { page, limit } = req.query;
    const data = await m.list_referral_codes({ page, limit });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /loyalty/admin/referral-usages */
async function admin_list_referral_usages(req, res) {
  try {
    ensure_admin(req);
    const { page, limit, status } = req.query;
    const data = await m.list_referral_usages({ page, limit, status });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /loyalty/admin/referral-stats */
async function admin_referral_stats(req, res) {
  try {
    ensure_admin(req);
    const { q, page = 1, limit = 20 } = req.query;
    const data = await m.get_referral_stats_admin({
      q: q || undefined,
      page: Number(page),
      limit: Math.min(Number(limit), 100),
    });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

/** GET /loyalty/admin/analytics */
async function admin_analytics(req, res) {
  try {
    ensure_admin(req);
    const { source_type, source_id, days } = req.query;
    const [rows, summary] = await Promise.all([
      m.get_analytics({ source_type, source_id, days }),
      m.get_analytics_summary({ days }),
    ]);
    return misc.response(res, 200, false, 'OK', { rows, summary });
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

module.exports = {
  get_tiers,
  get_balance,
  get_transactions,
  get_membership,
  get_redemptions,
  redeem,
  get_referral,
  generate_referral,
  admin_list_tiers,
  admin_create_tier,
  admin_update_tier,
  admin_delete_tier,
  admin_list_memberships,
  admin_list_referral_codes,
  admin_list_referral_usages,
  admin_referral_stats,
  admin_analytics,
};