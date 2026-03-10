const express = require('express');
const router  = express.Router();
const ctrl = require('../controllers/loyalty');

// ── Public / Customer ─────────────────────────────────────────────────────────
router.get('/tiers',               ctrl.get_tiers);
router.get('/balance',             ctrl.get_balance);
router.get('/transactions',        ctrl.get_transactions);
router.get('/membership',          ctrl.get_membership);
router.get('/redemptions',         ctrl.get_redemptions);
router.post('/redeem',             ctrl.redeem);
router.get('/referral',            ctrl.get_referral);
router.post('/referral/generate',  ctrl.generate_referral);

// ── Admin ─────────────────────────────────────────────────────────────────────
router.get('/admin/tiers',             ctrl.admin_list_tiers);
router.post('/admin/tiers',            ctrl.admin_create_tier);
router.put('/admin/tiers/:id',         ctrl.admin_update_tier);
router.delete('/admin/tiers/:id',      ctrl.admin_delete_tier);
router.get('/admin/memberships',       ctrl.admin_list_memberships);
router.get('/admin/referral-codes',    ctrl.admin_list_referral_codes);
router.get('/admin/referral-usages',   ctrl.admin_list_referral_usages);
router.get('/admin/referral-stats',    ctrl.admin_referral_stats);
router.get('/admin/analytics',         ctrl.admin_analytics);

module.exports = router;