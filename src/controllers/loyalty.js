// src/controllers/loyalty.js
const misc = require('../helpers/response');
const {
  get_point_balance,
  upsert_point_balance,
  get_point_transactions,
  create_point_transaction,
  get_all_tiers,
  get_user_membership,
  upsert_user_membership,
  get_user_total_spending,
  resolve_tier_for_user,
  get_redemptions,
  create_redemption,
  get_referral_code_by_user,
  create_referral_code,
} = require('../models/loyalty');
const { get_voucher_by_code, create_voucher } = require('../models/voucher');

// ── Auth helper ───────────────────────────────────────────────────────────────

function get_session_user(req) {
  return req?.session?.user || null;
}

function ensure_customer(req) {
  const user = get_session_user(req);
  if (!user) {
    const err = new Error('Unauthorized'); err.status_code = 401; throw err;
  }
  // Admin dan customer boleh akses loyalty
  return user;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generate_referral_code(name) {
  const clean = (name || 'USER').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  const suffix = Math.random().toString(36).toUpperCase().slice(2, 6);
  return `${clean}${suffix}`;
}

const VOUCHER_RATES = [
  { points: 100,  value: 10_000  },
  { points: 250,  value: 25_000  },
  { points: 500,  value: 50_000  },
  { points: 1000, value: 100_000 },
  { points: 2000, value: 210_000 },
];

function get_voucher_value_for_points(points) {
  // cari rate yang tepat, jika tidak ada gunakan rate 10pts = Rp 1.000
  const rate = VOUCHER_RATES.find(r => r.points === points);
  return rate ? rate.value : Math.floor(points / 10) * 1000;
}

// ── GET /loyalty/balance ──────────────────────────────────────────────────────

async function get_balance(req, res) {
  try {
    const user = ensure_customer(req);
    const balance = await get_point_balance(user.id);
    return misc.response(res, 200, false, 'OK', balance);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── GET /loyalty/transactions ─────────────────────────────────────────────────

async function get_transactions(req, res) {
  try {
    const user = ensure_customer(req);
    const { page = 1, limit = 10, type } = req.query;
    const data = await get_point_transactions(user.id, {
      page: Number(page),
      limit: Math.min(Number(limit), 50),
      type,
    });
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── GET /loyalty/membership ───────────────────────────────────────────────────

async function get_membership(req, res) {
  try {
    const user = ensure_customer(req);

    // Cek apakah tier user perlu diupdate
    const correct_tier = await resolve_tier_for_user(user.id);
    const current_mem  = await get_user_membership(user.id);

    // Upsert jika tier berubah atau belum ada
    if (correct_tier && (!current_mem || current_mem.tier_id !== correct_tier.id)) {
      await upsert_user_membership(user.id, correct_tier.id);
    }

    const membership = await get_user_membership(user.id);
    const all_tiers  = await get_all_tiers();
    const total_spending = await get_user_total_spending(user.id);

    if (!membership) {
      return misc.response(res, 404, true, 'Membership tidak ditemukan');
    }

    // Susun tier object
    const current_tier = {
      id:                   membership.tier_id,
      name:                 membership.tier_name,
      slug:                 membership.tier_slug,
      color:                membership.tier_color,
      description:          membership.tier_description,
      icon:                 membership.tier_icon,
      discount_percent:     membership.discount_percent,
      point_multiplier:     membership.point_multiplier,
      max_discount_per_order: membership.max_discount_per_order,
      level:                membership.tier_level,
      min_spending:         membership.min_spending,
      min_points:           membership.min_points,
    };

    // Cari next tier
    const sorted_tiers = [...all_tiers].sort((a, b) => a.level - b.level);
    const next_tier = sorted_tiers.find(t => t.level > current_tier.level) || null;

    let progress_percent = 100;
    let spending_to_next = 0;

    if (next_tier) {
      const range = Number(next_tier.min_spending) - Number(current_tier.min_spending);
      const progress = total_spending - Number(current_tier.min_spending);
      progress_percent = range > 0 ? Math.min(100, Math.round((progress / range) * 100)) : 100;
      spending_to_next = Math.max(0, Number(next_tier.min_spending) - total_spending);
    }

    return misc.response(res, 200, false, 'OK', {
      tier:             current_tier,
      total_spending,
      total_points_earned: 0, // bisa diisi dari lifetime_earned
      tier_achieved_at: membership.tier_achieved_at,
      tier_expires_at:  membership.tier_expires_at || null,
      next_tier,
      progress_percent,
      spending_to_next,
    });
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── GET /loyalty/tiers ────────────────────────────────────────────────────────

async function get_tiers(req, res) {
  try {
    const tiers = await get_all_tiers();
    return misc.response(res, 200, false, 'OK', tiers);
  } catch (e) {
    return misc.response(res, 500, true, e.message);
  }
}

// ── POST /loyalty/redeem ──────────────────────────────────────────────────────

async function redeem_points(req, res) {
  try {
    const user = ensure_customer(req);
    const { redemption_type, points, order_id } = req.body;

    if (!redemption_type || !['voucher', 'checkout'].includes(redemption_type)) {
      return misc.response(res, 400, true, 'redemption_type harus voucher atau checkout');
    }
    if (!points || Number(points) <= 0) {
      return misc.response(res, 400, true, 'points harus angka positif');
    }

    const pts = Number(points);
    const balance = await get_point_balance(user.id);

    if (Number(balance.balance) < pts) {
      return misc.response(res, 400, true, 'Saldo point tidak cukup');
    }

    let voucher_id    = null;
    let voucher_value = null;
    let voucher_code  = null;
    let discount_amount = null;
    let expires_at    = null;

    if (redemption_type === 'voucher') {
      // Validasi pts harus sesuai dengan salah satu rate yang tersedia
      const rate = VOUCHER_RATES.find(r => r.points === pts);
      if (!rate) {
        return misc.response(res, 400, true, 'Jumlah point tidak valid untuk penukaran voucher');
      }

      voucher_value = rate.value;

      // Generate voucher code unik
      const code = `PTS${user.id}${Date.now().toString(36).toUpperCase()}`;
      const exp_date = new Date(); exp_date.setDate(exp_date.getDate() + 30);
      expires_at = exp_date.toISOString().split('T')[0];

      // Buat voucher baru
      const voucher = await create_voucher({
        code,
        description: `Voucher dari ${pts} point`,
        type: 'fixed',
        value: voucher_value,
        max_discount: null,
        min_transaction: 0,
        scope: 'all',
        max_usage: 1,
        per_user: 1,
        starts_at: null,
        expires_at: exp_date.toISOString().slice(0, 19).replace('T', ' '),
        is_active: 1,
      });

      voucher_id   = voucher.id;
      voucher_code = voucher.code;

    } else {
      // checkout — 10 pts = Rp 1.000
      if (pts % 10 !== 0) {
        return misc.response(res, 400, true, 'Point harus kelipatan 10');
      }
      discount_amount = Math.floor(pts / 10) * 1000;
    }

    // Kurangi balance
    const new_balance = Number(balance.balance) - pts;
    await upsert_point_balance(user.id, -pts, 0, pts, 0);

    // Catat transaksi
    await create_point_transaction(user.id, {
      type: 'spend_redemption',
      points: -pts,
      balance_after: new_balance,
      ref_type: redemption_type,
      ref_id: voucher_id || order_id || null,
      note: redemption_type === 'voucher'
        ? `Tukar ${pts} pts → voucher ${voucher_code}`
        : `Tukar ${pts} pts → potongan checkout Rp ${discount_amount?.toLocaleString('id-ID')}`,
    });

    // Buat redemption record
    const redemption = await create_redemption(user.id, {
      redemption_type,
      points_spent: pts,
      voucher_id,
      voucher_value,
      order_id: order_id || null,
      discount_amount,
      expires_at,
    });

    return misc.response(res, 201, false, 'Redeem berhasil', {
      ...redemption,
      voucher_code,
    });
  } catch (e) {
    console.error(e);
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── GET /loyalty/redemptions ──────────────────────────────────────────────────

async function get_redemptions_list(req, res) {
  try {
    const user = ensure_customer(req);
    const data = await get_redemptions(user.id);
    return misc.response(res, 200, false, 'OK', data);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── GET /loyalty/referral ─────────────────────────────────────────────────────

async function get_my_referral(req, res) {
  try {
    const user = ensure_customer(req);
    const code = await get_referral_code_by_user(user.id);
    if (!code) return misc.response(res, 404, true, 'Belum punya referral code');
    return misc.response(res, 200, false, 'OK', code);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── POST /loyalty/referral/generate ──────────────────────────────────────────

async function generate_referral(req, res) {
  try {
    const user = ensure_customer(req);

    // Cek sudah punya atau belum
    const existing = await get_referral_code_by_user(user.id);
    if (existing) return misc.response(res, 200, false, 'OK', existing);

    const code = generate_referral_code(user.name);
    const referral = await create_referral_code(user.id, code);
    return misc.response(res, 201, false, 'Referral code dibuat', referral);
  } catch (e) {
    return misc.response(res, e.status_code || 500, true, e.message);
  }
}

// ── Exported helper: beri point setelah booking selesai ───────────────────────
// Dipanggil dari booking controller setelah status → COMPLETED

async function award_purchase_points(user_id, order_id, order_amount) {
  try {
    // Cek tier user untuk multiplier
    const membership = await get_user_membership(user_id);
    const multiplier = membership ? Number(membership.point_multiplier) : 1;

    // 1 point per Rp 10.000 × multiplier
    const base_points = Math.floor(order_amount / 10_000);
    const total_points = Math.max(1, Math.round(base_points * multiplier));

    const balance = await get_point_balance(user_id);
    const new_balance = Number(balance.balance) + total_points;

    await upsert_point_balance(user_id, total_points, total_points, 0, 0);
    await create_point_transaction(user_id, {
      type: 'earn_purchase',
      points: total_points,
      balance_after: new_balance,
      ref_type: 'booking',
      ref_id: order_id,
      note: `${total_points} pts dari order #${order_id} (${multiplier}× multiplier)`,
    });

    // Update tier setelah dapat poin
    const correct_tier = await resolve_tier_for_user(user_id);
    if (correct_tier) await upsert_user_membership(user_id, correct_tier.id);

    return total_points;
  } catch (e) {
    console.error('[award_purchase_points]', e);
    return 0;
  }
}

module.exports = {
  get_balance,
  get_transactions,
  get_membership,
  get_tiers,
  redeem_points,
  get_redemptions_list,
  get_my_referral,
  generate_referral,
  // helper untuk dipanggil controller lain
  award_purchase_points,
};