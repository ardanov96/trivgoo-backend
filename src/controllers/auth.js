const bcrypt = require('bcryptjs');
const misc = require('../helpers/response');

const { find_user_by_email, create_user, find_user_by_id } = require('../models/user');

const { create_default_profile } = require('../models/profile');

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
};
