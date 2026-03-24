const db = require('../configs/db');

async function query(sql, params = []) {
  try {
    const [rows] = await db.query(sql, params);
    return rows;
  } catch (err) {
    err.message = `${err.message}\nSQL: ${sql}`;
    throw err;
  }
}

const ReviewModel = {
  create_review: async ({ user_id, product_id, booking_id, rating, comment }) => {
    // Determine sentiment
    let sentiment = 'neutral';
    if (rating >= 4) sentiment = 'positive';
    else if (rating <= 2) sentiment = 'negative';

    const result = await query(
      `INSERT INTO reviews (user_id, product_id, booking_id, rating, comment, sentiment)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user_id, product_id, booking_id, rating, comment, sentiment]
    );

    return result.insertId;
  },

  get_review_by_booking: async (booking_id) => {
    const rows = await query(`SELECT * FROM reviews WHERE booking_id = ? LIMIT 1`, [booking_id]);
    return rows[0] || null;
  },

  get_review_by_id: async (id) => {
    const rows = await query(`SELECT * FROM reviews WHERE id = ? LIMIT 1`, [id]);
    return rows[0] || null;
  },

  get_reviews_by_product: async (product_id) => {
    const rows = await query(
      `SELECT r.*, u.name as customer_name, up.avatar_url as customer_avatar
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       WHERE r.product_id = ?
       ORDER BY r.created_at DESC`,
      [product_id]
    );
    return rows;
  },

  get_reviews_by_agent: async (agent_id) => {
    // Reviews for all products owned by this agent
    const rows = await query(
      `SELECT r.*, 
              u.name as customer_name, 
              up.avatar_url as customer_avatar,
              p.name as product_name,
              b.date as booking_date
       FROM reviews r
       JOIN products p ON p.id = r.product_id
       JOIN users u ON u.id = r.user_id
       LEFT JOIN user_profiles up ON up.user_id = u.id
       LEFT JOIN bookings b ON b.id = r.booking_id
       WHERE p.owner_id = ?
       ORDER BY r.created_at DESC`,
      [agent_id]
    );
    return rows;
  },

  get_rating_summary_by_agent: async (agent_id) => {
    const rows = await query(
      `SELECT r.rating, r.agent_reply, r.created_at, r.agent_reply_at
       FROM reviews r
       JOIN products p ON p.id = r.product_id
       WHERE p.owner_id = ?`,
      [agent_id]
    );

    let total_reviews = rows.length;
    if (total_reviews === 0) {
      return {
        overall_rating: 0,
        total_reviews: 0,
        response_rate: 0,
        response_time_hours: 0,
        rating_distribution: [
          { stars: 5, count: 0 },
          { stars: 4, count: 0 },
          { stars: 3, count: 0 },
          { stars: 2, count: 0 },
          { stars: 1, count: 0 },
        ],
        trend: 'stable',
        trend_value: 0
      };
    }

    let sum_rating = 0;
    let replied_count = 0;
    let total_reply_time_ms = 0;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

    rows.forEach(r => {
      sum_rating += r.rating;
      distribution[r.rating]++;
      if (r.agent_reply) {
        replied_count++;
        if (r.agent_reply_at && r.created_at) {
          total_reply_time_ms += (new Date(r.agent_reply_at).getTime() - new Date(r.created_at).getTime());
        }
      }
    });

    const overall_rating = sum_rating / total_reviews;
    const response_rate = Math.round((replied_count / total_reviews) * 100);
    const avg_reply_time_hours = replied_count > 0 ? (total_reply_time_ms / replied_count / (1000 * 60 * 60)) : 0;

    return {
      overall_rating,
      total_reviews,
      response_rate,
      response_time_hours: Math.round(avg_reply_time_hours * 10) / 10, // 1 decimal
      rating_distribution: [
        { stars: 5, count: distribution[5] },
        { stars: 4, count: distribution[4] },
        { stars: 3, count: distribution[3] },
        { stars: 2, count: distribution[2] },
        { stars: 1, count: distribution[1] },
      ],
      trend: 'stable',
      trend_value: 0
    };
  },

  reply_to_review: async (review_id, reply) => {
    await query(
      `UPDATE reviews 
       SET agent_reply = ?, agent_reply_at = NOW(), updated_at = NOW() 
       WHERE id = ?`,
      [reply, review_id]
    );
  },

  flag_review: async (review_id) => {
    await query(
      `UPDATE reviews SET is_flagged = 1, updated_at = NOW() WHERE id = ?`,
      [review_id]
    );
  },

  update_product_rating: async (product_id) => {
    // Calculates the average rating from reviews and updates the products table
    const rows = await query(`SELECT AVG(rating) as avg_rating FROM reviews WHERE product_id = ?`, [product_id]);
    const avg_rating = rows[0]?.avg_rating ? parseFloat(rows[0].avg_rating).toFixed(1) : 0;
    
    await query(`UPDATE products SET rating = ? WHERE id = ?`, [avg_rating, product_id]);
    return avg_rating;
  }
};

module.exports = ReviewModel;
