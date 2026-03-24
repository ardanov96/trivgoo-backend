const Review = require('../models/review');
const db = require('../configs/db');
const misc = require('../helpers/response');

module.exports = {
  submit_review: async (req, res) => {
    try {
      const user_id = req.user.id;
      const { product_id, booking_id, rating, comment } = req.body;

      if (!product_id || !booking_id || !rating) {
        return misc.response(res, 400, true, 'missing_required_fields');
      }

      if (rating < 1 || rating > 5) {
        return misc.response(res, 400, true, 'invalid_rating_value');
      }

      // Check if booking exists, belongs to user, and is COMMLETED
      const [bookings] = await db.query(
        `SELECT * FROM bookings WHERE id = ? AND user_id = ? LIMIT 1`,
        [booking_id, user_id]
      );
      
      const booking = bookings[0];
      if (!booking) {
        return misc.response(res, 404, true, 'booking_not_found');
      }

      if (booking.status !== 'COMPLETED') {
        return misc.response(res, 400, true, 'booking_not_completed');
      }

      // Check if review already exists
      const existing = await Review.get_review_by_booking(booking_id);
      if (existing) {
        return misc.response(res, 400, true, 'review_already_exists');
      }

      // Create
      const review_id = await Review.create_review({
        user_id,
        product_id,
        booking_id,
        rating,
        comment: comment || null
      });

      // Update product rating average
      await Review.update_product_rating(product_id);

      return misc.response(res, 201, false, 'review_submitted', { review_id });
    } catch (error) {
      console.error('[submit_review]', error);
      return misc.response(res, 500, true, 'server_error');
    }
  },

  get_product_reviews: async (req, res) => {
    try {
      const { id } = req.params;
      const reviews = await Review.get_reviews_by_product(id);
      return misc.response(res, 200, false, 'success', reviews);
    } catch (error) {
      console.error('[get_product_reviews]', error);
      return misc.response(res, 500, true, 'server_error');
    }
  },

  get_agent_rating_summary: async (req, res) => {
    try {
      const agent_id = req.user.id;
      const summary = await Review.get_rating_summary_by_agent(agent_id);
      return misc.response(res, 200, false, 'success', summary);
    } catch (error) {
      console.error('[get_agent_rating_summary]', error);
      return misc.response(res, 500, true, 'server_error');
    }
  },

  get_agent_reviews: async (req, res) => {
    try {
      const agent_id = req.user.id;
      const reviews = await Review.get_reviews_by_agent(agent_id);
      return misc.response(res, 200, false, 'success', reviews);
    } catch (error) {
      console.error('[get_agent_reviews]', error);
      return misc.response(res, 500, true, 'server_error');
    }
  },

  reply_to_review: async (req, res) => {
    try {
      const agent_id = req.user.id;
      const { id } = req.params;
      const { reply } = req.body;

      if (!reply) {
        return misc.response(res, 400, true, 'reply_content_required');
      }

      const review = await Review.get_review_by_id(id);
      if (!review) {
        return misc.response(res, 404, true, 'review_not_found');
      }

      // Verify the product belongs to this agent
      const [products] = await db.query(
        `SELECT owner_id FROM products WHERE id = ? LIMIT 1`,
        [review.product_id]
      );
      
      if (!products[0] || products[0].owner_id !== agent_id) {
        return misc.response(res, 403, true, 'forbidden');
      }

      await Review.reply_to_review(id, reply);
      return misc.response(res, 200, false, 'reply_submitted');
    } catch (error) {
      console.error('[reply_to_review]', error);
      return misc.response(res, 500, true, 'server_error');
    }
  },

  flag_review: async (req, res) => {
    try {
      const agent_id = req.user.id;
      const { id } = req.params;

      const review = await Review.get_review_by_id(id);
      if (!review) {
        return misc.response(res, 404, true, 'review_not_found');
      }

      // Verify the product belongs to this agent
      const [products] = await db.query(
        `SELECT owner_id FROM products WHERE id = ? LIMIT 1`,
        [review.product_id]
      );
      
      if (!products[0] || products[0].owner_id !== agent_id) {
        return misc.response(res, 403, true, 'forbidden');
      }

      await Review.flag_review(id);
      return misc.response(res, 200, false, 'review_flagged');
    } catch (error) {
      console.error('[flag_review]', error);
      return misc.response(res, 500, true, 'server_error');
    }
  }
};
