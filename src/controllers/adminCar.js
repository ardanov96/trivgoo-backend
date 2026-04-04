// src/controllers/adminCar.js
const misc        = require('../helpers/response');
const carModel    = require('../models/car');
const path        = require('path');
const fs          = require('fs');
const multer      = require('multer');

const BASE_URL = process.env.BASE_URL || process.env.API_URL_DEV || 'http://localhost';

// ── Image formatting ──────────────────────────────────────────────────────────

function format_car(car) {
  if (!car) return null;

  let image = car.image || null;
  if (image && !image.startsWith('http')) {
    image = '/' + image.replace(/^public\//, '').replace(/^\//, '');
  }

  return { ...car, image };
}

// ── Slug generator ────────────────────────────────────────────────────────────

function make_slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// ── Multer – image upload ─────────────────────────────────────────────────────

// ✅ DIUBAH: dari 'public/uploads/cars' → 'public/car-rental'
const UPLOAD_DIR = path.join(__dirname, '../../public/car-rental');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename:    (_req, file, cb) => {
    // ✅ Pakai nama asli file (lowercase, spasi → dash)
    const ext      = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, path.extname(file.originalname))
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    cb(null, `${baseName}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Format file tidak didukung'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const uploadMiddleware = upload.single('image');

// ── POST /admin/upload/car-image ──────────────────────────────────────────────

async function upload_car_image(req, res) {
  uploadMiddleware(req, res, (err) => {
    if (err) {
      return misc.response(res, 400, true, err.message || 'Upload gagal');
    }
    if (!req.file) {
      return misc.response(res, 400, true, 'Tidak ada file yang diupload');
    }

    // ✅ Hapus file lama jika dikirim via query/body
    const oldImage = req.query.old_image || req.body.old_image;
    if (oldImage && !oldImage.startsWith('http')) {
      const oldPath = path.join(__dirname, '../../public', oldImage);
      if (fs.existsSync(oldPath)) {
        fs.unlink(oldPath, (unlinkErr) => {
          if (unlinkErr) console.warn('Gagal hapus file lama:', unlinkErr.message);
        });
      }
    }

    const relativePath = `/car-rental/${req.file.filename}`;
    return misc.response(res, 200, false, 'Upload berhasil', { url: relativePath });
  });
}

// ── GET /admin/cars ───────────────────────────────────────────────────────────

async function list_cars(req, res) {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 10);
    const search = (req.query.search || '').trim();

    const result = await carModel.admin_list_cars({ page, limit, search });

    return res.json({
      data: result.data.map(format_car),
      meta: {
        total:       result.total,
        total_pages: result.total_pages,
        page:        result.page,
        limit,
      },
    });
  } catch (err) {
    console.error(err);
    return misc.response(res, 500, true, err.message || 'Internal server error');
  }
}

// ── GET /admin/cars/:id ───────────────────────────────────────────────────────

async function get_car(req, res) {
  try {
    const car_id = parseInt(req.params.id, 10);
    if (!car_id) return misc.response(res, 400, true, 'car_id tidak valid');

    const car = await carModel.get_car_by_id(car_id);
    if (!car) return misc.response(res, 404, true, 'Kendaraan tidak ditemukan');

    return misc.response(res, 200, false, 'OK', format_car(car));
  } catch (err) {
    console.error(err);
    return misc.response(res, 500, true, err.message || 'Internal server error');
  }
}

// ── POST /admin/cars ──────────────────────────────────────────────────────────

async function create_car(req, res) {
  try {
    const { name, brand, model_year, transmission, seats, fuel_type, image, description } = req.body;

    if (!name || !brand || !model_year || !transmission || !fuel_type) {
      return misc.response(res, 400, true, 'Field wajib: name, brand, model_year, transmission, fuel_type');
    }

    let slug = req.body.slug || make_slug(name);
    let suffix = 0;
    while (await carModel.slug_exists(slug)) {
      suffix++;
      slug = `${make_slug(name)}-${suffix}`;
    }

    const car = await carModel.create_car({
      name: name.trim(),
      slug,
      brand: brand.trim(),
      model_year: String(model_year).trim(),
      transmission,
      seats: parseInt(seats) || 5,
      fuel_type,
      image: image || null,
      description: description || null,
    });

    return misc.response(res, 201, false, 'Kendaraan berhasil ditambahkan', format_car(car));
  } catch (err) {
    console.error(err);
    return misc.response(res, 500, true, err.message || 'Internal server error');
  }
}

// ── PUT /admin/cars/:id ───────────────────────────────────────────────────────

async function update_car(req, res) {
  try {
    const car_id = parseInt(req.params.id, 10);
    if (!car_id) return misc.response(res, 400, true, 'car_id tidak valid');

    const existing = await carModel.get_car_by_id(car_id);
    if (!existing) return misc.response(res, 404, true, 'Kendaraan tidak ditemukan');

    const { name, brand, model_year, transmission, seats, fuel_type, image, description } = req.body;

    if (!name || !brand || !model_year || !transmission || !fuel_type) {
      return misc.response(res, 400, true, 'Field wajib: name, brand, model_year, transmission, fuel_type');
    }

    let slug = req.body.slug || make_slug(name);
    if (slug !== existing.slug && await carModel.slug_exists(slug, car_id)) {
      let suffix = 1;
      while (await carModel.slug_exists(`${make_slug(name)}-${suffix}`, car_id)) suffix++;
      slug = `${make_slug(name)}-${suffix}`;
    }

    const updated = await carModel.update_car(car_id, {
      name: name.trim(),
      slug,
      brand: brand.trim(),
      model_year: String(model_year).trim(),
      transmission,
      seats: parseInt(seats) || existing.seats,
      fuel_type,
      image: image !== undefined ? (image || null) : existing.image,
      description: description !== undefined ? (description || null) : existing.description,
    });

    return misc.response(res, 200, false, 'Kendaraan berhasil diperbarui', format_car(updated));
  } catch (err) {
    console.error(err);
    return misc.response(res, 500, true, err.message || 'Internal server error');
  }
}

// ── DELETE /admin/cars/:id ────────────────────────────────────────────────────

async function delete_car(req, res) {
  try {
    const car_id = parseInt(req.params.id, 10);
    if (!car_id) return misc.response(res, 400, true, 'car_id tidak valid');

    const existing = await carModel.get_car_by_id(car_id);
    if (!existing) return misc.response(res, 404, true, 'Kendaraan tidak ditemukan');

    if (existing.image && !existing.image.startsWith('http')) {
      const filePath = path.join(__dirname, '../../public', existing.image);
      if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => { if (err) console.warn('Gagal hapus file gambar:', err.message); });
      }
    }

    const deleted = await carModel.delete_car(car_id);
    if (!deleted) return misc.response(res, 500, true, 'Gagal menghapus kendaraan');

    return misc.response(res, 200, false, 'Kendaraan berhasil dihapus');
  } catch (err) {
    console.error(err);
    return misc.response(res, 500, true, err.message || 'Internal server error');
  }
}

module.exports = {
  upload_car_image,
  list_cars,
  get_car,
  create_car,
  update_car,
  delete_car,
};