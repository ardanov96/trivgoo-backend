// src/routes/promo_campaign.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/promo_campaign');

// ─── PUBLIC routes (tidak butuh login) ───────────────────────────────────────

// GET /api/v1/promo-campaigns/active  ← homepage banner & flash sale
router.get('/active', ctrl.get_active);

// Analytics — HARUS sebelum /:id agar tidak tertangkap sebagai id
router.get('/analytics/summary', ctrl.analytics_summary);
router.get('/analytics/daily',   ctrl.analytics_daily);

// GET /api/v1/promo-campaigns/:id/products
router.get('/:id/products', ctrl.get_campaign_products);

// GET /api/v1/promo-campaigns/:id
router.get('/:id', ctrl.get_one);

// ─── ADMIN routes (auth dicek di dalam controller via session) ────────────────

// GET  /api/v1/promo-campaigns          ← list dengan filter
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