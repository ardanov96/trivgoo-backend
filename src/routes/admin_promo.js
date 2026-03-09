
const express = require('express');
const router  = express.Router();
const promo   = require('../controllers/promo');

// ── /admin/promo/campaigns ────────────────────────────────────────────────────
router.get('/promo/campaigns',       promo.list);
router.post('/promo/campaigns',      promo.create);
router.get('/promo/campaigns/:id',   promo.get_one);
router.patch('/promo/campaigns/:id', promo.update);
router.delete('/promo/campaigns/:id',promo.remove);

// ── /admin/promo/analytics ────────────────────────────────────────────────────
router.get('/promo/analytics/summary', promo.analytics_summary);
router.get('/promo/analytics/daily',   promo.analytics_daily);

// ── /admin/membership/tiers ───────────────────────────────────────────────────
router.get('/membership/tiers',        promo.list_tiers);
router.post('/membership/tiers',       promo.create_membership_tier);
router.patch('/membership/tiers/:id',  promo.update_membership_tier);
router.delete('/membership/tiers/:id', promo.delete_membership_tier);

// ── /admin/referral/stats ─────────────────────────────────────────────────────
router.get('/referral/stats',          promo.referral_stats);

module.exports = router;
