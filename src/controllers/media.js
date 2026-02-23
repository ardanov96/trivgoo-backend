const misc = require('../helpers/response');
const path = require('path');

const BASE_URL = process.env.BASE_URL || process.env.API_URL_DEV || 'http://localhost:4000';

function to_public_url(file_path) {
  const normalized = file_path.replace(/\\/g, '/');
  const relative = normalized.replace(/^public\//, '');
  return `${BASE_URL}/${relative}`;
}

function to_filename(file_path) {
  return path.basename(file_path);
}

async function upload_media(req, res) {
  try {
    const single   = req.files?.file?.[0]  || null;
    const multiple = req.files?.files       || [];

    if (!single && multiple.length === 0) {
      return misc.response(res, 400, true, 'Tidak ada file yang diupload');
    }

    // Single file (cover image)
    if (single && multiple.length === 0) {
      return misc.response(res, 200, false, 'Upload berhasil', {
        url:      to_public_url(single.path),  
        filename: to_filename(single.path),      
      });
    }

    // Multiple files (gallery)
    if (multiple.length > 0 && !single) {
      return misc.response(res, 200, false, 'Upload berhasil', {
        urls:      multiple.map((f) => to_public_url(f.path)),  
        filenames: multiple.map((f) => to_filename(f.path)),    
      });
    }

    return misc.response(res, 200, false, 'Upload berhasil', {
      url:       to_public_url(single.path),
      filename:  to_filename(single.path),
      urls:      multiple.map((f) => to_public_url(f.path)),
      filenames: multiple.map((f) => to_filename(f.path)),
    });

  } catch (err) {
    console.error('[UPLOAD ERROR]', err);
    return misc.response(res, 500, true, err.message || 'Upload gagal');
  }
}

module.exports = { upload_media };