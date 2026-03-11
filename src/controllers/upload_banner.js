// src/controllers/upload_banner.js
// Controller untuk upload banner promo campaign
// File disimpan ke: backend/public/promo_campaign/

const path = require('path');
const fs   = require('fs');
const misc = require('../helpers/response');

// Path direktori — sesuai konvensi project (public/<kategori>/)
const UPLOAD_DIR = path.resolve(__dirname, '../../public/promo_campaign');

/**
 * POST /api/v1/promo-campaigns/upload-banner
 * Content-Type: multipart/form-data  |  field name: banner
 *
 * Response:
 * {
 *   "error": false,
 *   "data": {
 *     "url": "public/promo_campaign/banner-123456-abc.jpg",
 *     "full_url": "http://localhost:4001/public/promo_campaign/banner-123456-abc.jpg"
 *   }
 * }
 */
async function upload_banner(req, res) {
  try {
    // Auth check — hanya admin
    const user = req?.session?.user;
    if (!user) return misc.response(res, 401, true, 'Unauthorized');
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      return misc.response(res, 403, true, 'Forbidden');
    }

    if (!req.file) {
      return misc.response(res, 400, true, 'File gambar wajib disertakan (field: banner)');
    }

    // Path relatif untuk disimpan di DB — konsisten dengan file upload lain di project
    const relative_path = `public/promo_campaign/${req.file.filename}`;

    // Full URL untuk diakses browser
    const base_url = process.env.APP_URL || `http://localhost:${process.env.PORT || 4001}`;
    const full_url = `${base_url}/${relative_path}`;

    return misc.response(res, 200, false, 'Banner berhasil diupload', {
      url:      relative_path,   // disimpan di kolom banner_image DB
      full_url: full_url,        // langsung bisa dipakai sebagai src gambar
      filename: req.file.filename,
    });
  } catch (err) {
    console.error('[upload_banner]', err);
    return misc.response(res, 500, true, err.message || 'Gagal upload banner');
  }
}

/**
 * DELETE /api/v1/promo-campaigns/upload-banner
 * Body: { "filename": "banner-123456-abc.jpg" }
 */
async function delete_banner(req, res) {
  try {
    const user = req?.session?.user;
    if (!user) return misc.response(res, 401, true, 'Unauthorized');
    if (user.role !== 'ADMIN' && user.role !== 'SUPERADMIN') {
      return misc.response(res, 403, true, 'Forbidden');
    }

    const { filename } = req.body;
    if (!filename) return misc.response(res, 400, true, 'filename wajib diisi');

    // Cegah path traversal — ambil basename saja
    const safe_name = path.basename(filename);
    const file_path = path.join(UPLOAD_DIR, safe_name);

    if (!fs.existsSync(file_path)) {
      return misc.response(res, 404, true, 'File tidak ditemukan');
    }

    fs.unlinkSync(file_path);
    return misc.response(res, 200, false, 'Banner berhasil dihapus');
  } catch (err) {
    console.error('[delete_banner]', err);
    return misc.response(res, 500, true, err.message || 'Gagal hapus banner');
  }
}

module.exports = { upload_banner, delete_banner };