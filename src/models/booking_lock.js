const db = require('../configs/db');

async function query(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

const BookingLock = {
  /**
   * Membuat atau me-refresh soft lock untuk kombinasi (user/cart_token + product)
   * Tanpa mengurangi stok permanen; hanya reservasi sementara dengan TTL.
   */
  createOrRefresh: async ({
    userId = null,
    cartToken = null,
    productId,
    quantity = 1,
    startDate = null,
    endDate = null,
    ttlSeconds = 15 * 60,
    metadata = {},
  }) => {
    const ownerUserId = userId || null;
    const ownerCartToken = cartToken || null;

    // Normalisasi nilai
    const qty = Number(quantity) > 0 ? Number(quantity) : 1;
    const ttl = Number(ttlSeconds) > 0 ? Number(ttlSeconds) : 900;

    const metaJson = metadata && Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;
    const ttlParam = ttl;

    // 1) Coba update lock yang sudah ada (status PENDING & belum expired)
    const updateRes = await db.query(
      `
      UPDATE booking_locks
      SET
        quantity = ?,
        start_date = ?,
        end_date = ?,
        status = 'PENDING',
        expires_at = DATE_ADD(NOW(), INTERVAL ? SECOND),
        metadata = ?,
        updated_at = NOW()
      WHERE user_id <=> ?
        AND cart_token <=> ?
        AND product_id = ?
        AND status = 'PENDING'
      `,
      [
        qty,
        startDate,
        endDate,
        ttlParam,
        metaJson,
        ownerUserId,
        ownerCartToken,
        productId,
      ],
    );

    // 2) Jika tidak ada baris yang diupdate, buat lock baru
    const affected = updateRes?.[0]?.affectedRows ?? updateRes?.affectedRows ?? 0;
    if (!affected) {
      await query(
        `
        INSERT INTO booking_locks (
          user_id,
          cart_token,
          product_id,
          quantity,
          start_date,
          end_date,
          status,
          expires_at,
          metadata,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', DATE_ADD(NOW(), INTERVAL ? SECOND), ?, NOW(), NOW())
        `,
        [
          ownerUserId,
          ownerCartToken,
          productId,
          qty,
          startDate,
          endDate,
          ttlParam,
          metaJson,
        ],
      );
    }

    const rows = await query(
      `
      SELECT *
      FROM booking_locks
      WHERE user_id <=> ? AND cart_token <=> ? AND product_id = ? AND status = 'PENDING'
      ORDER BY id DESC
      LIMIT 1
      `,
      [ownerUserId, ownerCartToken, productId],
    );

    return rows?.[0] || null;
  },

  /**
   * Mengambil semua lock aktif (PENDING dan belum expired) untuk owner tertentu.
   */
  listActiveForOwner: async ({ userId = null, cartToken = null }) => {
    const rows = await query(
      `
      SELECT *
      FROM booking_locks
      WHERE status = 'PENDING'
        AND expires_at > NOW()
        AND (user_id <=> ? OR cart_token <=> ?)
      ORDER BY expires_at ASC
      `,
      [userId || null, cartToken || null],
    );

    return rows || [];
  },

  /**
   * Validasi satu lock by id dan pastikan belum expired.
   */
  findActiveById: async (id) => {
    const rows = await query(
      `
      SELECT *
      FROM booking_locks
      WHERE id = ?
        AND status = 'PENDING'
        AND expires_at > NOW()
      LIMIT 1
      `,
      [id],
    );
    return rows?.[0] || null;
  },
};

module.exports = BookingLock;

