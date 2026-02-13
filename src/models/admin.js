const conn = require("../configs/db");

async function list_agent_products_admin(params = {}) {
  const owner_id = params.owner_id ? Number(params.owner_id) : null;
  const q = params.q ? String(params.q).trim() : "";
  const page = params.page ? Math.max(1, Number(params.page)) : 1;
  const limit = params.limit
    ? Math.min(100, Math.max(1, Number(params.limit)))
    : 20;
  const offset = (page - 1) * limit;

  const where = [`u.role = 'AGENT'`];
  const values = [];

  if (owner_id && Number.isFinite(owner_id)) {
    where.push(`p.owner_id = ?`);
    values.push(owner_id);
  }

  if (q) {
    where.push(`(p.name LIKE ? OR p.location LIKE ?)`);
    values.push(`%${q}%`, `%${q}%`);
  }

  const where_sql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // COUNT: tidak perlu DISTINCT kalau tidak join ke product_images
  const count_sql = `
    SELECT COUNT(*) AS total
    FROM products p
    JOIN users u ON u.id = p.owner_id
    ${where_sql}
  `;

  const [count_rows] = await conn.query(count_sql, values);
  const total = Number(count_rows?.[0]?.total || 0);

  /**
   * DATA:
   * - Hindari GROUP BY + GROUP_CONCAT
   * - Ambil images_json per product via subquery (ordered)
   */
  const sql = `
    SELECT
      p.id,
      p.owner_id,
      p.category_id,
      p.name,
      p.description,
      p.price,
      p.currency,
      p.location,
      p.image_url,
      p.features,
      p.details,
      p.daily_capacity,
      p.lat,
      p.lng,
      p.rating,
      p.is_active,
      p.created_at,
      p.updated_at,

      u.name AS owner_name,
      u.email AS owner_email,
      up.avatar_url AS owner_avatar,

      COALESCE(
        (
          SELECT JSON_ARRAYAGG(t.obj)
          FROM (
            SELECT JSON_OBJECT(
              'id', pi.id,
              'url', pi.image_url,
              'sort_order', pi.sort_order,
              'created_at', pi.created_at
            ) AS obj
            FROM product_images pi
            WHERE pi.product_id = p.id
            ORDER BY pi.sort_order ASC, pi.id ASC
          ) t
        ),
        JSON_ARRAY()
      ) AS images_json

    FROM products p
    JOIN users u ON u.id = p.owner_id
    LEFT JOIN user_profiles up ON up.user_id = u.id
    ${where_sql}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `;

  const [rows] = await conn.query(sql, [...values, limit, offset]);

  const data = rows.map((r) => ({
    id: r.id,
    owner_id: r.owner_id,
    category_id: r.category_id,
    name: r.name,
    description: r.description,
    price: r.price != null ? Number(r.price) : 0,
    currency: r.currency,
    location: r.location,

    // konsisten seperti list owner/get by id
    image: r.image_url, // cover lama
    images: safe_images_json(r.images_json), // gallery objects

    // kalau kamu masih butuh field lama:
    image_url: r.image_url,

    features: safe_json_array(r.features),
    details: safe_json_object(r.details),
    daily_capacity: r.daily_capacity != null ? Number(r.daily_capacity) : null,
    lat: r.lat,
    lng: r.lng,
    rating: r.rating != null ? Number(r.rating) : 0,
    is_active: !!r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,

    owner: {
      id: r.owner_id,
      name: r.owner_name,
      email: r.owner_email,
      avatar_url: r.owner_avatar || null,
    },
  }));

  return {
    meta: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit),
    },
    data,
  };
}

async function get_dashboard_summary() {
  const sql = `
    SELECT
      COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN total_price END), 0) AS total_revenue,
      COUNT(*) AS total_bookings,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_bookings,
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending_bookings,
      SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) AS cancelled_bookings
    FROM bookings
  `;

  const [rows] = await conn.query(sql);

  return rows[0];
}

async function get_agent_product_detail_admin(product_id) {
  const sql = `
    SELECT
      p.id,
      p.owner_id,
      p.category_id,
      p.name,
      p.description,
      p.price,
      p.currency,
      p.location,
      p.image_url,
      p.daily_capacity,
      p.lat,
      p.lng,
      p.rating,
      p.is_active,
      p.features,
      p.details,
      p.created_at,
      p.updated_at,

      u.id AS owner_user_id,
      u.name AS owner_name,
      u.email AS owner_email,
      up.avatar_url AS owner_avatar_url

    FROM products p
    JOIN users u ON u.id = p.owner_id
    LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE p.id = ?
    LIMIT 1
  `;

  const [rows] = await conn.query(sql, [product_id]);
  const row = rows?.[0];
  if (!row) return null;

  const imgSql = `
    SELECT id, image_url AS url, created_at, sort_order
    FROM product_images
    WHERE product_id = ?
    ORDER BY sort_order ASC, id ASC
  `;
  const [imgRows] = await conn.query(imgSql, [product_id]);

  const featuresArr = Array.isArray(row.features)
    ? row.features
    : safeJsonParse(row.features, []);

  const detailsObj =
    typeof row.details === "object" && row.details !== null
      ? row.details
      : safeJsonParse(row.details, {});

  const image = row.image_url || null;

  return {
    id: row.id,
    owner_id: row.owner_id,
    category_id: row.category_id,
    name: row.name,
    description: row.description,
    price: row.price,
    currency: row.currency,
    location: row.location,

    image,
    images: imgRows || [],
    image_url: row.image_url,

    features: featuresArr,
    details: detailsObj,

    daily_capacity: row.daily_capacity,
    rating: row.rating,
    lat: row.lat,
    lng: row.lng,
    is_active: !!row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,

    owner: {
      id: row.owner_user_id,
      name: row.owner_name,
      email: row.owner_email,
      avatar_url: row.owner_avatar_url,
    },
  };
}

/**
 * JSON helpers yang tahan:
 * - mysql2 bisa balikin: object/array, string JSON, atau Buffer
 */
function safe_images_json(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;

  if (Buffer.isBuffer(v)) {
    try {
      const parsed = JSON.parse(v.toString("utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function safe_json_array(v) {
  if (v == null || v === "") return [];
  if (Array.isArray(v)) return v;

  if (Buffer.isBuffer(v)) {
    try {
      const parsed = JSON.parse(v.toString("utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function safe_json_object(v) {
  if (v == null || v === "") return {};
  if (typeof v === "object" && !Array.isArray(v) && !Buffer.isBuffer(v))
    return v;

  if (Buffer.isBuffer(v)) {
    try {
      const parsed = JSON.parse(v.toString("utf8"));
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  }

  return {};
}

async function list_agent_users() {
  const sql = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      u.verification_status,
      u.specialization,
      up.avatar_url,

      av.id                   AS av_id,
      av.user_id              AS av_user_id,
      av.agent_type           AS av_agent_type,
      av.id_card_number       AS av_id_card_number,
      av.tax_id               AS av_tax_id,
      av.company_name         AS av_company_name,
      av.bank_name            AS av_bank_name,
      av.bank_account_number  AS av_bank_account_number,
      av.bank_account_holder  AS av_bank_account_holder,
      av.specialization       AS av_specialization,
      av.id_document_url      AS av_id_document_url,
      av.status               AS av_status,
      av.reviewed_by          AS av_reviewed_by,
      av.reviewed_at          AS av_reviewed_at,
      av.rejection_reason     AS av_rejection_reason,
      av.created_at           AS av_created_at,
      av.updated_at           AS av_updated_at

    FROM users u
    LEFT JOIN agent_verifications av
      ON av.user_id = u.id
    LEFT JOIN user_profiles up
      ON up.user_id = u.id
    WHERE u.role = 'AGENT'
    ORDER BY u.created_at DESC
  `;

  const [rows] = await conn.query(sql);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatar: row.avatar_url || null,

    verification_status: row.verification_status,
    specialization: row.specialization || null,

    verification: row.av_id
      ? {
          id: row.av_id,
          user_id: row.av_user_id,
          agent_type: row.av_agent_type,
          id_card_number: row.av_id_card_number,
          tax_id: row.av_tax_id,
          company_name: row.av_company_name,
          bank_name: row.av_bank_name,
          bank_account_number: row.av_bank_account_number,
          bank_account_holder: row.av_bank_account_holder,
          specialization: row.av_specialization,
          id_document_url: row.av_id_document_url,
          status: row.av_status,
          reviewed_by: row.av_reviewed_by,
          reviewed_at: row.av_reviewed_at,
          rejection_reason: row.av_rejection_reason,
          created_at: row.av_created_at,
          updated_at: row.av_updated_at,
        }
      : null,
  }));
}

async function list_customer_users() {
  const sql = `
    SELECT
      u.id,
      u.name,
      u.email,
      u.role,
      up.avatar_url
    FROM users u
    LEFT JOIN user_profiles up
      ON up.user_id = u.id
    WHERE u.role = 'CUSTOMER'
    ORDER BY u.created_at DESC
  `;

  const [rows] = await conn.query(sql);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    avatar: row.avatar_url || null,
  }));
}

module.exports = {
  list_agent_users,
  list_customer_users,
  list_agent_products_admin,
  get_agent_product_detail_admin,
  get_dashboard_summary,
};
