// src/controllers/agent_profile.js
// Handles agent profile settings, password change, and bank change requests

const bcrypt    = require('bcryptjs');
const path      = require('path');
const fs        = require('fs');
const misc      = require('../helpers/response');
const userModel = require('../models/user');
const db        = require('../configs/db');

// ── Helpers ───────────────────────────────────────────────────────────────────

function get_agent(req) {
  const user = req?.session?.user;
  if (!user) {
    const err = new Error('Unauthorized');
    err.status_code = 401;
    throw err;
  }
  if (user.role !== 'AGENT') {
    const err = new Error('Forbidden');
    err.status_code = 403;
    throw err;
  }
  return user;
}

async function query(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

/**
 * Resolve upload directory & public URL path based on agent specialization.
 *
 * Directory layout (matching existing convention):
 *   TOUR      → api-trivgoo/public/products/tour/
 *   STAY      → api-trivgoo/public/products/stay/
 *   TRANSPORT → api-trivgoo/public/products/transport/
 *
 * @param {string} specialization  'TOUR' | 'STAY' | 'TRANSPORT'
 * @returns {{ diskDir: string, urlPath: string }}
 */
function resolve_avatar_dir(specialization) {
  const spec = (specialization || '').toUpperCase();
  const folderMap = {
    TOUR:      'tour',
    STAY:      'stay',
    TRANSPORT: 'transport',
  };
  const folder = folderMap[spec] || 'tour'; // safe fallback

  // Absolute path on disk
  // __dirname = src/controllers  →  ../../public/products/<folder>
  const diskDir = path.join(__dirname, '../../public/products', folder);

  // Public URL sub-path served by Express static
  const urlPath = `/products/${folder}`;

  return { diskDir, urlPath };
}

// ── GET /agent/profile/settings ───────────────────────────────────────────────

async function get_profile_settings(req, res) {
  try {
    const agent = get_agent(req);

    const [profileRows] = await db.query(
      `SELECT
         u.id, u.name, u.email, u.phone_number AS phone,
         u.specialization,
         up.address, up.avatar_url AS avatar
       FROM users u
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE u.id = ?
       LIMIT 1`,
      [agent.id]
    );
    const profile = profileRows[0] || {};

    const [bizRows] = await db.query(
      `SELECT company_name, agent_type, tax_id,
              bank_name, bank_account_number, bank_account_holder, status
       FROM agent_verifications
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [agent.id]
    );
    const business = bizRows[0] || null;

    const [reqRows] = await db.query(
      `SELECT bank_name, bank_account_number, bank_account_holder, created_at
       FROM bank_change_requests
       WHERE user_id = ? AND status = 'pending'
       ORDER BY created_at DESC
       LIMIT 1`,
      [agent.id]
    );
    const pending_bank_request = reqRows[0] || null;

    // Resolve avatar to absolute URL if stored as relative path
    let avatarUrl = profile.avatar || null;
    if (avatarUrl && !avatarUrl.startsWith('http')) {
      const BASE_URL = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
      avatarUrl = `${BASE_URL}/${avatarUrl.replace(/^\/+/, '')}`;
    }

    return misc.response(res, 200, false, 'OK', {
      profile: {
        name:           profile.name           || '',
        email:          profile.email          || '',
        phone:          profile.phone          || '',
        address:        profile.address        || '',
        avatar:         avatarUrl,
        specialization: profile.specialization || null,
      },
      business,
      pending_bank_request,
    });
  } catch (e) {
    console.error('[agent_profile] get_profile_settings:', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

// ── PUT /agent/profile ────────────────────────────────────────────────────────
// Body (multipart/form-data): name, phone, address, avatar (file, optional)
// Multer destination is set dynamically in the route using resolve_avatar_dir.

async function update_profile(req, res) {
  try {
    const agent = get_agent(req);

    const name    = (req.body?.name    || '').trim();
    const phone   = (req.body?.phone   || '').trim();
    const address = (req.body?.address || '').trim();

    if (!name) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return misc.response(res, 400, true, 'Nama tidak boleh kosong');
    }

    if (phone) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 10) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return misc.response(res, 400, true, 'Nomor WA / HP tidak valid (minimal 10 digit)');
      }
    }

    // ── Build avatar URL ──────────────────────────────────────────────────────
    // Derive the public URL directly from req.file.destination (the absolute
    // disk path where multer saved the file).  This is reliable regardless of
    // which multer instance ran, and avoids depending on the urlPath injection.
    //
    // req.file.destination example:
    //   /home/ubuntu/api-trivgoo/public/products/stay
    // Public root served by Express static:
    //   <project_root>/public  →  BASE_URL/
    // So the URL becomes:
    //   BASE_URL + /products/stay/ + filename
    let avatar_url = null;
    if (req.file) {
      const BASE_URL = (process.env.BASE_URL || 'http://localhost:4000').replace(/\/$/, '');

      // Find the 'public' segment in the destination path and take everything after it
      // e.g.  "/var/www/api-trivgoo/public/products/stay"  →  "/products/stay"
      const dest       = req.file.destination.replace(/\\/g, '/'); // normalize Windows slashes
      const publicIdx  = dest.lastIndexOf('/public/');
      const urlPath    = publicIdx !== -1
        ? dest.slice(publicIdx + 7)          // "/products/stay"
        : `/products/unknown`;                // safe fallback

      avatar_url = `${BASE_URL}${urlPath}/${req.file.filename}`;
    }

    // Update users table
    await db.query(
      `UPDATE users SET name = ?, phone_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [name, phone || null, agent.id]
    );

    // Upsert user_profiles
    if (avatar_url) {
      await db.query(
        `INSERT INTO user_profiles (user_id, address, avatar_url)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           address    = VALUES(address),
           avatar_url = VALUES(avatar_url),
           updated_at = CURRENT_TIMESTAMP`,
        [agent.id, address || null, avatar_url]
      );
    } else {
      await db.query(
        `INSERT INTO user_profiles (user_id, address)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE
           address    = VALUES(address),
           updated_at = CURRENT_TIMESTAMP`,
        [agent.id, address || null]
      );
    }

    // Refresh session so navbar/avatar updates without re-login
    if (req.session?.user) {
      req.session.user.name = name;
      if (avatar_url) req.session.user.avatar = avatar_url;
    }

    return misc.response(res, 200, false, 'Profil berhasil diperbarui');
  } catch (e) {
    if (req.file) fs.unlink(req.file.path, () => {}); // cleanup on error
    console.error('[agent_profile] update_profile:', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

// ── PUT /agent/profile/password ───────────────────────────────────────────────

async function update_password(req, res) {
  try {
    const agent = get_agent(req);
    const { old_password, new_password, confirm_password } = req.body || {};

    if (!old_password || !new_password || !confirm_password)
      return misc.response(res, 400, true, 'Semua field kata sandi wajib diisi');
    if (new_password.length < 8)
      return misc.response(res, 400, true, 'Kata sandi baru minimal 8 karakter');
    if (new_password !== confirm_password)
      return misc.response(res, 400, true, 'Konfirmasi kata sandi tidak cocok');

    const isMatch = await userModel.verify_password(agent.id, old_password);
    if (!isMatch)
      return misc.response(res, 400, true, 'Kata sandi saat ini salah');

    const hashed = await bcrypt.hash(new_password, 10);
    await db.query(
      `UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [hashed, agent.id]
    );

    req.session.destroy(() => {});
    return misc.response(res, 200, false, 'Kata sandi berhasil diperbarui');
  } catch (e) {
    console.error('[agent_profile] update_password:', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

// ── POST /agent/profile/bank-change-request ───────────────────────────────────

async function request_bank_change(req, res) {
  try {
    const agent = get_agent(req);
    const { bank_name, bank_account_number, bank_account_holder } = req.body || {};

    if (!bank_name || !bank_account_number || !bank_account_holder)
      return misc.response(res, 400, true, 'Semua field rekening wajib diisi');

    const existing = await query(
      `SELECT id FROM bank_change_requests WHERE user_id = ? AND status = 'pending' LIMIT 1`,
      [agent.id]
    );
    if (existing.length > 0)
      return misc.response(res, 409, true, 'Sudah ada permintaan penggantian rekening yang sedang diproses');

    await db.query(
      `INSERT INTO bank_change_requests
         (user_id, bank_name, bank_account_number, bank_account_holder, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [agent.id, bank_name, String(bank_account_number), bank_account_holder]
    );

    return misc.response(res, 201, false, 'Permintaan penggantian rekening berhasil dikirim');
  } catch (e) {
    console.error('[agent_profile] request_bank_change:', e);
    return misc.response(res, e.status_code || 500, true, e.message || 'Internal server error');
  }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  get_profile_settings,
  update_profile,
  update_password,
  request_bank_change,
  resolve_avatar_dir, // exported so route file can use it in multer destination
};