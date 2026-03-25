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
       site_name                = ?,
       support_email            = ?,
       maintenance_mode         = ?,
       commission_rate          = ?,
       commission_rate_tour     = ?,
       commission_rate_transport = ?,
       currency                 = ?,
       payout_schedule          = ?,
       require_2fa              = ?,
       session_timeout          = ?,
       updated_at               = CURRENT_TIMESTAMP
     WHERE id = 1`,
    [
      payload.siteName              ?? 'Trivgoo Travel',
      payload.supportEmail          ?? 'cs@trivgoo.com',
      payload.maintenanceMode       ? 1 : 0,
      payload.commissionRate        ?? 11,  // fallback/legacy
      payload.commissionRateTour    ?? payload.commissionRate ?? 11,
      payload.commissionRateTransport ?? payload.commissionRate ?? 11,
      payload.currency              ?? 'IDR',
      payload.payoutSchedule        ?? 'weekly',
      payload.require2FA            ? 1 : 0,
      payload.sessionTimeout        ?? 30,
    ]
  );
  return get_settings();
}

/**
 * Ambil commission rate berdasarkan specialization agent.
 * - TOUR      → commission_rate_tour
 * - TRANSPORT → commission_rate_transport
 * - STAY      → 0 (belum diberlakukan, akan diintegrasikan third party)
 * - fallback  → commission_rate (legacy)
 */
async function get_commission_rate(specialization = null) {
  const settings = await get_settings();
  if (!settings) return 11;

  const spec = String(specialization || '').toUpperCase();

  if (spec === 'TOUR')      return Number(settings.commission_rate_tour      ?? settings.commission_rate ?? 11);
  if (spec === 'TRANSPORT') return Number(settings.commission_rate_transport ?? settings.commission_rate ?? 11);
  if (spec === 'STAY')      return 0; // belum diberlakukan

  // Fallback untuk backward compatibility
  return Number(settings.commission_rate ?? 11);
}

module.exports = { get_settings, update_settings, get_commission_rate };