// src/routes/voucher.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/voucher');

// ── PUBLIC / CUSTOMER ─────────────────────────────────────────────────────────
router.get('/active',   ctrl.get_active);
router.get('/validate', ctrl.validate);
router.get('/my',       ctrl.get_my_usages);

// ── ADMIN ─────────────────────────────────────────────────────────────────────
router.get('/',    ctrl.list_all);
router.post('/',   ctrl.create);

// PENTING: route statis harus SEBELUM /:id
router.delete('/restrictions/:rid', ctrl.delete_restriction);

router.get   ('/:id',          ctrl.get_one);
router.put   ('/:id',          ctrl.update);   // PUT
router.patch ('/:id',          ctrl.update);   // PATCH — frontend AdminVouchers pakai PATCH
router.patch ('/:id/toggle',   ctrl.toggle);
router.delete('/:id',          ctrl.remove);
router.get   ('/:id/usages',        ctrl.get_usages);
router.get   ('/:id/restrictions',  ctrl.get_restrictions);
router.post  ('/:id/restrictions',  ctrl.add_restriction);

module.exports = router;