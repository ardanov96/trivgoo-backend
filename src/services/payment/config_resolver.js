// src/services/payment/config_resolver.js
const db = require('../../configs/db');

async function getGatewayConfig(gatewayName = null) {
  let rows;
  try {
    [rows] = await db.query('SELECT * FROM payment_settings WHERE is_active = 1 LIMIT 1');
  } catch (e) {
    [rows] = await db.query('SELECT * FROM payment_settings LIMIT 1');
  }

  if (!rows || rows.length === 0)
    throw new Error('Payment settings not found in database.');

  const s = rows[0];
  const gateway = gatewayName || s.selected_gateway || 'xendit';

  if (gateway === 'doku') {
    const clientId = s.doku_client_id || process.env.DOKU_CLIENT_ID;
    const secretKey = s.doku_secret_key || process.env.DOKU_SECRET_KEY;
    const isProduction = process.env.NODE_ENV === 'production';
    const baseUrl = isProduction ? 'https://api.doku.com' : (process.env.DOKU_BASE_URL || 'https://api-sandbox.doku.com');
    return { gateway: 'doku', clientId, secretKey, baseUrl, settings: s };
  }

  if (gateway === 'xendit') {
    const secretKey = s.xendit_secret_key || process.env.XENDIT_SECRET_KEY;
    return { gateway: 'xendit', secretKey, settings: s };
  }

  throw new Error('Unsupported gateway: ' + gateway);
}

module.exports = { getGatewayConfig };
