const multer = require('multer');
const path = require('path');
const fs = require('fs');
const conn = require('../configs/db');

async function get_user_specialization(user_id) {
  const [rows] = await conn.execute(
    'SELECT specialization FROM users WHERE id = ? LIMIT 1',
    [user_id]
  );
  return rows[0]?.specialization || null;
}

function resolve_upload_folder(specialization) {
  const map = {
    TOUR:      'public/products/tour',
    STAY:      'public/products/stay',
    TRANSPORT: 'public/products/transport',
  };
  return map[specialization] || 'public/uploads/other';
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      const user = req?.session?.user;
      if (!user?.id) return cb(new Error('Unauthorized'), null);

      const specialization = await get_user_specialization(user.id);
      const folder = resolve_upload_folder(specialization);

      fs.mkdirSync(folder, { recursive: true });
      cb(null, folder);
    } catch (err) {
      cb(err, null);
    }
  },

  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}${ext}`);
  },
});

const file_filter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format file tidak didukung. Gunakan JPG, PNG, WEBP, atau GIF.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter: file_filter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

module.exports = { upload, resolve_upload_folder, get_user_specialization };