const express = require('express');
const Route = express.Router();
const agent = require('../controllers/agent');
const agentProduct = require('../controllers/agent_product');
const userController = require('../controllers/user');

const { requireAuth } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// VERIFICATION ROUTES
Route.post('/verification', requireAuth, upload.fields([{ name: 'idDocument', maxCount: 1 }, { name: 'skDocument', maxCount: 1 }]), agent.submit_verification);
Route.get('/verification', requireAuth, agent.get_my_verification);

// DASHBOARD ROUTES
Route.get('/dashboard/stats', requireAuth, agent.get_dashboard_stats);
Route.get('/dashboard/weekly-sales', requireAuth, agent.get_weekly_sales);

// BOOKING MANAGEMENT ROUTES
Route.get('/bookings', requireAuth, agent.get_my_bookings);
Route.get('/bookings/:id', requireAuth, agent.get_my_booking_detail);
Route.patch('/bookings/:id/status', requireAuth, agent.update_my_booking_status);

// CUSTOMER MANAGEMENT (CRM) ROUTES
Route.get('/customers', requireAuth, agent.get_my_customers);

// PRODUCT ROUTES
Route.get('/products', requireAuth, agentProduct.list_my_products);
Route.post('/products', requireAuth, agentProduct.create_my_product);

// VOUCHER ROUTES
Route.get('/products/:id/vouchers', requireAuth, agentProduct.list_my_product_vouchers);
Route.put('/products/:id/vouchers', requireAuth, agentProduct.set_my_product_vouchers);

Route.get('/products/:id/images', requireAuth, agentProduct.list_my_product_images);
Route.post('/products/:id/images', requireAuth, agentProduct.add_my_product_images);
Route.put('/products/:id/images/reorder', requireAuth, agentProduct.reorder_my_product_images);
Route.put('/products/:id/images/:image_id', requireAuth, agentProduct.update_my_product_image);
Route.delete('/products/:id/images/:image_id', requireAuth, agentProduct.delete_my_product_image);

Route.get('/products/:id', requireAuth, agentProduct.get_my_product);
Route.put('/products/:id', requireAuth, agentProduct.update_my_product);
Route.delete('/products/:id/delete', requireAuth, agentProduct.delete_my_product);
Route.put('/products/:id/status', requireAuth, agentProduct.update_my_product_status);

// USER PROFILE ROUTES
Route.put('/profile/update', requireAuth, userController.update_my_profile);

// SETTINGS & CONFIGURATION ROUTES (ENTERPRISE)
Route.get('/profile/settings', requireAuth, agent.get_profile_settings);
Route.put('/profile', requireAuth, upload.single('avatar'), agent.update_profile_details);
Route.put('/password', requireAuth, agent.update_password);
Route.post('/bank/request-change', requireAuth, agent.request_bank_change);

const reviewController = require('../controllers/review');

// RATING & REVIEW ROUTES
Route.get('/rating/summary', requireAuth, reviewController.get_agent_rating_summary);
Route.get('/rating/reviews', requireAuth, reviewController.get_agent_reviews);
Route.post('/rating/reviews/:id/reply', requireAuth, reviewController.reply_to_review);
Route.post('/rating/reviews/:id/flag', requireAuth, reviewController.flag_review);

const db = require('../configs/db');

Route.get('/ai-impressions', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: true, message: 'Unauthorized' });
  try {
    const [rows] = await db.execute(
      `SELECT
         p.name                              AS product_name,
         p.image_url                         AS image,
         COUNT(ai.id)                        AS total_impressions,
         COUNT(DISTINCT ai.user_id)          AS unique_users,
         COUNT(DISTINCT DATE(ai.created_at)) AS active_days,
         MAX(ai.created_at)                  AS last_seen
       FROM   ai_impressions ai
       JOIN   products p ON p.id = ai.product_id
       WHERE  p.owner_id = ?
       GROUP  BY ai.product_id
       ORDER  BY total_impressions DESC
       LIMIT  20`,
      [userId]
    );
    return res.json({ error: false, data: rows });
  } catch (err) {
    console.error('[Agent] ai-impressions error:', err.message);
    return res.status(500).json({ error: true, message: 'Gagal mengambil data impressions.' });
  }
});

Route.get('/knowledge-base', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: true, message: 'Unauthorized' });
 
  try {
    const [rows] = await db.execute(
      `SELECT id, location, tip_type, title, content, valid_months, is_approved, is_active, created_at
       FROM   knowledge_base
       WHERE  agent_id = ?
       ORDER  BY created_at DESC`,
      [userId]
    );
    return res.json({ error: false, data: rows });
  } catch (err) {
    console.error('[KB] list error:', err.message);
    return res.status(500).json({ error: true, message: 'Gagal mengambil data.' });
  }
});
 
// ── POST tambah tip baru ──────────────────────────────────────────────────────
Route.post('/knowledge-base', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  if (!userId) return res.status(401).json({ error: true, message: 'Unauthorized' });
 
  const { location, tip_type, title, content, valid_months } = req.body;
 
  if (!location?.trim() || !title?.trim() || !content?.trim()) {
    return res.status(400).json({ error: true, message: 'location, title, dan content wajib diisi.' });
  }
 
  const VALID_TIP_TYPES = ['best_time','local_warning','hidden_gem','transport_tip','food_tip','culture_tip','practical_tip'];
  if (!VALID_TIP_TYPES.includes(tip_type)) {
    return res.status(400).json({ error: true, message: 'tip_type tidak valid.' });
  }
 
  try {
    const [result] = await db.execute(
      `INSERT INTO knowledge_base (agent_id, location, tip_type, title, content, valid_months, is_approved)
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [
        userId,
        location.trim().toLowerCase(),
        tip_type,
        title.trim().substring(0, 200),
        content.trim().substring(0, 2000),
        valid_months?.trim() || null,
      ]
    );
    return res.status(201).json({ error: false, message: 'Tips berhasil dikirim dan menunggu approval.', data: { id: result.insertId } });
  } catch (err) {
    console.error('[KB] create error:', err.message);
    return res.status(500).json({ error: true, message: 'Gagal menyimpan tips.' });
  }
});
 
// ── PUT update tip milik sendiri ──────────────────────────────────────────────
Route.put('/knowledge-base/:id', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  const { id }  = req.params;
  const { title, content, valid_months, is_active } = req.body;
 
  if (!userId) return res.status(401).json({ error: true, message: 'Unauthorized' });
 
  try {
    // Pastikan tip ini milik agent yang login
    const [[tip]] = await db.execute(
      'SELECT id FROM knowledge_base WHERE id = ? AND agent_id = ?',
      [id, userId]
    );
    if (!tip) return res.status(404).json({ error: true, message: 'Tips tidak ditemukan.' });
 
    await db.execute(
      `UPDATE knowledge_base
       SET title        = COALESCE(?, title),
           content      = COALESCE(?, content),
           valid_months = ?,
           is_active    = COALESCE(?, is_active),
           is_approved  = 0  -- reset approval setelah edit
       WHERE id = ? AND agent_id = ?`,
      [
        title?.trim().substring(0, 200) || null,
        content?.trim().substring(0, 2000) || null,
        valid_months?.trim() || null,
        is_active !== undefined ? Number(is_active) : null,
        id, userId,
      ]
    );
    return res.json({ error: false, message: 'Tips diupdate. Menunggu approval ulang.' });
  } catch (err) {
    console.error('[KB] update error:', err.message);
    return res.status(500).json({ error: true, message: 'Gagal mengupdate tips.' });
  }
});
 
// ── DELETE hapus tip milik sendiri ───────────────────────────────────────────
Route.delete('/knowledge-base/:id', requireAuth, async (req, res) => {
  const userId = req.session?.user?.id;
  const { id }  = req.params;
  if (!userId) return res.status(401).json({ error: true, message: 'Unauthorized' });
 
  try {
    const [result] = await db.execute(
      'DELETE FROM knowledge_base WHERE id = ? AND agent_id = ?',
      [id, userId]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: true, message: 'Tips tidak ditemukan.' });
    return res.json({ error: false, message: 'Tips dihapus.' });
  } catch (err) {
    console.error('[KB] delete error:', err.message);
    return res.status(500).json({ error: true, message: 'Gagal menghapus tips.' });
  }
});

module.exports = Route;