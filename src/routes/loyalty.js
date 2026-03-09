// src/routes/loyalty.js
const express = require('express');
const router  = express.Router();
const {
  get_balance,
  get_transactions,
  get_membership,
  get_tiers,
  redeem_points,
  get_redemptions_list,
  get_my_referral,
  generate_referral,
} = require('../controllers/loyalty');

// ── Point Balance & Transactions ──────────────────────────────────────────────
router.get('/balance',       get_balance);
router.get('/transactions',  get_transactions);

// ── Membership ────────────────────────────────────────────────────────────────
router.get('/membership',    get_membership);
router.get('/tiers',         get_tiers);       // public — semua tier aktif

// ── Redemption ────────────────────────────────────────────────────────────────
router.post('/redeem',       redeem_points);
router.get('/redemptions',   get_redemptions_list);

// ── Referral ──────────────────────────────────────────────────────────────────
router.get('/referral',          get_my_referral);
router.post('/referral/generate', generate_referral);

module.exports = router;