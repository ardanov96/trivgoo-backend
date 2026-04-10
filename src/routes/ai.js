const express = require('express');
const router  = express.Router();

const { generateTripPlan, refineTripPlan } = require('../controllers/ai_trip');
const {
  saveItinerary,
  listItineraries,
  getItinerary,
  deleteItinerary,
  getSharedItinerary,
} = require('../controllers/saved_itinerary');

// ── AI generation ─────────────────────────────────────────────────────────────
router.post('/trip-plan',   generateTripPlan);   // POST /api/v1/ai/trip-plan
router.post('/trip-refine', refineTripPlan);     // POST /api/v1/ai/trip-refine

// ── Saved itineraries (auth required, except share) ──────────────────────────
router.post  ('/itineraries',              saveItinerary);       // simpan baru
router.get   ('/itineraries',              listItineraries);     // list milik user
router.get   ('/itineraries/share/:token', getSharedItinerary); // MUST be before /:id
router.get   ('/itineraries/:id',          getItinerary);        // detail
router.delete('/itineraries/:id',          deleteItinerary);     // hapus

module.exports = router;