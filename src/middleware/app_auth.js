const { failure } = require('../helpers/app_response');
const { verify_access_token } = require('../helpers/app_tokens');
const { find_user_by_id } = require('../models/user');

function extract_bearer_token(req) {
  const header = req.headers.authorization || req.headers.Authorization;
  if (!header) return null;

  const [scheme, token] = String(header).trim().split(/\s+/, 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== 'bearer') return null;
  return token;
}

async function require_app_auth(req, res, next) {
  try {
    const token = extract_bearer_token(req);
    if (!token) {
      return failure(res, {
        status: 401,
        message: 'Authorization bearer token is required',
        code: 'AUTH_REQUIRED',
      });
    }

    const payload = verify_access_token(token);
    const user = await find_user_by_id(payload.sub);

    if (!user || !user.is_active) {
      return failure(res, {
        status: 401,
        message: 'Unauthorized',
        code: 'AUTH_INVALID',
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      specialization: user.specialization || null,
      name: user.name || null,
    };
    req.app_auth = { token, payload, user };
    next();
  } catch (err) {
    const message =
      err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token';

    return failure(res, {
      status: 401,
      message,
      code: err.name === 'TokenExpiredError' ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_INVALID',
    });
  }
}

module.exports = {
  require_app_auth,
};
