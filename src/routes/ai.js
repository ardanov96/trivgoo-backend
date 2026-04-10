const express = require('express');
const router  = express.Router();
const db      = require('../configs/db');

const { generateTripPlan, refineTripPlan } = require('../controllers/ai_trip');
const {
  saveItinerary,
  listItineraries,
  getItinerary,
  deleteItinerary,
  getSharedItinerary,
} = require('../controllers/saved_itinerary');
const { conciergeChat, getConciergeContext } = require('../controllers/ai_concierge');

// ── AI generation ─────────────────────────────────────────────────────────────
router.post('/trip-plan',   generateTripPlan);
router.post('/trip-refine', refineTripPlan);

// ── Bundle discount ───────────────────────────────────────────────────────────
router.post('/bundle-discount', async (req, res) => {
  const { productIds } = req.body;
  if (!Array.isArray(productIds) || !productIds.length)
    return res.status(400).json({ error: true, message: 'productIds wajib diisi.' });

  try {
    const placeholders = productIds.map(() => '?').join(',');
    const [products] = await db.execute(
      `SELECT id, name, price, currency, category_id
       FROM   products
       WHERE  id IN (${placeholders}) AND is_active = 1`,
      productIds
    );
    if (!products.length)
      return res.status(404).json({ error: true, message: 'Produk tidak ditemukan.' });

    const categories = new Set(products.map(p => {
      if (p.category_id === 1 || p.category_id === 3) return 'Tour';
      if (p.category_id === 2)                         return 'Stay';
      return 'Transport';
    }));

    let discountPct = 0, bundleType = 'single';
    if (categories.has('Tour') && categories.has('Stay') && categories.has('Transport')) {
      discountPct = 10; bundleType = 'full';
    } else if (categories.size >= 2) {
      discountPct = 5; bundleType = 'partial';
    }

    const totals = {}, discounted = {};
    products.forEach(p => {
      const cur = p.currency ?? 'IDR';
      totals[cur] = (totals[cur] ?? 0) + parseFloat(p.price);
    });
    Object.entries(totals).forEach(([cur, total]) => {
      discounted[cur] = discountPct > 0 ? Math.round(total * (1 - discountPct / 100)) : total;
    });

    const catList = [...categories];
    return res.json({
      error: false,
      data: {
        discountPct, bundleType,
        bundleLabel:      categories.size === 3 ? 'Paket Lengkap (Tour + Hotel + Transport)' : `Paket ${catList.join(' + ')}`,
        categories:       catList,
        productCount:     products.length,
        totals,
        discountedTotals: discounted,
        savings: Object.fromEntries(Object.entries(totals).map(([cur, total]) => [cur, total - discounted[cur]])),
      },
    });
  } catch (err) {
    console.error('[Bundle] error:', err.message);
    return res.status(500).json({ error: true, message: 'Gagal kalkulasi bundle.' });
  }
});

// ── Saved itineraries ─────────────────────────────────────────────────────────
router.post  ('/itineraries',              saveItinerary);
router.get   ('/itineraries',              listItineraries);
router.get   ('/itineraries/share/:token', getSharedItinerary);
router.get   ('/itineraries/:id',          getItinerary);
router.delete('/itineraries/:id',          deleteItinerary);

// ── AI Concierge post-booking ─────────────────────────────────────────────────
router.get ('/concierge/:bookingId/context', getConciergeContext);
router.post('/concierge/chat',               conciergeChat);

module.exports = router;