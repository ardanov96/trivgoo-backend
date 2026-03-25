// src/routes/agent_profile.js
// Routes for agent profile settings — avatar saved to the correct
// specialization folder (tour / stay / transport)

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const Route    = express.Router();
const ctrl     = require('../controllers/agent_profile');
const { requireAuth } = require('../middleware/auth');

// ── Multer: dynamic destination based on agent specialization ─────────────────
//
// The session already contains user.specialization (set at login).
// We use it here in the destination callback so the file lands directly in
// the correct folder, matching the existing convention:
//
//   api-trivgoo/public/products/tour/       ← TOUR agents
//   api-trivgoo/public/products/stay/       ← STAY agents
//   api-trivgoo/public/products/transport/  ← TRANSPORT agents
//
// We also attach req.file.urlPath so the controller can build the public URL
// without needing to know the folder name.

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    // Read specialization from session (set at login)
    const spec = req?.session?.user?.specialization || 'TOUR';
    const { diskDir } = ctrl.resolve_avatar_dir(spec);

    // Create directory if it doesn't exist yet
    try { fs.mkdirSync(diskDir, { recursive: true }); } catch(e) { return cb(e); }
    cb(null, diskDir);
  },

  filename(_req, file, cb) {
    const ext  = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});

// Middleware that injects urlPath onto req.file after multer runs
function injectUrlPath(req, res, next) {
  if (req.file) {
    const spec = req?.session?.user?.specialization || 'TOUR';
    req.file.urlPath = ctrl.resolve_avatar_dir(spec).urlPath;
  }
  next();
}

const uploadAvatar = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB max
  fileFilter(_req, file, cb) {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Hanya file gambar (JPG / PNG / WebP) yang diizinkan'));
  },
});

// ── Routes ────────────────────────────────────────────────────────────────────

// GET  /agent/profile/settings
Route.get('/settings', requireAuth, ctrl.get_profile_settings);

// PUT  /agent/profile  (multipart: name, phone, address, avatar?)
Route.put(
  '/',
  requireAuth,
  uploadAvatar.single('avatar'),
  injectUrlPath,
  ctrl.update_profile,
);

// PUT  /agent/profile/password
Route.put('/password', requireAuth, ctrl.update_password);

// POST /agent/profile/bank-change-request
Route.post('/bank-change-request', requireAuth, ctrl.request_bank_change);

module.exports = Route;