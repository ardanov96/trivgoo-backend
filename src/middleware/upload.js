const multer = require("multer");
const path = require("path");
const fs = require("fs");
const sanitize = require("sanitize-filename");

// Map specialization → subfolder di public/products/
const SPECIALIZATION_DIR = {
  TOUR:      "public/products/tour",
  STAY:      "public/products/stay",
  TRANSPORT: "public/products/transport",
};

const FALLBACK_DIR = "public/uploads/general";

// Map agent_type → subfolder untuk dokumen verifikasi agent
const AGENT_DOCUMENT_DIR = {
  INDIVIDUAL: "public/users/individual",
  CORPORATE:  "public/users/corporate",
};

// Trusted extension dari mimetype — tidak bisa dimanipulasi client
const MIME_TO_EXT = {
  'application/pdf': '.pdf',
  'image/jpeg':      '.jpg',
  'image/jpg':       '.jpg',
  'image/png':       '.png',
  'image/webp':      '.webp',
  'image/gif':       '.gif',
};


const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Kalau ini upload agent document (khusus verification)
    const uploadType = String(req.body?.upload_type || '').toUpperCase();
    const agentType = String(req.body?.agent_type || '').toUpperCase();
    
    if (uploadType === 'AGENT_DOCUMENT') {
      // Ensure agent_type is one of the valid values
      const validAgentType = ['CORPORATE', 'INDIVIDUAL'].includes(agentType) ? agentType : 'INDIVIDUAL';
      const dir = AGENT_DOCUMENT_DIR[validAgentType];
      console.log(`[UPLOAD] Agent Document: type=${validAgentType}, saving to ${dir}`);
      fs.mkdirSync(dir, { recursive: true });
      return cb(null, dir);
    }

    // Kalau upload product
    const specialization = req.session?.user?.specialization || null;
    const dir = SPECIALIZATION_DIR[specialization] || FALLBACK_DIR;
    console.log(`[UPLOAD] Product: specialization=${specialization}, saving to ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },

  filename: (req, file, cb) => {
    const user_id = req.session?.user?.id || 'unknown';

    // 1. Sanitize originalname → hapus karakter berbahaya (path traversal, injection, dll)
    const safeName = sanitize(file.originalname) || 'document';

    // 2. Ambil ekstensi trusted dari mimetype, bukan dari originalname
    //    Fallback ke ekstensi originalname jika mimetype tidak dikenal
    const trustedExt = MIME_TO_EXT[file.mimetype] || path.extname(safeName).toLowerCase();

    // 3. Ambil base name tanpa ekstensi dari originalname yang sudah di-sanitize
    const baseName = path.basename(safeName, path.extname(safeName));

    // 4. Final filename: userId_NamaAsli.ext
    const filename = `${user_id}_${baseName}${trustedExt}`;

    console.log(
      '[upload] originalname:', file.originalname,
      '| mimetype:', file.mimetype,
      '| saved as:', filename
    );

    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowedMimes = new Set([
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);

    const allowedExts = /\.(jpeg|jpg|png|webp|gif|pdf)$/i;
    const extOk  = allowedExts.test(path.extname(file.originalname));
    const mimeOk = allowedMimes.has(file.mimetype);

    if (extOk && mimeOk) {
      cb(null, true);
    } else {
      cb(new Error(`File type not allowed: ${file.mimetype} (${file.originalname})`));
    }
  },
});

module.exports = { upload };