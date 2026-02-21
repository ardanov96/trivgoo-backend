const misc = require('../helpers/response');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Helper: ubah path file fisik → URL publik
function to_public_url(file_path) {
  // "public/products/tour/123.jpg" → "/products/tour/123.jpg"
  const normalized = file_path.replace(/\\/g, '/');
  const relative = normalized.replace(/^public\//, '');
  return `${BASE_URL}/${relative}`;
}

async function upload_media(req, res) {
  try {
    const single = req.files?.file?.[0] || null;
    const multiple = req.files?.files || [];

    // Tidak ada file sama sekali
    if (!single && multiple.length === 0) {
      return misc.response(res, 400, true, 'Tidak ada file yang diupload');
    }

    // Response untuk single file (cover image)
    if (single && multiple.length === 0) {
      return misc.response(res, 200, false, 'Upload berhasil', {
        url: to_public_url(single.path),
      });
    }

    // Response untuk multiple files (gallery)
    if (multiple.length > 0 && !single) {
      const urls = multiple.map((f) => to_public_url(f.path));
      return misc.response(res, 200, false, 'Upload berhasil', { urls });
    }

    // Keduanya ada sekaligus
    return misc.response(res, 200, false, 'Upload berhasil', {
      url: to_public_url(single.path),
      urls: multiple.map((f) => to_public_url(f.path)),
    });

  } catch (err) {
    console.error(err);
    return misc.response(res, 500, true, err.message || 'Upload gagal');
  }
}

module.exports = { upload_media };