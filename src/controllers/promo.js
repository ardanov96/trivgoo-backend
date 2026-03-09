// src/controllers/promo.js
const misc = require('../helpers/response');
const {
  list_campaigns,
  get_campaign_by_id,
  create_campaign,
  update_campaign,
  delete_campaign,
  get_analytics_summary,
  get_analytics_daily,
} = require('../models/promo');
const {
  get_all_tiers_admin,
  get_tier_by_id,
  create_tier,
  update_tier,
  delete_tier,
  get_referral_stats_admin,
} = require('../models/loyalty');

// ── Auth helper ───────────────────────────────────────────────────────────────

function get_session_user(req) {
  return req?.session?.user || null;
}

function ensure_admin(req) {
  const user = get_session_user(req);
  if (!user) {
    const err = new Error('Unauthorized'); err.status_code = 401; throw err;
  }
  if (user.role !== 'ADMIN') {
    const err = new Error('Forbidden'); err.status_code = 403; throw err;
  }
  return user;
}

function to_number_or_null(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ── GET /admin/promo/campaigns ────────────────────────────────────────────────

async function list(req, res) {
  try {
    ensure_admin(req);
    const { q, type, is_active, page = 1, limit = 20 } = req.query;
    const data = await list_campaigns({
      q, type,
      is_active: is_active !== undefined ? Number(is_active) : undefined,
      page: Number(page),
      limit: Math.min(Number(limit), 100),
    });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── GET /admin/promo/campaigns/:id ────────────────────────────────────────────

async function get_one(req, res) {
  try {
    ensure_admin(req);
    const campaign = await get_campaign_by_id(Number(req.params.id));
    if (!campaign) return misc.response(res, 404, true, 'Campaign tidak ditemukan');
    return misc.response(res, 200, false, 'OK', campaign);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── POST /admin/promo/campaigns ───────────────────────────────────────────────

async function create(req, res) {
  try {
    ensure_admin(req);
    const { name, type, discount_type, discount_value, starts_at, ends_at } = req.body;

    if (!name || !type || !discount_type || discount_value == null || !starts_at || !ends_at) {
      return misc.response(res, 400, true, 'Field wajib: name, type, discount_type, discount_value, starts_at, ends_at');
    }

    const payload = {
      name:           String(name).trim(),
      description:    req.body.description ?? null,
      banner_image:   req.body.banner_image ?? null,
      type,
      discount_type,
      discount_value: Number(discount_value),
      max_discount:   to_number_or_null(req.body.max_discount),
      min_transaction: Number(req.body.min_transaction ?? 0),
      scope:          req.body.scope ?? 'all',
      scope_ids:      Array.isArray(req.body.scope_ids) ? req.body.scope_ids : [],
      min_tier_id:    to_number_or_null(req.body.min_tier_id),
      starts_at,
      ends_at,
      max_usage:      to_number_or_null(req.body.max_usage),
      per_user:       Number(req.body.per_user ?? 1),
      is_active:      Number(req.body.is_active ?? 1),
    };

    const campaign = await create_campaign(payload);
    return misc.response(res, 201, false, 'Campaign berhasil dibuat', campaign);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── PATCH /admin/promo/campaigns/:id ─────────────────────────────────────────

async function update(req, res) {
  try {
    ensure_admin(req);
    const id = Number(req.params.id);
    const existing = await get_campaign_by_id(id);
    if (!existing) return misc.response(res, 404, true, 'Campaign tidak ditemukan');

    const payload = {};
    const allowed = ['name', 'description', 'banner_image', 'type', 'discount_type',
      'discount_value', 'max_discount', 'min_transaction', 'scope', 'scope_ids',
      'min_tier_id', 'starts_at', 'ends_at', 'max_usage', 'per_user', 'is_active'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) payload[key] = req.body[key];
    }
    if (payload.discount_value !== undefined) payload.discount_value = Number(payload.discount_value);
    if (payload.max_discount !== undefined)   payload.max_discount   = to_number_or_null(payload.max_discount);
    if (payload.min_tier_id !== undefined)    payload.min_tier_id    = to_number_or_null(payload.min_tier_id);
    if (payload.max_usage !== undefined)      payload.max_usage      = to_number_or_null(payload.max_usage);
    if (payload.is_active !== undefined)      payload.is_active      = Number(payload.is_active);
    if (payload.per_user !== undefined)       payload.per_user       = Number(payload.per_user);

    const campaign = await update_campaign(id, payload);
    return misc.response(res, 200, false, 'Campaign diperbarui', campaign);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── DELETE /admin/promo/campaigns/:id ────────────────────────────────────────

async function remove(req, res) {
  try {
    ensure_admin(req);
    const result = await delete_campaign(Number(req.params.id));
    if (!result.affected_rows) return misc.response(res, 404, true, 'Campaign tidak ditemukan');
    return misc.response(res, 200, false, 'Campaign dihapus');
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── GET /admin/promo/analytics/summary ───────────────────────────────────────

async function analytics_summary(req, res) {
  try {
    ensure_admin(req);
    const { source_type, date_from, date_to } = req.query;
    const data = await get_analytics_summary({ source_type, date_from, date_to });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── GET /admin/promo/analytics/daily ─────────────────────────────────────────

async function analytics_daily(req, res) {
  try {
    ensure_admin(req);
    const { source_type, source_id, date_from, date_to } = req.query;
    if (!source_type || !source_id) {
      return misc.response(res, 400, true, 'source_type dan source_id wajib diisi');
    }
    const data = await get_analytics_daily({
      source_type,
      source_id: Number(source_id),
      date_from,
      date_to,
    });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── GET /admin/membership/tiers ───────────────────────────────────────────────

async function list_tiers(req, res) {
  try {
    ensure_admin(req);
    const tiers = await get_all_tiers_admin();
    return misc.response(res, 200, false, 'OK', tiers);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── POST /admin/membership/tiers ──────────────────────────────────────────────

async function create_membership_tier(req, res) {
  try {
    ensure_admin(req);
    const { name, slug } = req.body;
    if (!name || !slug) return misc.response(res, 400, true, 'name dan slug wajib diisi');

    const tier = await create_tier({
      name: String(name).trim(),
      slug: String(slug).toLowerCase().replace(/\s+/g, '-'),
      description:          req.body.description ?? null,
      icon:                 req.body.icon ?? null,
      color:                req.body.color ?? null,
      min_spending:         Number(req.body.min_spending ?? 0),
      min_points:           Number(req.body.min_points ?? 0),
      discount_percent:     Number(req.body.discount_percent ?? 0),
      point_multiplier:     Number(req.body.point_multiplier ?? 1),
      max_discount_per_order: to_number_or_null(req.body.max_discount_per_order),
      level:                Number(req.body.level ?? 0),
      is_active:            Number(req.body.is_active ?? 1),
    });
    return misc.response(res, 201, false, 'Tier berhasil dibuat', tier);
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── PATCH /admin/membership/tiers/:id ────────────────────────────────────────

async function update_membership_tier(req, res) {
  try {
    ensure_admin(req);
    const id = Number(req.params.id);
    const existing = await get_tier_by_id(id);
    if (!existing) return misc.response(res, 404, true, 'Tier tidak ditemukan');

    const payload = {};
    const allowed = ['name', 'slug', 'description', 'icon', 'color', 'min_spending',
      'min_points', 'discount_percent', 'point_multiplier', 'max_discount_per_order',
      'level', 'is_active'];

    for (const key of allowed) {
      if (req.body[key] !== undefined) payload[key] = req.body[key];
    }
    if (payload.max_discount_per_order !== undefined) {
      payload.max_discount_per_order = to_number_or_null(payload.max_discount_per_order);
    }

    const tier = await update_tier(id, payload);
    return misc.response(res, 200, false, 'Tier diperbarui', tier);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── DELETE /admin/membership/tiers/:id ───────────────────────────────────────

async function delete_membership_tier(req, res) {
  try {
    ensure_admin(req);
    const result = await delete_tier(Number(req.params.id));
    if (!result.affected_rows) return misc.response(res, 404, true, 'Tier tidak ditemukan');
    return misc.response(res, 200, false, 'Tier dihapus');
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── GET /admin/referral/stats ─────────────────────────────────────────────────

async function referral_stats(req, res) {
  try {
    ensure_admin(req);
    const { q, page = 1, limit = 20 } = req.query;
    const data = await get_referral_stats_admin({
      q,
      page: Number(page),
      limit: Math.min(Number(limit), 100),
    });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

module.exports = {
  // campaigns
  list,
  get_one,
  create,
  update,
  remove,
  // analytics
  analytics_summary,
  analytics_daily,
  // membership tiers
  list_tiers,
  create_membership_tier,
  update_membership_tier,
  delete_membership_tier,
  // referral
  referral_stats,
};