const { randomUUID } = require('crypto');

function build_meta(extra = {}) {
  return {
    ...extra,
    request_id: extra.request_id || `req_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
    timestamp: extra.timestamp || new Date().toISOString(),
  };
}

function success(res, { status = 200, message = 'OK', data = null, meta = {} } = {}) {
  return res.status(status).json({
    status,
    error: false,
    message,
    data,
    meta: build_meta(meta),
  });
}

function failure(
  res,
  {
    status = 500,
    message = 'Internal server error',
    code = 'INTERNAL_ERROR',
    data = null,
    meta = {},
  } = {},
) {
  return res.status(status).json({
    status,
    error: true,
    message,
    code,
    data,
    meta: build_meta(meta),
  });
}

module.exports = {
  success,
  failure,
};
