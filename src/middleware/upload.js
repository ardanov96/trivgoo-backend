const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Map specialization → subfolder di public/products/
const SPECIALIZATION_DIR = {
  TOUR:      "public/products/tour",
  STAY:      "public/products/stay",
  TRANSPORT: "public/products/transport",
};

const { getAgentDocumentFolder } = require('../utils/agent_document');

const FALLBACK_DIR = "public/uploads/general";

const storage = multer.diskStorage({
  destination: (req, file, cb) => {

    // Kalau ini upload agent document
    if (req.body?.upload_type === 'AGENT_DOCUMENT') {

      const agentType = req.body.agent_type;
      const dir = getAgentDocumentFolder(agentType);

      fs.mkdirSync(dir, { recursive: true });
      return cb(null, dir);
    }

    // Kalau upload product
    const specialization = req.session?.user?.specialization || null;
    const dir = SPECIALIZATION_DIR[specialization] || FALLBACK_DIR;

    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ok =
      allowed.test(path.extname(file.originalname).toLowerCase()) &&
      allowed.test(file.mimetype);
    ok ? cb(null, true) : cb(new Error("File type not allowed"));
  },
});

module.exports = { upload };