// src/routes/promo_campaign.js
const express      = require('express');
const router       = express.Router();
const ctrl         = require('../controllers/promo_campaign');
const uploadCtrl   = require('../controllers/upload_banner');
const upload       = require('../middleware/upload_banner');   // sesuai nama file di project

// ─── PUBLIC routes (tidak butuh login) ───────────────────────────────────────

// GET /api/v1/promo-campaigns/active  ← homepage banner & flash sale
router.get('/active', ctrl.get_active);

// Analytics — HARUS sebelum /:id agar tidak tertangkap sebagai id
router.get('/analytics/summary', ctrl.analytics_summary);
router.get('/analytics/daily',   ctrl.analytics_daily);

// ─── UPLOAD BANNER — HARUS sebelum /:id ─────────────────────────────────────
// POST  /api/v1/promo-campaigns/upload-banner
router.post('/upload-banner', upload.single('banner'), uploadCtrl.upload_banner);
// DELETE /api/v1/promo-campaigns/upload-banner
router.delete('/upload-banner', uploadCtrl.delete_banner);

// GET /api/v1/promo-campaigns/:id/products
router.get('/:id/products', ctrl.get_campaign_products);

// GET /api/v1/promo-campaigns/:id
router.get('/:id', ctrl.get_one);

// ─── ADMIN routes (auth dicek di dalam controller via session) ────────────────

// GET  /api/v1/promo-campaigns
router.get('/', ctrl.list_all);

// POST /api/v1/promo-campaigns
router.post('/', ctrl.create);

// PUT  /api/v1/promo-campaigns/:id
router.put('/:id', ctrl.update);

// PATCH /api/v1/promo-campaigns/:id/toggle
router.patch('/:id/toggle', ctrl.toggle);

// DELETE /api/v1/promo-campaigns/:id
router.delete('/:id', ctrl.remove);

module.exports = router;