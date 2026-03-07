const bcrypt = require('bcryptjs');
const misc = require('../helpers/response');

const { find_user_by_email, create_user, find_user_by_id, update_user } = require('../models/user');

const { create_default_profile } = require('../models/profile');

const crypto = require('crypto');
const { send_reset_password_email } = require('../helpers/mailer');
const db = require('../configs/db');

require('dotenv').config();

const ROLE_ALLOWED = new Set(['CUSTOMER', 'AGENT', 'ADMIN']);
const SPEC_ALLOWED = new Set(['TOUR', 'STAY', 'TRANSPORT']);

function normalize_role(role) {
  if (!role) return 'CUSTOMER';
  const upper = String(role).toUpperCase();
  return ROLE_ALLOWED.has(upper) ? upper : 'CUSTOMER';
}

function normalize_specialization(role, specialization) {
  if (role !== 'AGENT') return null;
  if (!specialization) return null;
  const upper = String(specialization).toUpperCase();
  return SPEC_ALLOWED.has(upper) ? upper : null;
}

function set_session_user(req, user) {
  req.session.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    specialization: user.specialization ?? null,
    name: user.name ?? null,
  };
}

function to_safe_user(user_row) {
  if (!user_row) return null;
  const { password_hash, ...safe_user } = user_row;
  return safe_user;
}

module.exports = {
  register: async (req, res) => {
    try {
      const { name, email, password, role, specialization } = req.body || {};

      if (!name || !email || !password) {
        return misc.response(res, 400, true, 'name, email, dan password wajib diisi');
      }

      const existing = await find_user_by_email(email);
      if (existing) {
        return misc.response(res, 409, true, 'Email sudah terdaftar');
      }

      const norm_role = normalize_role(role);
      const norm_spec = normalize_specialization(norm_role, specialization);

      const password_hash = await bcrypt.hash(password, 10);

      const new_user = await create_user({
        name,
        email,
        password_hash,
        role: norm_role,
        specialization: norm_spec,
      });

      try {
        await create_default_profile(new_user.id);
      } catch (e) {
        console.error('[PROFILE] create_default_profile failed:', new_user?.id, e?.message);
      }

      set_session_user(req, new_user);

      req.session.save((err) => {
        if (err) {
          console.error('[SESSION] save error:', err);
          return misc.response(res, 500, true, 'Failed to create session');
        }

        return misc.response(res, 201, false, 'Register successfully', {
          user: req.session.user,
        });
      });
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  login: async (req, res) => {
    try {
      const { email, password } = req.body || {};
      console.log('Login attempt for:', email);

      if (!email || !password) {
        return misc.response(res, 400, true, 'email dan password wajib diisi');
      }

      const user = await find_user_by_email(email);
      console.log('User found in DB:', user ? 'YES' : 'NO');
      if (!user) {
        return misc.response(res, 401, true, 'Email atau password salah');
      }

      const match = await bcrypt.compare(password, user.password_hash);
      console.log('Password match:', match); // DEBUG 3
      if (!match) {
        return misc.response(res, 401, true, 'Email atau password salah');
      }

      if (!user.is_active) {
        return misc.response(res, 403, true, 'Akun tidak aktif');
      }

      req.session.regenerate((regen_err) => {
        if (regen_err) {
          console.error('[SESSION] regenerate error:', regen_err);
          return misc.response(res, 500, true, 'Failed to create session');
        }

        set_session_user(req, user);

        req.session.save((save_err) => {
          if (save_err) {
            console.error('[SESSION] save error:', save_err);
            return misc.response(res, 500, true, 'Failed to persist session');
          }

          return misc.response(res, 200, false, 'Login successfully', {
            user: req.session.user,
          });
        });
      });
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  me: async (req, res) => {
    try {
      const user_id = req.session?.user?.id || req.user?.id;

      if (!user_id) {
        return misc.response(res, 401, true, 'Unauthorized');
      }

      const user = await find_user_by_id(user_id);
      if (!user) {
        return misc.response(res, 404, true, 'User not found');
      }

      return misc.response(res, 200, false, 'OK', {
        user: to_safe_user(user),
      });
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  logout: async (req, res) => {
    try {
      if (!req.session) {
        return misc.response(res, 200, false, 'Logged out');
      }

      req.session.destroy((err) => {
        if (err) {
          console.error('[SESSION] destroy error:', err);
          return misc.response(res, 500, true, 'Failed to logout');
        }

        res.clearCookie('sid');
        return misc.response(res, 200, false, 'Logged out');
      });
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  update_profile: async (req, res) => {
    try {
      const user_id = req.session?.user?.id || req.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');

      const { name, email } = req.body;
      const updateData = {};

      if (name) updateData.name = name;
      if (email) updateData.email = email;

      // req.file berasal dari middleware upload.single()
      if (req.file) {
        // Kita simpan path relatif atau hanya nama filenya saja
        updateData.profile_photo = req.file.filename;
      }

      // Jalankan update di DB
      const updatedUser = await update_user(user_id, updateData);

      // PENTING: Update data di session agar saat reload/refresh data tetap terbaru
      req.session.user = {
        ...req.session.user,
        name: updatedUser.name,
        email: updatedUser.email,
        // Optional: Jika ingin session menyimpan info foto
        profile_photo: updatedUser.profile_photo
      };

      req.session.save((err) => {
        if (err) return misc.response(res, 500, true, 'Failed to update session');

        return misc.response(res, 200, false, 'Profile updated successfully', {
          user: to_safe_user(updatedUser),
        });
      });
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  forgot_password: async (req, res) => {
    try {
      const { email } = req.body;
      const user = await find_user_by_email(email);

      if (!user) {
        // Demi keamanan, tetap beri respon sukses agar email tidak di-probe
        return misc.response(res, 200, false, 'Jika email terdaftar, instruksi reset akan dikirim.');
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 3600000); // 1 Jam

      // Simpan ke tabel password_resets (Hapus yang lama jika ada)
      await db.execute('DELETE FROM password_resets WHERE email = ?', [email]);
      await db.execute('INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)', [email, token, expires]);

      await send_reset_password_email(user.email, user.name, token, user.role.toLowerCase());

      return misc.response(res, 200, false, 'Email reset password telah dikirim');
    } catch (e) {
      return misc.response(res, 500, true, e.message);
    }
  },

  reset_password: async (req, res) => {
    try {
      const { token, password } = req.body;

      const [rows] = await db.execute('SELECT * FROM password_resets WHERE token = ? LIMIT 1', [token]);
      const resetRequest = rows[0];
      if (!resetRequest || new Date() > new Date(resetRequest.expires_at)) {
        return misc.response(res, 400, true, 'Token tidak valid atau sudah kadaluwarsa');
      }

      const password_hash = await bcrypt.hash(password, 10);

      await db.execute('UPDATE users SET password_hash = ?, updated_at = NOW() WHERE email = ?', [password_hash, resetRequest.email]);

      // Hapus token setelah digunakan
      await db.execute('DELETE FROM password_resets WHERE email = ?', [resetRequest.email]);

      return misc.response(res, 200, false, 'Password berhasil diperbarui. Silakan login.');
    } catch (e) {
      return misc.response(res, 500, true, e.message);
    }
  },

  validate_reset_token: async (req, res) => {
    try {
      const { token } = req.query;
      if (!token) {
        return misc.response(res, 400, true, 'Token is required');
      }

      const [rows] = await db.execute(
        'SELECT email, expires_at FROM password_resets WHERE token = ? LIMIT 1',
        [token]
      );
      const resetRequest = rows[0];

      if (!resetRequest || new Date() > new Date(resetRequest.expires_at)) {
        return misc.response(res, 400, true, 'Token tidak valid atau sudah kadaluwarsa');
      }

      return misc.response(res, 200, false, 'Token valid', { email: resetRequest.email });
    } catch (e) {
      return misc.response(res, 500, true, e.message);
    }
  }
};
