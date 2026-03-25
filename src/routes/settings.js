const express = require('express');
const router = express.Router();
const db = require('../configs/db');

// Ambil data settings
router.get('/settings', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM settings WHERE id = 1');
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// Update data settings
router.post('/settings', async (req, res) => {
  try {
    console.log("Data masuk:", req.body);
    const {
      siteName,
      supportEmail,
      maintenanceMode,
      commissionRate,
      commissionRateTour,
      commissionRateTransport,
      currency,
      payoutSchedule,
      require2FA,
      sessionTimeout,
    } = req.body;

    await db.execute(
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
        siteName,
        supportEmail,
        maintenanceMode ? 1 : 0,
        commissionRate          ?? 11,
        commissionRateTour      ?? commissionRate ?? 11,
        commissionRateTransport ?? commissionRate ?? 11,
        currency,
        payoutSchedule,
        require2FA ? 1 : 0,
        sessionTimeout,
      ]
    );

    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint untuk Clear Cache
router.post('/settings/clear-cache', async (req, res) => {
  try {
    global.systemSettings = null;
    console.log("System cache cleared by admin");
    res.json({ message: 'System cache cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

module.exports = router;