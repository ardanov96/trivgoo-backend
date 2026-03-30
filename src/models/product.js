const conn = require("../configs/db");

async function query(sql, params = []) {
  try {
    const [rows] = await conn.execute(sql, params);
    return rows;
  } catch (err) {
    err.message = `${err.message}\nSQL: ${sql}`;
    throw err;
  }
}

function resolve_image_url(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const BASE_URL =
    process.env.BASE_URL ||
    process.env.API_URL_DEV ||
    "http://localhost:4000";
  return `${BASE_URL}/${path}`;
}

function normalize_image_path(path) {
  if (!path) return null;
  if (!path.startsWith("http://") && !path.startsWith("https://")) return path;
  const BASE_URL =
    process.env.BASE_URL ||
    process.env.API_URL_DEV ||
    "http://localhost:4000";
  try {
    const url = new URL(path);
    return url.pathname.replace(/^\//, "");
  } catch {
    return path;
  }
}

function safeJsonParse(v, fallback) {
  if (v == null) return fallback;
  if (Buffer.isBuffer(v)) {
    try { return JSON.parse(v.toString("utf8")); } catch { return fallback; }
  }
  if (typeof v === "object") return v;
  if (typeof v !== "string") return fallback;
  try { return JSON.parse(v); } catch { return fallback; }
}

// ── Finders ───────────────────────────────────────────────────────────────────

async function find_product_row_by_id(product_id) {
  const rows = await query(
    `SELECT
       p.id, p.owner_id, p.category_id, p.name, p.description, p.price,
       p.currency, p.location, p.lat, p.lng, p.image_url, p.daily_capacity,
       p.features, p.details, p.seo_title, p.seo_description, p.seo_slug,
       p.seo_keyword, p.seo_canonical, p.seo_og_image, p.rating, p.is_active,
       p.created_at,
       u.specialization AS owner_specialization,
       u.name           AS owner_name,
       av.company_name  AS owner_company_name,
       COALESCE((
         SELECT JSON_ARRAYAGG(
           JSON_OBJECT('id', pi.id, 'url', pi.image_url, 'sort_order', pi.sort_order, 'created_at', pi.created_at)
         ) FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.id ASC
       ), JSON_ARRAY()) AS images_json
     FROM products p
     JOIN users u ON u.id = p.owner_id
     LEFT JOIN agent_verifications av ON av.user_id = p.owner_id
     WHERE p.id = ?
     LIMIT 1`,
    [product_id]
  );
  return rows?.[0] ?? null;
}

async function find_product_images(product_id) {
  const rows = await query(
    `SELECT image_url FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC`,
    [product_id]
  );
  return rows.map((r) => r.image_url);
}

async function find_product_blocked_dates(product_id) {
  const rows = await query(
    `SELECT DATE_FORMAT(blocked_date, '%Y-%m-%d') AS blocked_date
     FROM product_blocked_dates WHERE product_id = ? ORDER BY blocked_date ASC`,
    [product_id]
  );
  return rows.map((r) => r.blocked_date);
}

// ── Voucher finder: admin global + agent linked ───────────────────────────────
async function find_product_vouchers(product_id) {
  // 1. Semua voucher ADMIN aktif (global, berlaku untuk semua produk)
  const adminRows = await query(
    `SELECT v.*, 'admin' AS scope_owner
     FROM vouchers v
     WHERE (v.scope_owner = 'admin' OR v.scope_owner IS NULL)
       AND v.is_active = 1
       AND (v.starts_at  IS NULL OR v.starts_at  <= NOW())
       AND (v.expires_at IS NULL OR v.expires_at >= NOW())
       AND (v.max_usage  IS NULL OR v.used_count  < v.max_usage)
     ORDER BY v.created_at DESC`,
  );

  // 2. Voucher AGENT yang di-link ke produk ini
  const agentRows = await query(
    `SELECT v.*, 'agent' AS scope_owner
     FROM vouchers v
     INNER JOIN product_vouchers pv ON pv.voucher_id = v.id
     WHERE pv.product_id = ?
       AND v.scope_owner  = 'agent'
       AND v.is_active    = 1
       AND (v.starts_at  IS NULL OR v.starts_at  <= NOW())
       AND (v.expires_at IS NULL OR v.expires_at >= NOW())
       AND (v.max_usage  IS NULL OR v.used_count  < v.max_usage)
     ORDER BY v.created_at DESC`,
    [product_id],
  );

  // 3. Gabungkan, deduplicate by id
  const map = new Map();
  for (const row of adminRows) map.set(row.id, row);
  for (const row of agentRows) map.set(row.id, row);
  return Array.from(map.values());
}

async function find_vouchers_for_products(product_ids) {
  if (!product_ids || product_ids.length === 0) return {};
  const placeholders = product_ids.map(() => "?").join(",");
  const rows = await query(
    `SELECT pv.product_id, v.*
     FROM product_vouchers pv
     JOIN vouchers v ON v.id = pv.voucher_id
     WHERE pv.product_id IN (${placeholders})
     ORDER BY v.created_at DESC`,
    product_ids
  );
  return rows.reduce((acc, row) => {
    const pid = row.product_id;
    if (!acc[pid]) acc[pid] = [];
    acc[pid].push(row);
    return acc;
  }, {});
}

// ── Response builder ──────────────────────────────────────────────────────────

async function build_product_response(row) {
  if (!row) return null;

  const images_raw    = await find_product_images(row.id);
  const blocked_dates = await find_product_blocked_dates(row.id);
  const vouchers      = await find_product_vouchers(row.id);

  const features       = safeJsonParse(row.features, []);
  const details        = safeJsonParse(row.details, {});
  const specialization = row.owner_specialization ?? null;
  const image          = resolve_image_url(row.image_url, specialization);
  const images         = images_raw.map((f) => resolve_image_url(f, specialization));

  return {
    id:             row.id,
    owner_id:       row.owner_id,
    category_id:    row.category_id,
    name:           row.name,
    description:    row.description,
    price:          Number(row.price),
    currency:       row.currency,
    location:       row.location,
    lat:            row.lat != null ? Number(row.lat) : null,
    lng:            row.lng != null ? Number(row.lng) : null,
    image,
    images,
    features,
    details,
    seo_title:      row.seo_title,
    seo_description:row.seo_description,
    seo_slug:       row.seo_slug,
    seo_keyword:    row.seo_keyword,
    seo_canonical:  row.seo_canonical,
    seo_og_image:   row.seo_og_image,
    daily_capacity: row.daily_capacity,
    blocked_dates,
    vouchers,
    rating:         row.rating ? Number(row.rating) : 0,
    is_active:      !!row.is_active,
    created_at:     row.created_at,
    // ✅ FIX: sertakan owner dengan company_name dari agent_verifications
    owner: {
      name:         row.owner_name         || null,
      company_name: row.owner_company_name || null,
    },
  };
}

// ── Public queries ────────────────────────────────────────────────────────────

async function list_all_products() {
  const rows = await query(
    // ✅ FIX: tambahkan LEFT JOIN ke agent_verifications dan sertakan company_name
    `SELECT
       p.*,
       u.name           AS owner_name,
       u.specialization AS owner_specialization,
       av.company_name  AS owner_company_name
     FROM products p
     JOIN users u ON u.id = p.owner_id
     LEFT JOIN agent_verifications av ON av.user_id = p.owner_id
     WHERE p.is_active = 1
     ORDER BY p.created_at DESC`
  );

  // 1 query untuk semua voucher, bukan N query
  const product_ids = rows.map((r) => r.id);
  const vouchersMap = await find_vouchers_for_products(product_ids);

  return rows.map((row) => ({
    ...row,
    price:     Number(row.price),
    rating:    row.rating ? Number(row.rating) : 0,
    image:     resolve_image_url(row.image_url, row.owner_specialization),
    image_url: resolve_image_url(row.image_url, row.owner_specialization),
    features:  safeJsonParse(row.features, []),
    details:   safeJsonParse(row.details, {}),
    vouchers:  vouchersMap[row.id] ?? [],
    // ✅ FIX: sertakan owner dengan company_name
    owner: {
      name:         row.owner_name         || null,
      company_name: row.owner_company_name || null,
    },
  }));
}

async function get_product_by_id(product_id) {
  const row = await find_product_row_by_id(product_id);
  if (!row) return null;
  return build_product_response(row);
}

// ── Agent CRUD ────────────────────────────────────────────────────────────────

async function create_product(payload) {
  const result = await query(
    `INSERT INTO products (
       owner_id, category_id, name, description, price, currency,
       location, image_url, features, details, 
       seo_title, seo_description, seo_slug, seo_keyword, seo_canonical, seo_og_image,
       daily_capacity, lat, lng
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      payload.owner_id,
      payload.category_id,
      payload.name,
      payload.description,
      payload.price,
      payload.currency,
      payload.location,
      normalize_image_path(payload.image_url),
      payload.features ? JSON.stringify(payload.features) : null,
      payload.details  ? JSON.stringify(payload.details)  : null,
      payload.seo_title || null,
      payload.seo_description || null,
      payload.seo_slug || null,
      payload.seo_keyword || null,
      payload.seo_canonical || null,
      payload.seo_og_image || null,
      payload.daily_capacity,
      payload.lat,
      payload.lng,
    ]
  );

  const product_id = result.insertId;

  if (Array.isArray(payload.images) && payload.images.length > 0) {
    for (let i = 0; i < payload.images.length; i++) {
      await query(
        `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?,?,?)`,
        [product_id, normalize_image_path(payload.images[i]), i]
      );
    }
  }

  if (Array.isArray(payload.blocked_dates) && payload.blocked_dates.length > 0) {
    for (const date of payload.blocked_dates) {
      await query(
        `INSERT IGNORE INTO product_blocked_dates (product_id, blocked_date) VALUES (?,?)`,
        [product_id, date]
      );
    }
  }

  const row = await find_product_row_by_id(product_id);
  return build_product_response(row);
}

async function update_product(product_id, owner_id, payload) {
  const existing = await find_product_row_by_id(product_id);
  if (!existing) return null;

  if (Number(existing.owner_id) !== Number(owner_id)) {
    const err = new Error("Forbidden");
    err.code = "FORBIDDEN";
    throw err;
  }

  const fields = [];
  const values = [];
  const set = (key, val) => { fields.push(`${key} = ?`); values.push(val); };

  if (payload.category_id    !== undefined) set("category_id",    payload.category_id);
  if (payload.name           !== undefined) set("name",           payload.name);
  if (payload.description    !== undefined) set("description",    payload.description);
  if (payload.price          !== undefined) set("price",          payload.price);
  if (payload.currency       !== undefined) set("currency",       payload.currency);
  if (payload.location       !== undefined) set("location",       payload.location);
  if (payload.image_url      !== undefined) set("image_url",      payload.image_url);
  if (payload.daily_capacity !== undefined) set("daily_capacity", payload.daily_capacity);
  if (payload.features       !== undefined) set("features", payload.features ? JSON.stringify(payload.features) : null);
  if (payload.details        !== undefined) set("details",  payload.details  ? JSON.stringify(payload.details)  : null);
  if (payload.seo_title      !== undefined) set("seo_title",       payload.seo_title || null);
  if (payload.seo_description!== undefined) set("seo_description", payload.seo_description || null);
  if (payload.seo_slug       !== undefined) set("seo_slug",        payload.seo_slug || null);
  if (payload.seo_keyword    !== undefined) set("seo_keyword",     payload.seo_keyword || null);
  if (payload.seo_canonical  !== undefined) set("seo_canonical",   payload.seo_canonical || null);
  if (payload.seo_og_image   !== undefined) set("seo_og_image",    payload.seo_og_image || null);
  if (payload.lat            != undefined)  set("lat", payload.lat);
  if (payload.lng            != undefined)  set("lng", payload.lng);

  if (fields.length > 0) {
    fields.push("updated_at = CURRENT_TIMESTAMP");
    await query(
      `UPDATE products SET ${fields.join(", ")} WHERE id = ? AND owner_id = ?`,
      [...values, product_id, owner_id]
    );
  }

  if (Array.isArray(payload.images)) {
    await query(`DELETE FROM product_images WHERE product_id = ?`, [product_id]);
    for (let i = 0; i < payload.images.length; i++) {
      await query(
        `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?,?,?)`,
        [product_id, normalize_image_path(payload.images[i]), i]
      );
    }
  }

  if (Array.isArray(payload.blocked_dates)) {
    await query(`DELETE FROM product_blocked_dates WHERE product_id = ?`, [product_id]);
    for (const date of payload.blocked_dates) {
      await query(
        `INSERT IGNORE INTO product_blocked_dates (product_id, blocked_date) VALUES (?,?)`,
        [product_id, date]
      );
    }
  }

  const row = await find_product_row_by_id(product_id);
  return build_product_response(row);
}

async function delete_product_for_owner(product_id, owner_id) {
  const existing = await find_product_row_by_id(product_id);
  if (!existing) return null;

  if (Number(existing.owner_id) !== Number(owner_id)) {
    const err = new Error("Forbidden");
    err.code = "FORBIDDEN";
    throw err;
  }

  await query(`DELETE FROM product_images WHERE product_id = ?`,        [product_id]);
  await query(`DELETE FROM product_blocked_dates WHERE product_id = ?`, [product_id]);
  await query(`DELETE FROM product_vouchers WHERE product_id = ?`,      [product_id]);

  const res = await query(
    `DELETE FROM products WHERE id = ? AND owner_id = ?`,
    [product_id, owner_id]
  );
  return { affected_rows: res.affectedRows || 0 };
}

async function list_products_by_owner(owner_id) {
  const oid = Number(owner_id);
  if (!Number.isFinite(oid) || oid <= 0) return [];

  const rows = await query(
    // ✅ FIX: tambahkan LEFT JOIN ke agent_verifications
    `SELECT
       p.id, p.owner_id, p.category_id, p.name, p.description, p.price,
       p.currency, p.location, p.lat, p.lng, p.image_url, p.daily_capacity,
       p.features, p.details, p.seo_title, p.seo_description, p.seo_slug,
       p.seo_keyword, p.seo_canonical, p.seo_og_image, p.rating, p.is_active,
       p.created_at, p.updated_at,
       u.id AS owner_user_id, u.name AS owner_name, u.email AS owner_email,
       u.specialization AS owner_specialization, up.avatar_url AS owner_avatar_url,
       av.company_name  AS owner_company_name,
       COALESCE((
         SELECT JSON_ARRAYAGG(
           JSON_OBJECT('id', pi.id, 'url', pi.image_url, 'sort_order', pi.sort_order, 'created_at', pi.created_at)
         ) FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.id ASC
       ), JSON_ARRAY()) AS images_json
     FROM products p
     JOIN users u ON u.id = p.owner_id
     LEFT JOIN user_profiles up ON up.user_id = u.id
     LEFT JOIN agent_verifications av ON av.user_id = p.owner_id
     WHERE p.owner_id = ?
     ORDER BY p.created_at DESC`,
    [oid]
  );

  return rows.map((row) => {
    const specialization = row.owner_specialization ?? null;
    let images = safeJsonParse(row.images_json, []);
    if (!Array.isArray(images)) images = [];
    images = images.map((img) => ({ ...img, url: resolve_image_url(img.url, specialization) }));
    const features = (() => { const r = safeJsonParse(row.features, []); return Array.isArray(r) ? r : []; })();
    const details  = (() => { const r = safeJsonParse(row.details, {});  return typeof r === "object" && r !== null ? r : {}; })();

    return {
      id:             row.id,
      owner_id:       row.owner_id,
      category_id:    row.category_id,
      name:           row.name,
      description:    row.description,
      price:          Number(row.price),
      currency:       row.currency,
      location:       row.location,
      lat:            row.lat  != null ? Number(row.lat)  : null,
      lng:            row.lng  != null ? Number(row.lng)  : null,
      image:          resolve_image_url(row.image_url, specialization),
      image_url:      resolve_image_url(row.image_url, specialization),
      images,
      features,
      details,
      seo_title:      row.seo_title,
      seo_description:row.seo_description,
      seo_slug:       row.seo_slug,
      seo_keyword:    row.seo_keyword,
      seo_canonical:  row.seo_canonical,
      seo_og_image:   row.seo_og_image,
      daily_capacity: row.daily_capacity,
      rating:         row.rating ? Number(row.rating) : 0,
      is_active:      !!row.is_active,
      created_at:     row.created_at,
      updated_at:     row.updated_at,
      owner: {
        id:             row.owner_user_id,
        name:           row.owner_name,
        email:          row.owner_email,
        specialization: row.owner_specialization,
        avatar_url:     row.owner_avatar_url ?? null,
        // ✅ FIX: sertakan company_name
        company_name:   row.owner_company_name || null,
      },
    };
  });
}

async function get_product_by_id_for_owner(product_id, owner_id) {
  const pid = Number(product_id);
  const oid = Number(owner_id);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  if (!Number.isFinite(oid) || oid <= 0) return null;

  const rows = await query(
    // ✅ FIX: tambahkan LEFT JOIN ke agent_verifications
    `SELECT
       p.id, p.owner_id, p.category_id, p.name, p.description, p.price,
       p.currency, p.location, p.lat, p.lng, p.image_url, p.daily_capacity,
       p.features, p.details, p.seo_title, p.seo_description, p.seo_slug,
       p.seo_keyword, p.seo_canonical, p.seo_og_image, p.rating, p.is_active,
       p.created_at, p.updated_at,
       u.id AS owner_user_id, u.name AS owner_name, u.email AS owner_email,
       u.specialization AS owner_specialization, up.avatar_url AS owner_avatar_url,
       av.company_name  AS owner_company_name,
       COALESCE((
         SELECT JSON_ARRAYAGG(
           JSON_OBJECT('id', pi.id, 'url', pi.image_url, 'sort_order', pi.sort_order, 'created_at', pi.created_at)
         ) FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.sort_order ASC, pi.id ASC
       ), JSON_ARRAY()) AS images_json
     FROM products p
     JOIN users u ON u.id = p.owner_id
     LEFT JOIN user_profiles up ON up.user_id = u.id
     LEFT JOIN agent_verifications av ON av.user_id = p.owner_id
     WHERE p.id = ? AND p.owner_id = ?
     LIMIT 1`,
    [pid, oid]
  );

  const row = rows?.[0];
  if (!row) return null;

  const specialization = row.owner_specialization ?? null;
  let images = safeJsonParse(row.images_json, []);
  if (!Array.isArray(images)) images = [];
  images = images.map((img) => ({ ...img, url: resolve_image_url(img.url, specialization) }));

  const features      = (() => { const r = safeJsonParse(row.features, []); return Array.isArray(r) ? r : []; })();
  const details       = (() => { const r = safeJsonParse(row.details, {});  return typeof r === "object" && r !== null ? r : {}; })();
  const blocked_dates = await find_product_blocked_dates(pid);
  const vouchers      = await find_product_vouchers(pid);

  return {
    id:             row.id,
    owner_id:       row.owner_id,
    category_id:    row.category_id,
    name:           row.name,
    description:    row.description,
    price:          Number(row.price),
    currency:       row.currency,
    location:       row.location,
    lat:            row.lat  != null ? Number(row.lat)  : null,
    lng:            row.lng  != null ? Number(row.lng)  : null,
    image:          resolve_image_url(row.image_url, specialization),
    image_url:      resolve_image_url(row.image_url, specialization),
    images,
    features,
    details,
    seo_title:      row.seo_title,
    seo_description:row.seo_description,
    seo_slug:       row.seo_slug,
    seo_keyword:    row.seo_keyword,
    seo_canonical:  row.seo_canonical,
    seo_og_image:   row.seo_og_image,
    daily_capacity: row.daily_capacity,
    blocked_dates,
    vouchers,
    rating:         row.rating ? Number(row.rating) : 0,
    is_active:      !!row.is_active,
    created_at:     row.created_at,
    updated_at:     row.updated_at,
    owner: {
      id:             row.owner_user_id,
      name:           row.owner_name,
      email:          row.owner_email,
      specialization: row.owner_specialization,
      avatar_url:     row.owner_avatar_url ?? null,
      // ✅ FIX: sertakan company_name
      company_name:   row.owner_company_name || null,
    },
  };
}

// ── Image management ──────────────────────────────────────────────────────────

async function list_product_images_for_owner(product_id, owner_id) {
  await ensure_owned_product(product_id, owner_id);
  const rows = await query(
    `SELECT id, product_id, image_url, sort_order, created_at FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC`,
    [product_id]
  );
  return rows || [];
}

async function add_product_image_for_owner(product_id, owner_id, payload) {
  await ensure_owned_product(product_id, owner_id);
  const image_url  = typeof payload?.image_url === "string" ? payload.image_url.trim() : "";
  const sort_order = typeof payload?.sort_order === "number" && Number.isFinite(payload.sort_order) ? payload.sort_order : 0;
  if (!image_url) { const err = new Error("image_url is required"); err.code = "VALIDATION"; throw err; }
  const result = await query(
    `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?,?,?)`,
    [product_id, image_url, sort_order]
  );
  return { id: result.insertId, product_id, image_url, sort_order };
}

async function add_product_images_bulk_for_owner(product_id, owner_id, images) {
  await ensure_owned_product(product_id, owner_id);
  if (!Array.isArray(images) || images.length === 0) { const err = new Error("images is required"); err.code = "VALIDATION"; throw err; }
  const inserted = [];
  for (let i = 0; i < images.length; i++) {
    const item       = images[i];
    const image_url  = typeof item?.image_url === "string" ? item.image_url.trim() : "";
    const sort_order = typeof item?.sort_order === "number" && Number.isFinite(item.sort_order) ? item.sort_order : i;
    if (!image_url) continue;
    const res = await query(
      `INSERT INTO product_images (product_id, image_url, sort_order) VALUES (?,?,?)`,
      [product_id, image_url, sort_order]
    );
    inserted.push({ id: res.insertId, product_id, image_url, sort_order });
  }
  return inserted;
}

async function update_product_image_for_owner(product_id, owner_id, image_id, payload) {
  await ensure_owned_product(product_id, owner_id);
  const id = Number(image_id);
  if (!id) { const err = new Error("image_id is invalid"); err.code = "VALIDATION"; throw err; }
  const sets = []; const params = [];
  if (typeof payload?.image_url === "string") {
    const image_url = payload.image_url.trim();
    if (!image_url) { const err = new Error("image_url cannot be empty"); err.code = "VALIDATION"; throw err; }
    sets.push("image_url = ?"); params.push(image_url);
  }
  if (typeof payload?.sort_order === "number" && Number.isFinite(payload.sort_order)) {
    sets.push("sort_order = ?"); params.push(payload.sort_order);
  }
  if (sets.length === 0) { const err = new Error("No fields to update"); err.code = "VALIDATION"; throw err; }
  params.push(product_id, id);
  const res = await query(`UPDATE product_images SET ${sets.join(", ")} WHERE product_id = ? AND id = ?`, params);
  return { affected_rows: res.affectedRows || 0 };
}

async function delete_product_image_for_owner(product_id, owner_id, image_id) {
  await ensure_owned_product(product_id, owner_id);
  const id = Number(image_id);
  if (!id) { const err = new Error("image_id is invalid"); err.code = "VALIDATION"; throw err; }
  const res = await query(`DELETE FROM product_images WHERE product_id = ? AND id = ?`, [product_id, id]);
  return { affected_rows: res.affectedRows || 0 };
}

async function reorder_product_images_for_owner(product_id, owner_id, order) {
  await ensure_owned_product(product_id, owner_id);
  if (!Array.isArray(order) || order.length === 0) { const err = new Error("order is required"); err.code = "VALIDATION"; throw err; }
  let touched = 0;
  for (const item of order) {
    const id         = Number(item?.id);
    const sort_order = Number(item?.sort_order);
    if (!id || !Number.isFinite(sort_order)) continue;
    const res = await query(`UPDATE product_images SET sort_order = ? WHERE product_id = ? AND id = ?`, [sort_order, product_id, id]);
    touched += res.affectedRows || 0;
  }
  return { affected_rows: touched };
}

async function set_product_active_for_owner(product_id, owner_id, active) {
  await ensure_owned_product(product_id, owner_id);
  const res = await query(
    `UPDATE products SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND owner_id = ?`,
    [active ? 1 : 0, product_id, owner_id]
  );
  return { affected_rows: res.affectedRows || 0 };
}

// ── Voucher CRUD ──────────────────────────────────────────────────────────────

async function get_product_vouchers(product_id) {
  return find_product_vouchers(product_id);
}

async function set_product_vouchers(product_id, owner_id, voucher_ids) {
  const existing = await find_product_row_by_id(product_id);
  if (!existing) return null;

  if (Number(existing.owner_id) !== Number(owner_id)) {
    const err = new Error("Forbidden");
    err.code = "FORBIDDEN";
    throw err;
  }

  await query(`DELETE FROM product_vouchers WHERE product_id = ?`, [product_id]);

  if (Array.isArray(voucher_ids) && voucher_ids.length > 0) {
    for (const vid of voucher_ids) {
      const numVid = Number(vid);
      if (!Number.isFinite(numVid) || numVid <= 0) continue;
      await query(
        `INSERT IGNORE INTO product_vouchers (product_id, voucher_id) VALUES (?,?)`,
        [product_id, numVid]
      );
    }
  }

  return get_product_vouchers(product_id);
}

// ── Ownership guard ───────────────────────────────────────────────────────────

async function ensure_owned_product(product_id, owner_id) {
  const row = await find_product_row_by_id(product_id);
  if (!row) { const err = new Error("Product not found"); err.code = "NOT_FOUND"; throw err; }
  if (Number(row.owner_id) !== Number(owner_id)) { const err = new Error("Forbidden"); err.code = "FORBIDDEN"; throw err; }
  return row;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  create_product,
  update_product,
  delete_product_for_owner,
  get_product_by_id_for_owner,
  list_products_by_owner,
  list_product_images_for_owner,
  add_product_image_for_owner,
  add_product_images_bulk_for_owner,
  update_product_image_for_owner,
  delete_product_image_for_owner,
  reorder_product_images_for_owner,
  list_all_products,
  get_product_by_id,
  resolve_image_url,
  set_product_active_for_owner,
  get_product_vouchers,
  set_product_vouchers,
};