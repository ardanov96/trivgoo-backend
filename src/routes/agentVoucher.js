// api-trivgoo/src/routes/agentVoucher.js
// Mount di: app.use('/api/v1/agent/vouchers', require('./routes/agentVoucher'))

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/agentVoucher');

// ── PENTING: route statis SEBELUM /:id ────────────────────────────────────────
router.get('/stats',  ctrl.get_stats);    // GET  /agent/vouchers/stats
router.get('/active', ctrl.get_my_active); // GET  /agent/vouchers/active

// ── CRUD ─────────────────────────────────────────────────────────────────────
router.get ('/',    ctrl.list_mine);  // GET    /agent/vouchers
router.post('/',    ctrl.create);     // POST   /agent/vouchers

router.get   ('/:id',        ctrl.get_one);  // GET    /agent/vouchers/:id
router.patch ('/:id',        ctrl.update);   // PATCH  /agent/vouchers/:id
router.patch ('/:id/toggle', ctrl.toggle);   // PATCH  /agent/vouchers/:id/toggle
router.delete('/:id',        ctrl.remove);   // DELETE /agent/vouchers/:id

module.exports = router;
