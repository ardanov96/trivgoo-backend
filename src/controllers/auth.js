const bcrypt = require('bcryptjs');
const misc = require('../helpers/response');

const {
  find_user_by_email,
  create_user,
  find_user_by_id,
  find_user_by_referral_code,
  update_user,
  save_activation_token,
  verify_email_token,
  mark_email_verified,
  increment_referral_clicks,
  get_referred_users
} = require('../models/user');

const { create_default_profile } = require('../models/profile');
const { get_balance: get_point_balance } = require('../models/loyalty');

const crypto = require('crypto');
const { send_reset_password_email, send_activation_email } = require('../helpers/mailer');
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
    pending_email: user.pending_email ?? null,
    role: user.role,
    specialization: user.specialization ?? null,
    name: user.name ?? null,
    referral_code: user.referral_code ?? null,
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
      console.log('\n[AUTH] === INCOMING REGISTER REQUEST ===');
      console.log('[AUTH] Payload:', req.body);
      const { name, email, password, role, specialization, phone_number, referral_code } = req.body || {};

      if (!name || !email || !password) {
        console.warn('[AUTH] Missing fields! Name/Email/Password');
        return misc.response(res, 400, true, 'name, email, dan password wajib diisi');
      }

      const existing = await find_user_by_email(email);
      if (existing) {
        return misc.response(res, 409, true, 'Email sudah terdaftar');
      }

      const norm_role = normalize_role(role);
      const norm_spec = normalize_specialization(norm_role, specialization);

      const password_hash = await bcrypt.hash(password, 10);

      let referred_by_id = null;
      if (referral_code) {
        try {
          const referrer = await find_user_by_referral_code(referral_code.toUpperCase());
          if (referrer && referrer.id) {
            referred_by_id = referrer.id;
          }
        } catch (e) {
          console.error('[AUTH] Failed to lookup referral_code:', e);
        }
      }

      const new_user = await create_user({
        name,
        email,
        password_hash,
        role: norm_role,
        specialization: norm_spec,
        phone_number,
        referred_by_id,
      });

      try {
        await create_default_profile(new_user.id);
      } catch (e) {
        console.error('[PROFILE] create_default_profile failed:', new_user?.id, e?.message);
      }

      // -- Email Verification Logic --
      try {
        console.log('[AUTH] Generating token and sending Activation Email to:', new_user.email);
        const activationToken = crypto.randomBytes(32).toString('hex');
        await save_activation_token(new_user.email, activationToken);
        await send_activation_email(new_user.email, new_user.name, activationToken, new_user.role.toLowerCase());
        console.log('[AUTH] Activation Email sent SUCCESSFULLY via Nodemailer!');
      } catch (e) {
        console.error('[EMAIL] Failed to send activation email:', e?.message);
        // Kita biarkan pendaftaran tetap sukses meskipun gagal kirim email (bisa di-\`resend\` nanti)
      }
      // ------------------------------

      // Kami tidak lagi membuat session di sini. User harus memverifikasi email untuk login.
      return misc.response(res, 201, false, 'Register successfully. Please check your email to activate your account.');
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
        return misc.response(res, 403, true, 'Akun Anda telah dinonaktifkan. Hubungi support untuk bantuan.');
      }

      if (user.verification_status === 'UNVERIFIED') {
        return misc.response(res, 403, true, 'Akun Anda belum teraktivasi. Silakan cek email Anda untuk mengaktifkan akun.', { is_unverified: true });
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
            user: to_safe_user(user),
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

      const currentUser = await find_user_by_id(user_id);
      if (!currentUser) return misc.response(res, 404, true, 'User not found');

      const { name, email, tanggal_lahir, jenis_kelamin, tempat_tinggal, phone_number } = req.body;
      const updateData = {};

      if (name && name !== currentUser.name) updateData.name = name;
      if (email && email !== currentUser.email) {
        const existing = await find_user_by_email(email);
        if (existing) {
          return misc.response(res, 409, true, 'Email sudah terdaftar pada akun lain');
        }
        updateData.pending_email = email;
        
        // Generate and send token for pending email
        const activationToken = crypto.randomBytes(32).toString('hex');
        await save_activation_token(email, activationToken);
        await send_activation_email(email, currentUser.name || name, activationToken, currentUser.role.toLowerCase());
      }
      if (tanggal_lahir !== undefined && tanggal_lahir !== currentUser.tanggal_lahir) updateData.tanggal_lahir = tanggal_lahir || null;
      if (jenis_kelamin !== undefined && jenis_kelamin !== currentUser.jenis_kelamin) updateData.jenis_kelamin = jenis_kelamin || null;
      if (tempat_tinggal !== undefined && tempat_tinggal !== currentUser.tempat_tinggal) updateData.tempat_tinggal = tempat_tinggal || null;
      if (phone_number !== undefined && phone_number !== currentUser.phone_number) updateData.phone_number = phone_number || null;

      // req.file berasal dari middleware upload.single()
      if (req.file) {
        // Kita simpan path relatif atau hanya nama filenya saja
        updateData.profile_photo = req.file.filename;
      }

      // Jalankan update di DB jika ada data yang berubah
      let updatedUser = currentUser;
      if (Object.keys(updateData).length > 0) {
        updatedUser = await update_user(user_id, updateData) || currentUser;
      }

      // PENTING: Update data di session agar saat reload/refresh data tetap terbaru
      req.session.user = {
        ...req.session.user,
        name: updatedUser.name,
        email: updatedUser.email,
        pending_email: updatedUser.pending_email,
        referral_code: updatedUser.referral_code,
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
      console.log('\n[AUTH] === INCOMING FORGOT PASSWORD REQUEST ===');
      console.log('[AUTH] Raw Payload:', req.body);
      const { email } = req.body;
      
      console.log(`[AUTH] Searching database for EXACT email match: "${email}"...`);
      const user = await find_user_by_email(email);

      if (!user) {
        console.warn(`[AUTH] WARNING: User with email "${email}" NOT FOUND in the local database!`);
        console.warn('[AUTH] Silently returning 200 OK (Security Decoy) so frontend doesnt throw error.');
        // Demi keamanan, tetap beri respon sukses agar email tidak di-probe
        return misc.response(res, 200, false, '[DECOY] Jika email terdaftar, instruksi reset akan dikirim.');
      }
      
      console.log(`[AUTH] User FOUND! Proceeding to generate reset token & send email for: ${user.name}`);

      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 3600000); // 1 Jam

      // Simpan ke tabel password_resets (Hapus yang lama jika ada)
      await db.execute('DELETE FROM password_resets WHERE email = ?', [email]);
      await db.execute('INSERT INTO password_resets (email, token, expires_at) VALUES (?, ?, ?)', [email, token, expires]);

      console.log('[AUTH] Sending Reset Password Email...');
      await send_reset_password_email(user.email, user.name, token, user.role.toLowerCase());
      console.log('[AUTH] Reset Password Email sent SUCCESSFULLY via Nodemailer!');

      return misc.response(res, 200, false, '[REAL] Email reset password telah dikirim ke inbok kamu');
    } catch (e) {
      console.error('[AUTH] ERROR in forgot_password:', e);
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
  },

  verify_email: async (req, res) => {
    try {
      const { token } = req.query;
      if (!token) {
        return misc.response(res, 400, true, 'Token aktivasi tidak ditemukan');
      }

      const activationRecord = await verify_email_token(token);
      if (!activationRecord) {
        return misc.response(res, 400, true, 'Token aktivasi tidak valid atau telah kedaluwarsa');
      }

      // Tandai diverifikasi (VERIFIED) dan bersihkan tokennya
      await mark_email_verified(activationRecord.email);

      return misc.response(res, 200, false, 'Email berhasil diverifikasi! Silakan login.');
    } catch (e) {
      return misc.response(res, 500, true, e.message);
    }
  },

  resend_verification: async (req, res) => {
    try {
      const user_id = req.session?.user?.id || req.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');

      const user = await find_user_by_id(user_id);
      if (!user) return misc.response(res, 404, true, 'User not found');

      const targetEmail = user.pending_email || user.email;
      if (user.verification_status === 'VERIFIED' && !user.pending_email) {
        return misc.response(res, 400, true, 'Email sudah terverifikasi');
      }

      await db.execute('DELETE FROM email_verifications WHERE email = ?', [targetEmail]);

      const activationToken = crypto.randomBytes(32).toString('hex');
      await save_activation_token(targetEmail, activationToken);
      await send_activation_email(targetEmail, user.name, activationToken, user.role.toLowerCase());

      return misc.response(res, 200, false, 'Email verifikasi telah dikirim ulang');
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  resend_unverified: async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return misc.response(res, 400, true, 'Email is required');

      const user = await find_user_by_email(email);
      if (!user) return misc.response(res, 404, true, 'Akun tidak ditemukan');

      if (user.verification_status === 'VERIFIED') {
        return misc.response(res, 400, true, 'Akun sudah terverifikasi. Silakan login.');
      }

      const targetEmail = user.pending_email || user.email;

      await db.execute('DELETE FROM email_verifications WHERE email = ?', [targetEmail]);

      const activationToken = crypto.randomBytes(32).toString('hex');
      await save_activation_token(targetEmail, activationToken);
      await send_activation_email(targetEmail, user.name || 'User', activationToken, user.role.toLowerCase());

      return misc.response(res, 200, false, 'Email verifikasi telah dikirim ulang. Silakan cek kotak masuk Anda.');
    } catch (e) {
      console.error(e);
      return misc.response(res, 500, true, e.message || 'Internal server error');
    }
  },

  track_referral_click: async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) return misc.response(res, 400, true, 'Code is required');
      
      await increment_referral_clicks(code);
      return misc.response(res, 200, false, 'Click tracked');
    } catch (e) {
      console.error('[REFERRAL TRACK] error:', e);
      return misc.response(res, 500, true, 'Internal server error');
    }
  },

  get_referral_stats: async (req, res) => {
    try {
      const user_id = req.session?.user?.id || req.user?.id;
      if (!user_id) return misc.response(res, 401, true, 'Unauthorized');

      const user = await find_user_by_id(user_id);
      if (!user) return misc.response(res, 404, true, 'User not found');

      const friends = await get_referred_users(user_id);
      const balance = await get_point_balance(user_id);

      // Enrich each friend with reward status
      const enrichedFriends = [];
      for (const friend of friends) {
        // Check if verify reward was given for this friend
        const [verifyRows] = await db.query(
          `SELECT id FROM point_transactions WHERE user_id = ? AND ref_type = 'earn_referral_verify' AND ref_id = (SELECT id FROM users WHERE email = ? LIMIT 1) LIMIT 1`,
          [user_id, friend.email]
        );
        const verifyRewarded = verifyRows.length > 0;

        // Check if booking reward was given for this friend
        const [bookingRows] = await db.query(
          `SELECT id FROM point_transactions WHERE user_id = ? AND ref_type = 'earn_referral_booking' AND ref_id = (SELECT id FROM users WHERE email = ? LIMIT 1) LIMIT 1`,
          [user_id, friend.email]
        );
        const bookingRewarded = bookingRows.length > 0;

        // Check if friend has any paid booking
        const [paidRows] = await db.query(
          `SELECT id FROM bookings WHERE user_id = (SELECT id FROM users WHERE email = ? LIMIT 1) AND payment_status = 'PAID' LIMIT 1`,
          [friend.email]
        );
        const hasBooking = paidRows.length > 0;

        enrichedFriends.push({
          ...friend,
          verify_rewarded: verifyRewarded,
          booking_rewarded: bookingRewarded,
          has_booking: hasBooking,
        });
      }
      
      return misc.response(res, 200, false, 'Success', {
        total_clicks: user.referral_clicks || 0,
        total_registered: friends.length,
        friends: enrichedFriends,
        referral_code: user.referral_code,
        point_balance: balance,
      });
    } catch (e) {
      console.error('[REFERRAL STATS] error:', e);
      return misc.response(res, 500, true, 'Internal server error');
    }
  }
};
