const crypto = require('crypto');
const db     = require('../configs/db');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getUserId(req) {
  return req.session?.user?.id ?? null;
}

function ok(res, data, message = 'OK') {
  return res.json({ error: false, message, data });
}

function fail(res, status, message) {
  return res.status(status).json({ error: true, message });
}

function generateTitle(userStory) {
  if (!userStory?.trim()) return 'Trip Plan';
  const s = userStory.trim();
  if (s.length <= 70) return s;
  const cut = s.substring(0, 67);
  const sp  = cut.lastIndexOf(' ');
  return (sp > 30 ? cut.substring(0, sp) : cut) + '...';
}

// ── POST /api/v1/ai/itineraries — simpan (auth required) ─────────────────────

exports.saveItinerary = async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return fail(res, 401, 'Login diperlukan untuk menyimpan itinerary.');

  const { title, userStory, itinerary, recommendedProducts } = req.body;

  if (!itinerary?.trim()) return fail(res, 400, 'itinerary wajib diisi.');

  const finalTitle  = (title?.trim()) || generateTitle(userStory);
  const shareToken  = crypto.randomBytes(32).toString('hex');

  try {
    const [result] = await db.execute(
      `INSERT INTO saved_itineraries
         (user_id, title, user_story, itinerary, recommended_products, share_token)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        userId,
        finalTitle,
        userStory ?? '',
        itinerary,
        JSON.stringify(recommendedProducts ?? []),
        shareToken,
      ]
    );

    return ok(res, { id: result.insertId, title: finalTitle, shareToken });
  } catch (err) {
    console.error('[SavedItinerary] saveItinerary error:', err.message);
    return fail(res, 500, 'Gagal menyimpan itinerary.');
  }
};

// ── GET /api/v1/ai/itineraries — list milik user ──────────────────────────────

exports.listItineraries = async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return fail(res, 401, 'Unauthorized');

  try {
    const [rows] = await db.execute(
      `SELECT id, title, user_story, share_token, created_at
       FROM   saved_itineraries
       WHERE  user_id = ?
       ORDER  BY created_at DESC`,
      [userId]
    );

    // Count days from itinerary heading (quick heuristic)
    const enriched = rows.map(r => ({
      ...r,
      created_at: r.created_at,
    }));

    return ok(res, enriched);
  } catch (err) {
    console.error('[SavedItinerary] listItineraries error:', err.message);
    return fail(res, 500, 'Gagal mengambil daftar itinerary.');
  }
};

// ── GET /api/v1/ai/itineraries/:id — detail milik user ───────────────────────

exports.getItinerary = async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return fail(res, 401, 'Unauthorized');

  try {
    const [rows] = await db.execute(
      `SELECT * FROM saved_itineraries WHERE id = ? AND user_id = ? LIMIT 1`,
      [req.params.id, userId]
    );

    if (!rows[0]) return fail(res, 404, 'Itinerary tidak ditemukan.');

    const row = rows[0];
    row.recommended_products = typeof row.recommended_products === 'string'
    ? JSON.parse(row.recommended_products)
    : (row.recommended_products ?? []);

    return ok(res, row);
  } catch (err) {
    console.error('[SavedItinerary] getItinerary error:', err.message);
    return fail(res, 500, 'Gagal mengambil itinerary.');
  }
};

// ── DELETE /api/v1/ai/itineraries/:id ────────────────────────────────────────

exports.deleteItinerary = async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return fail(res, 401, 'Unauthorized');

  try {
    const [result] = await db.execute(
      `DELETE FROM saved_itineraries WHERE id = ? AND user_id = ?`,
      [req.params.id, userId]
    );

    if (result.affectedRows === 0) return fail(res, 404, 'Itinerary tidak ditemukan.');

    return ok(res, null, 'Itinerary dihapus.');
  } catch (err) {
    console.error('[SavedItinerary] deleteItinerary error:', err.message);
    return fail(res, 500, 'Gagal menghapus itinerary.');
  }
};

// ── GET /api/v1/ai/itineraries/share/:token — public (no auth) ───────────────

exports.getSharedItinerary = async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, title, user_story, itinerary, recommended_products, created_at
       FROM   saved_itineraries
       WHERE  share_token = ?
       LIMIT  1`,
      [req.params.token]
    );

    if (!rows[0]) return fail(res, 404, 'Itinerary tidak ditemukan atau link tidak valid.');

    const row = rows[0];
    row.recommended_products = typeof row.recommended_products === 'string'
    ? JSON.parse(row.recommended_products)
    : (row.recommended_products ?? []);

    return ok(res, row);
  } catch (err) {
    console.error('[SavedItinerary] getSharedItinerary error:', err.message);
    return fail(res, 500, 'Gagal mengambil itinerary.');
  }
};