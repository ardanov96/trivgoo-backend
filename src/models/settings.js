const conn = require('../configs/db');

async function get_settings() {
  const [rows] = await conn.execute(
    `SELECT * FROM settings WHERE id = 1 LIMIT 1`
  );
  return rows[0] || null;
}

async function update_settings(payload) {
  await conn.execute(
    `UPDATE settings SET
       site_name        = ?,
       support_email    = ?,
       maintenance_mode = ?,
       commission_rate  = ?,
       currency         = ?,
       payout_schedule  = ?,
       require_2fa      = ?,
       session_timeout  = ?,
       updated_at       = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [
      payload.siteName        ?? 'Trivgoo Travel',
      payload.supportEmail    ?? 'cs@trivgoo.com',
      payload.maintenanceMode ? 1 : 0,
      payload.commissionRate  ?? 11,
      payload.currency        ?? 'IDR',
      payload.payoutSchedule  ?? 'weekly',
      payload.require2FA      ? 1 : 0,
      payload.sessionTimeout  ?? 30,
    ]
  );
  return get_settings();
}

async function get_commission_rate() {
  const settings = await get_settings();
  return settings?.commission_rate ?? 11;
}

module.exports = { get_settings, update_settings, get_commission_rate };