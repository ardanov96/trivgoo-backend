const express    = require('express');
const router     = express.Router();
const { generateTripPlan, refineTripPlan } = require('../controllers/aiTripController');

// POST /api/v1/ai/trip-plan   — generate itinerary baru (single-turn)
router.post('/trip-plan', generateTripPlan);

// POST /api/v1/ai/trip-refine — revisi itinerary (multi-turn conversation)
router.post('/trip-refine', refineTripPlan);

module.exports = router;
