// src/routes/promo_campaign.js

const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/promo_campaign');
const uploadCtrl = require('../controllers/upload_banner');
const upload     = require('../middleware/upload_banner');

// ─── PUBLIC routes (tanpa param) — HARUS paling atas ─────────────────────────
router.get('/active',                           ctrl.get_active);
router.post('/flash-sale',                      ctrl.flash_sale);
router.get('/my-submissions',                   ctrl.my_submissions);

// ─── Flash sale requests — HARUS sebelum /:id ────────────────────────────────
router.get('/flash-sale-requests',              ctrl.list_flash_sale_requests);
router.patch('/flash-sale-requests/:id',        ctrl.update_flash_sale_request);

// ─── Analytics — HARUS sebelum /:id ──────────────────────────────────────────
router.get('/analytics/summary',                ctrl.analytics_summary);
router.get('/analytics/daily',                  ctrl.analytics_daily);

// ─── Upload banner — HARUS sebelum /:id ──────────────────────────────────────
router.post('/upload-banner',                   upload.single('banner'), uploadCtrl.upload_banner);
router.delete('/upload-banner',                 uploadCtrl.delete_banner);

// ─── Routes dengan /:id — HARUS setelah semua route literal ──────────────────
router.get('/:id/products',                     ctrl.get_campaign_products);
router.get('/:id/joined-products',              ctrl.get_joined_products);
router.patch('/:id/joined-products/:join_id',   ctrl.review_joined_product);  
router.post('/:id/join',                        ctrl.join_campaign);
router.get('/:id',                              ctrl.get_one);
router.put('/:id',                              ctrl.update);
router.patch('/:id/toggle',                     ctrl.toggle);
router.delete('/:id',                           ctrl.remove);

// ─── ADMIN routes (tanpa param) ───────────────────────────────────────────────
router.get('/',                                 ctrl.list_all);
router.post('/',                                ctrl.create);

module.exports = router;