const bcrypt = require('bcryptjs');
const { success, failure } = require('../helpers/app_response');
const {
  sign_access_token,
  sign_refresh_token,
  verify_refresh_token,
  get_access_expires_in_seconds,
} = require('../helpers/app_tokens');
const { find_user_by_email, find_user_by_id } = require('../models/user');

function resolve_asset_url(path) {
  if (!path) return null;
  const value = String(path).trim();
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;

  const base = (
    process.env.BASE_URL ||
    process.env.API_URL_DEV ||
    'http://localhost:4000'
  ).replace(/\/+$/, '');

  const normalized = `/${value.replace(/^\/+/, '').replace(/^public\//, '')}`;
  return `${base}${normalized}`;
}

function to_safe_user(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name || null,
    email: user.email,
    role: user.role,
    specialization: user.specialization || null,
    verification_status: user.verification_status || null,
    pending_email: user.pending_email || null,
    referral_code: user.referral_code || null,
    phone_number: user.phone_number || null,
    profile_photo_url: user.avatar || resolve_asset_url(user.profile_photo),
  };
}

async function login(req, res) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return failure(res, {
        status: 400,
        message: 'email dan password wajib diisi',
        code: 'VALIDATION_ERROR',
      });
    }

    const user = await find_user_by_email(email);
    if (!user) {
      return failure(res, {
        status: 401,
        message: 'Email atau password salah',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return failure(res, {
        status: 401,
        message: 'Email atau password salah',
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (!user.is_active) {
      return failure(res, {
        status: 403,
        message: 'Akun Anda telah dinonaktifkan. Hubungi support untuk bantuan.',
        code: 'ACCOUNT_INACTIVE',
      });
    }

    if (user.verification_status === 'UNVERIFIED') {
      return failure(res, {
        status: 403,
        message: 'Akun Anda belum teraktivasi. Silakan cek email Anda untuk mengaktifkan akun.',
        code: 'ACCOUNT_UNVERIFIED',
      });
    }

    const freshUser = await find_user_by_id(user.id);
    const access_token = sign_access_token(freshUser || user);
    const refresh_token = sign_refresh_token(freshUser || user);

    return success(res, {
      message: 'Login berhasil',
      data: {
        access_token,
        refresh_token,
        expires_in: get_access_expires_in_seconds(),
        token_type: 'Bearer',
        user: to_safe_user(freshUser || user),
      },
    });
  } catch (err) {
    console.error('[APP AUTH LOGIN] error:', err);
    return failure(res, {
      status: 500,
      message: 'Failed to login',
      code: 'AUTH_LOGIN_FAILED',
    });
  }
}

async function me(req, res) {
  try {
    const user = await find_user_by_id(req.user?.id);
    if (!user) {
      return failure(res, {
        status: 404,
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    return success(res, {
      data: {
        user: to_safe_user(user),
      },
    });
  } catch (err) {
    console.error('[APP AUTH ME] error:', err);
    return failure(res, {
      status: 500,
      message: 'Failed to load user profile',
      code: 'AUTH_ME_FAILED',
    });
  }
}

async function refresh(req, res) {
  try {
    const refresh_token = String(req.body?.refresh_token || '').trim();
    if (!refresh_token) {
      return failure(res, {
        status: 400,
        message: 'refresh_token is required',
        code: 'VALIDATION_ERROR',
      });
    }

    const payload = verify_refresh_token(refresh_token);
    const user = await find_user_by_id(payload.sub);

    if (!user || !user.is_active) {
      return failure(res, {
        status: 401,
        message: 'Unauthorized',
        code: 'AUTH_INVALID',
      });
    }

    return success(res, {
      message: 'Token diperbarui',
      data: {
        access_token: sign_access_token(user),
        expires_in: get_access_expires_in_seconds(),
        token_type: 'Bearer',
      },
    });
  } catch (err) {
    const isExpired = err.name === 'TokenExpiredError';
    return failure(res, {
      status: 401,
      message: isExpired ? 'Refresh token expired' : 'Invalid refresh token',
      code: isExpired ? 'AUTH_REFRESH_EXPIRED' : 'AUTH_REFRESH_INVALID',
    });
  }
}

module.exports = {
  login,
  me,
  refresh,
};
