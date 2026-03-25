const path = require('path');
const fs = require('fs');

const misc = require('../helpers/response');
const {
  upsert_agent_verification,
  find_verification_by_user_id,
  get_agent_dashboard_stats,
  get_agent_weekly_sales,
  get_agent_bookings,
  get_agent_booking_detail,
  update_agent_booking_status,
  get_agent_customers,
  get_agent_profile_settings,
  update_agent_profile,
  update_agent_password,
  request_agent_bank_change,
} = require('../models/agent');

const { update_verification_status } = require('../models/user');

// ── Avatar URL helpers ─────────────────────────────────────────────────────────

const BASE_URL = () =>
  (process.env.BASE_URL || process.env.API_URL_DEV || 'http://localhost:4000').replace(/\/+$/, '');

/**
 * Resolve avatar path from DB to absolute URL.
 * Handles: null, already-absolute http URLs, and relative paths like /products/stay/file.png
 */
function resolve_avatar_url(avatarPath) {
  if (!avatarPath) return null;
  if (avatarPath.startsWith('http://') || avatarPath.startsWith('https://')) return avatarPath;
  const cleanPath = '/' + avatarPath.replace(/^\/+/, '');
  return `${BASE_URL()}${cleanPath}`;
}

/**
 * Build the relative path to store in DB from req.file.
 * Uses req.file.path (absolute disk path) to derive the public sub-path.
 *
 * Example:
 *   req.file.path = "C:\api\public\products\stay\55_abc.png"   (Windows)
 *   req.file.path = "/var/www/api/public/products/stay/55_abc.png" (Linux)
 *   → stored in DB as: /products/stay/55_abc.png
 *   → resolved URL:    http://host/products/stay/55_abc.png
 */
function build_avatar_db_path(file) {
  if (!file) return null;

  // Normalize slashes (Windows compat)
  const filePath = (file.path || '').replace(/\\/g, '/');

  // Find /public/ segment — everything after it is the public URL path
  const publicIdx = filePath.lastIndexOf('/public/');
  if (publicIdx !== -1) {
    // e.g. /products/stay/55_abc.png
    return '/' + filePath.slice(publicIdx + 8).replace(/^\/+/, '');
  }

  // Fallback: use destination + filename if path parsing fails
  if (file.destination && file.filename) {
    const dest = file.destination.replace(/\\/g, '/');
    const destPublicIdx = dest.lastIndexOf('/public/');
    if (destPublicIdx !== -1) {
      const subPath = dest.slice(destPublicIdx + 8).replace(/^\/+/, '');
      return `/${subPath}/${file.filename}`;
    }
  }

  // Last resort: just use filename
  console.warn('[agent] Could not derive public path from file, using filename only:', file.filename);
  return `/${file.filename}`;
}

// ── Misc helpers ───────────────────────────────────────────────────────────────

function normalize_agent_type(agent_type) {
  const allowed = new Set(['INDIVIDUAL', 'CORPORATE']);
  const upper = String(agent_type || 'INDIVIDUAL').toUpperCase();
  return allowed.has(upper) ? upper : 'INDIVIDUAL';
}

function normalize_agent_specialization(specialization) {
  const allowed = new Set(['TOUR', 'STAY', 'TRANSPORT']);
  const upper = String(specialization || 'TOUR').toUpperCase();
  return allowed.has(upper) ? upper : 'TOUR';
}

module.exports = {
  submit_verification: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');

      const {
        agent_type, id_card_number, tax_id, company_name,
        bank_name, bank_account_number, bank_account_holder, specialization,
      } = req.body;

      if (!id_card_number || !tax_id || !bank_name || !bank_account_number || !bank_account_holder) {
        return misc.response(res, 400, true, 'Semua field wajib diisi');
      }

      let id_document_url = null;
      if (req.file) {
        id_document_url = build_avatar_db_path(req.file);
        console.log(`[AGENT] File uploaded → DB path: ${id_document_url}`);
      }

      if (!id_document_url) {
        return misc.response(res, 400, true, 'Document upload is required');
      }

      const payload = {
        user_id,
        agent_type:           normalize_agent_type(agent_type),
        specialization:       normalize_agent_specialization(specialization),
        id_card_number,
        tax_id,
        company_name:         company_name ? String(company_name).trim() : null,
        bank_name,
        bank_account_number,
        bank_account_holder,
        id_document_url,
      };

      await upsert_agent_verification(payload);
      await update_verification_status(user_id, 'PENDING');

      return misc.response(res, 200, false, 'Verification submitted, status PENDING');
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  get_my_verification: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');
      const verification = await find_verification_by_user_id(user_id);
      return misc.response(res, 200, false, 'OK', verification);
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  get_dashboard_stats: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');
      if (req.session?.user?.role !== 'AGENT') return misc.response(res, 403, true, 'Forbidden');
      const stats = await get_agent_dashboard_stats(user_id);
      return misc.response(res, 200, false, 'OK', stats);
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  get_weekly_sales: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');
      if (req.session?.user?.role !== 'AGENT') return misc.response(res, 403, true, 'Forbidden');
      const sales = await get_agent_weekly_sales(user_id);
      return misc.response(res, 200, false, 'OK', sales);
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  get_my_bookings: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');
      if (req.session?.user?.role !== 'AGENT') return misc.response(res, 403, true, 'Forbidden');
      const { status, payment_status, search, page, limit } = req.query;
      const result = await get_agent_bookings(user_id, { status, payment_status, search, page, limit });
      return misc.response(res, 200, false, 'Agent bookings fetched', result);
    } catch (e) {
      console.error('[Agent Bookings]', e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  get_my_booking_detail: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');
      if (req.session?.user?.role !== 'AGENT') return misc.response(res, 403, true, 'Forbidden');
      const detail = await get_agent_booking_detail(req.params.id, user_id);
      if (!detail) return misc.response(res, 404, true, 'Booking not found');
      return misc.response(res, 200, false, 'Booking detail fetched', detail);
    } catch (e) {
      console.error('[Agent Booking Detail]', e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  update_my_booking_status: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');
      if (req.session?.user?.role !== 'AGENT') return misc.response(res, 403, true, 'Forbidden');
      const result = await update_agent_booking_status(req.params.id, user_id, req.body.status);
      return misc.response(res, 200, false, `Booking #${req.params.id} status updated to ${result.status}`, result);
    } catch (e) {
      console.error('[Agent Booking Update]', e);
      return misc.response(res, e.message?.includes('not found') ? 404 : 400, true, e.message || 'Failed to update booking status');
    }
  },

  get_my_customers: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');
      if (req.session?.user?.role !== 'AGENT') return misc.response(res, 403, true, 'Forbidden');
      const { search, page, limit } = req.query;
      const result = await get_agent_customers(user_id, { search, page, limit });
      return misc.response(res, 200, false, 'Agent customers fetched successfully', result);
    } catch (e) {
      console.error('[Agent Customers]', e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  // ── Profile settings ─────────────────────────────────────────────────────────

  get_profile_settings: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id || req.session?.user?.role !== 'AGENT')
        return misc.response(res, 403, true, 'Forbidden');

      const data = await get_agent_profile_settings(user_id);

      // Resolve avatar URL to absolute before returning
      if (data?.profile?.avatar) {
        data.profile.avatar = resolve_avatar_url(data.profile.avatar);
      }

      return misc.response(res, 200, false, 'Success', data);
    } catch (e) {
      return misc.response(res, 500, true, e.message);
    }
  },

  // ── Update profile (name, phone, address, avatar) ─────────────────────────────
  // Uses the existing upload middleware from routes/agent.js:
  //   Route.put('/profile', requireAuth, upload.single('avatar'), agent.update_profile_details)
  // The existing 'upload' middleware saves to public/products/<specialization>/

  update_profile_details: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id || req.session?.user?.role !== 'AGENT')
        return misc.response(res, 403, true, 'Forbidden');

      // ── Build relative DB path from uploaded file ──────────────────────────
      // build_avatar_db_path extracts the public sub-path from req.file.path,
      // e.g. /products/stay/55_{UUID}.png
      // This is stored in DB as relative path; resolved to absolute on read.
      const db_avatar_path = req.file ? build_avatar_db_path(req.file) : null;

      await update_agent_profile(user_id, {
        name:    req.body.name,
        phone:   req.body.phone,
        address: req.body.address,
        avatar:  db_avatar_path, // relative path, or null if no file uploaded
      });

      // Update session with ABSOLUTE URL so DashboardLayout/UserAvatar
      // renders correctly immediately without requiring re-login
      if (req.session?.user) {
        if (req.body.name) req.session.user.name = req.body.name;
        if (db_avatar_path) {
          req.session.user.avatar = resolve_avatar_url(db_avatar_path);
        }
      }

      return misc.response(res, 200, false, 'Profile updated successfully');
    } catch (e) {
      return misc.response(res, 500, true, e.message);
    }
  },

  update_password: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id || req.session?.user?.role !== 'AGENT')
        return misc.response(res, 403, true, 'Forbidden');

      const { old_password, new_password, confirm_password } = req.body;
      if (!old_password || !new_password || !confirm_password)
        return misc.response(res, 400, true, 'Password fields required');
      if (new_password !== confirm_password)
        return misc.response(res, 400, true, 'Passwords do not match');
      if (new_password.length < 8)
        return misc.response(res, 400, true, 'Password must be at least 8 characters');

      await update_agent_password(user_id, old_password, new_password);

      if (req.session) req.session.destroy();
      return misc.response(res, 200, false, 'Password updated');
    } catch (e) {
      return misc.response(res, e.message.includes('Incorrect') ? 401 : 500, true, e.message);
    }
  },

  request_bank_change: async (req, res) => {
    try {
      const user_id = req.session?.user?.id;
      if (!user_id || req.session?.user?.role !== 'AGENT')
        return misc.response(res, 403, true, 'Forbidden');

      const { bank_name, bank_account_number, bank_account_holder } = req.body;
      if (!bank_name || !bank_account_number || !bank_account_holder)
        return misc.response(res, 400, true, 'All fields required');

      await request_agent_bank_change(user_id, { bank_name, bank_account_number, bank_account_holder });
      return misc.response(res, 200, false, 'Bank change requested. Pending admin approval.');
    } catch (e) {
      return misc.response(res, 500, true, e.message);
    }
  },
};