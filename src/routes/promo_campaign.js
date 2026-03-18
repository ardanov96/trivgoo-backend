const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/promo_campaign');
const uploadCtrl = require('../controllers/upload_banner');
const upload     = require('../middleware/upload_banner');

// ─── PUBLIC routes ────────────────────────────────────────────────────────────
router.get('/active',              ctrl.get_active);

// Analytics — HARUS sebelum /:id
router.get('/analytics/summary',   ctrl.analytics_summary);
router.get('/analytics/daily',     ctrl.analytics_daily);

// ─── UPLOAD BANNER — HARUS sebelum /:id ──────────────────────────────────────
router.post('/upload-banner',      upload.single('banner'), uploadCtrl.upload_banner);
router.delete('/upload-banner',    uploadCtrl.delete_banner);

// ─── Route spesifik /:id/* — HARUS sebelum /:id generic ─────────────────────
router.get('/:id/products',        ctrl.get_campaign_products);

// ── NEW: Agent join campaign ──────────────────────────────────────────────────
// POST /api/v1/promo-campaigns/:id/join
router.post('/:id/join',           ctrl.join_campaign);

// ─── Generic /:id ─────────────────────────────────────────────────────────────
router.get('/:id',                 ctrl.get_one);

// ─── ADMIN routes ─────────────────────────────────────────────────────────────
router.get('/',                    ctrl.list_all);
router.post('/',                   ctrl.create);
router.put('/:id',                 ctrl.update);
router.patch('/:id/toggle',        ctrl.toggle);
router.delete('/:id',              ctrl.remove);

module.exports = router;