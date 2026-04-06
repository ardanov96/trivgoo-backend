const jwt = require('jsonwebtoken');

const ACCESS_SECRET =
  process.env.APP_JWT_SECRET ||
  process.env.JWT_SECRET ||
  process.env.SESSION_SECRET ||
  'dev-app-jwt-secret';

const REFRESH_SECRET =
  process.env.APP_REFRESH_TOKEN_SECRET ||
  process.env.REFRESH_TOKEN_SECRET ||
  ACCESS_SECRET;

const ACCESS_EXPIRES_IN = process.env.APP_ACCESS_TOKEN_TTL || '1h';
const REFRESH_EXPIRES_IN = process.env.APP_REFRESH_TOKEN_TTL || '30d';

function parse_expires_in_to_seconds(input) {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  const value = String(input || '').trim().toLowerCase();
  const match = value.match(/^(\d+)([smhd])$/);
  if (!match) return 3600;

  const amount = Number(match[1]);
  const unit = match[2];
  if (unit === 's') return amount;
  if (unit === 'm') return amount * 60;
  if (unit === 'h') return amount * 60 * 60;
  if (unit === 'd') return amount * 24 * 60 * 60;
  return 3600;
}

function base_payload(user) {
  return {
    sub: String(user.id),
    email: user.email,
    role: user.role,
    specialization: user.specialization || null,
  };
}

function sign_access_token(user) {
  return jwt.sign(
    {
      ...base_payload(user),
      token_type: 'access',
    },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN },
  );
}

function sign_refresh_token(user) {
  return jwt.sign(
    {
      ...base_payload(user),
      token_type: 'refresh',
    },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN },
  );
}

function verify_access_token(token) {
  const payload = jwt.verify(token, ACCESS_SECRET);
  if (payload.token_type !== 'access') {
    const err = new Error('Invalid access token');
    err.code = 'INVALID_ACCESS_TOKEN';
    throw err;
  }
  return payload;
}

function verify_refresh_token(token) {
  const payload = jwt.verify(token, REFRESH_SECRET);
  if (payload.token_type !== 'refresh') {
    const err = new Error('Invalid refresh token');
    err.code = 'INVALID_REFRESH_TOKEN';
    throw err;
  }
  return payload;
}

module.exports = {
  sign_access_token,
  sign_refresh_token,
  verify_access_token,
  verify_refresh_token,
  get_access_expires_in_seconds: () => parse_expires_in_to_seconds(ACCESS_EXPIRES_IN),
};
