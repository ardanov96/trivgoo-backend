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

async function list_all_products() {
  const rows = await query(`
    SELECT p.*, u.name AS owner_name 
    FROM products p 
    JOIN users u ON u.id = p.owner_id
    WHERE p.is_active = 1
    ORDER BY p.created_at DESC
  `);
  
  return rows.map(row => ({
    ...row,
    price: Number(row.price),
    rating: row.rating ? Number(row.rating) : 0,
    image: row.image_url,  // Tambahkan field ini
    features: safeJsonParse(row.features, []),  // Gunakan safeJsonParse (konsisten)
    details: safeJsonParse(row.details, {})
  }));
}

async function find_product_row_by_id(product_id) {
  const rows = await query(
    `
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
      p.features,
      p.details,
      p.rating,
      p.is_active,
      p.created_at,

      COALESCE(
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', pi.id,
              'url', pi.image_url,
              'sort_order', pi.sort_order,
              'created_at', pi.created_at
            )
          )
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.sort_order ASC, pi.id ASC
        ),
        JSON_ARRAY()
      ) AS images_json

    FROM products p
    WHERE p.id = ?
    LIMIT 1
    `,
    [product_id]
  );

  return rows?.[0] ?? null;
}

async function find_product_images(product_id) {
  const rows = await query(
    `
      SELECT
        image_url
      FROM product_images
      WHERE product_id = ?
      ORDER BY sort_order ASC, id ASC
    `,
    [product_id]
  );

  return rows.map((r) => r.image_url);
}

async function find_product_blocked_dates(product_id) {
  const rows = await query(
    `
      SELECT
        DATE_FORMAT(blocked_date, '%Y-%m-%d') AS blocked_date
      FROM product_blocked_dates
      WHERE product_id = ?
      ORDER BY blocked_date ASC
    `,
    [product_id]
  );

  return rows.map((r) => r.blocked_date);
}

async function build_product_response(row) {
  if (!row) return null;

  const images = await find_product_images(row.id);
  const blocked_dates = await find_product_blocked_dates(row.id);

  return {
    id: row.id,
    owner_id: row.owner_id,
    category_id: row.category_id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    currency: row.currency,
    location: row.location,
    image: row.image_url,
    images,
    features,
    details,
    daily_capacity: row.daily_capacity,
    blocked_dates,
    rating: row.rating ? Number(row.rating) : 0,
    is_active: !!row.is_active,
    created_at: row.created_at,
  };
}

async function create_product(payload) {
  const result = await query(
    `
      INSERT INTO products (
        owner_id,
        category_id,
        name,
        description,
        price,
        currency,
        location,
        image_url,
        features,
        details,
        daily_capacity,
        lat,
        lng
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
    `,
    [
      payload.owner_id,
      payload.category_id,
      payload.name,
      payload.description,
      payload.price,
      payload.currency,
      payload.location,
      payload.image_url,
      payload.features ? JSON.stringify(payload.features) : null,
      payload.details ? JSON.stringify(payload.details) : null,
      payload.daily_capacity,
      payload.lat,
      payload.lng,
    ]
  );

  const product_id = result.insertId;

  // images
  if (Array.isArray(payload.images) && payload.images.length > 0) {
    for (let i = 0; i < payload.images.length; i += 1) {
      await query(
        `
          INSERT INTO product_images (product_id, image_url, sort_order)
          VALUES (?,?,?)
        `,
        [product_id, payload.images[i], i]
      );
    }
  }

  // blocked dates
  if (
    Array.isArray(payload.blocked_dates) &&
    payload.blocked_dates.length > 0
  ) {
    for (const date of payload.blocked_dates) {
      await query(
        `
          INSERT IGNORE INTO product_blocked_dates (product_id, blocked_date)
          VALUES (?,?)
        `,
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

  const set = (key, val) => {
    fields.push(`${key} = ?`);
    values.push(val);
  };

  if (payload.category_id !== undefined)
    set("category_id", payload.category_id);
  if (payload.name !== undefined) set("name", payload.name);
  if (payload.description !== undefined)
    set("description", payload.description);
  if (payload.price !== undefined) set("price", payload.price);
  if (payload.currency !== undefined) set("currency", payload.currency);
  if (payload.location !== undefined) set("location", payload.location);
  if (payload.image_url !== undefined) set("image_url", payload.image_url);
  if (payload.daily_capacity !== undefined)
    set("daily_capacity", payload.daily_capacity);

  if (payload.features !== undefined) {
    set("features", payload.features ? JSON.stringify(payload.features) : null);
  }

  if (payload.details !== undefined) {
    set("details", payload.details ? JSON.stringify(payload.details) : null);
  }

  if (payload.lat != undefined) {
    set("lat", payload.lat);
  }

  if (payload.lng != undefined) {
    set("lng", payload.lng);
  }

  if (fields.length > 0) {
    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    const sql = `
      UPDATE products
      SET ${fields.join(", ")}
      WHERE id = ? AND owner_id = ?
    `;

    await query(sql, [...values, product_id, owner_id]);
  }

  // images (replace only if sent)
  if (Array.isArray(payload.images)) {
    await query(`DELETE FROM product_images WHERE product_id = ?`, [
      product_id,
    ]);

    for (let i = 0; i < payload.images.length; i += 1) {
      await query(
        `
          INSERT INTO product_images (product_id, image_url, sort_order)
          VALUES (?,?,?)
        `,
        [product_id, payload.images[i], i]
      );
    }
  }

  // blocked_dates (replace only if sent)
  if (Array.isArray(payload.blocked_dates)) {
    await query(`DELETE FROM product_blocked_dates WHERE product_id = ?`, [
      product_id,
    ]);

    for (const date of payload.blocked_dates) {
      await query(
        `
          INSERT IGNORE INTO product_blocked_dates (product_id, blocked_date)
          VALUES (?,?)
        `,
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

  await query(`DELETE FROM product_images WHERE product_id = ?`, [product_id]);
  await query(`DELETE FROM product_blocked_dates WHERE product_id = ?`, [
    product_id,
  ]);

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
    `
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
      p.features,
      p.details,
      p.rating,
      p.is_active,
      p.created_at,
      p.updated_at,

      u.id AS owner_user_id,
      u.name AS owner_name,
      u.email AS owner_email,
      up.avatar_url AS owner_avatar_url,

      -- ambil semua images per product, urut sort_order
      COALESCE(
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', pi.id,
              'url', pi.image_url,
              'sort_order', pi.sort_order,
              'created_at', pi.created_at
            )
          )
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.sort_order ASC, pi.id ASC
        ),
        JSON_ARRAY()
      ) AS images_json

    FROM products p
    JOIN users u ON u.id = p.owner_id
    LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE p.owner_id = ?
    ORDER BY p.created_at DESC
    `,
    [oid]
  );

  return rows.map((row) => {
    let images = row.images_json;
    images = safeJsonParse(images, []);
    if (!Array.isArray(images)) images = [];

    const featuresRaw = safeJsonParse(row.features, []);
    const features = Array.isArray(featuresRaw) ? featuresRaw : [];

    const detailsRaw = safeJsonParse(row.details, {});
    const details =
      typeof detailsRaw === "object" && detailsRaw !== null ? detailsRaw : {};

    return {
      id: row.id,
      owner_id: row.owner_id,
      category_id: row.category_id,
      name: row.name,
      description: row.description,
      price: Number(row.price),
      currency: row.currency,
      location: row.location,

      image: row.image_url,
      image_url: row.image_url,
      images,

      features,
      details,

      daily_capacity: row.daily_capacity,
      rating: row.rating ? Number(row.rating) : 0,
      is_active: !!row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,

      owner: {
        id: row.owner_user_id,
        name: row.owner_name,
        email: row.owner_email,
        avatar_url: row.owner_avatar_url ?? null,
      },
    };
  });
}

function safeJsonParse(v, fallback) {
  if (v == null) return fallback;

  if (Buffer.isBuffer(v)) {
    try {
      return JSON.parse(v.toString("utf8"));
    } catch {
      return fallback;
    }
  }

  if (typeof v === "object") return v;
  if (typeof v !== "string") return fallback;

  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

async function get_product_by_id_for_owner(product_id, owner_id) {
  const pid = Number(product_id);
  const oid = Number(owner_id);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  if (!Number.isFinite(oid) || oid <= 0) return null;

  const rows = await query(
    `
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
      p.features,
      p.details,
      p.rating,
      p.is_active,
      p.created_at,
      p.updated_at,

      u.id AS owner_user_id,
      u.name AS owner_name,
      u.email AS owner_email,
      up.avatar_url AS owner_avatar_url,

      COALESCE(
        (
          SELECT JSON_ARRAYAGG(
            JSON_OBJECT(
              'id', pi.id,
              'url', pi.image_url,
              'sort_order', pi.sort_order,
              'created_at', pi.created_at
            )
          )
          FROM product_images pi
          WHERE pi.product_id = p.id
          ORDER BY pi.sort_order ASC, pi.id ASC
        ),
        JSON_ARRAY()
      ) AS images_json

    FROM products p
    JOIN users u ON u.id = p.owner_id
    LEFT JOIN user_profiles up ON up.user_id = u.id
    WHERE p.id = ? AND p.owner_id = ?
    LIMIT 1
    `,
    [pid, oid]
  );

  const row = rows?.[0];
  if (!row) return null;

  let images = safeJsonParse(row.images_json, []);
  if (!Array.isArray(images)) images = [];

  const featuresRaw = safeJsonParse(row.features, []);
  const features = Array.isArray(featuresRaw) ? featuresRaw : [];

  const detailsRaw = safeJsonParse(row.details, {});
  const details =
    typeof detailsRaw === "object" && detailsRaw !== null ? detailsRaw : {};

  return {
    id: row.id,
    owner_id: row.owner_id,
    category_id: row.category_id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    currency: row.currency,
    location: row.location,
    image: row.image_url,
    image_url: row.image_url,
    images,
    features,
    details,
    daily_capacity: row.daily_capacity,
    rating: row.rating ? Number(row.rating) : 0,
    is_active: !!row.is_active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    owner: {
      id: row.owner_user_id,
      name: row.owner_name,
      email: row.owner_email,
      avatar_url: row.owner_avatar_url ?? null,
    },
  };
}

async function get_product_by_id(product_id) {
  const row = await find_product_row_by_id(product_id);
  if (!row) return null;
  
  // Memanfaatkan fungsi build_product_response yang sudah Anda miliki di model
  return await build_product_response(row);
}

async function list_product_images_for_owner(product_id, owner_id) {
  await ensure_owned_product(product_id, owner_id);

  const rows = await query(
    `
      SELECT
        id,
        product_id,
        image_url,
        sort_order,
        created_at
      FROM product_images
      WHERE product_id = ?
      ORDER BY sort_order ASC, id ASC
    `,
    [product_id]
  );

  return rows || [];
}

async function add_product_image_for_owner(product_id, owner_id, payload) {
  await ensure_owned_product(product_id, owner_id);

  const image_url =
    typeof payload?.image_url === "string" ? payload.image_url.trim() : "";
  const sort_order =
    typeof payload?.sort_order === "number" &&
    Number.isFinite(payload.sort_order)
      ? payload.sort_order
      : 0;

  if (!image_url) {
    const err = new Error("image_url is required");
    err.code = "VALIDATION";
    throw err;
  }

  const result = await query(
    `
      INSERT INTO product_images (product_id, image_url, sort_order)
      VALUES (?,?,?)
    `,
    [product_id, image_url, sort_order]
  );

  return {
    id: result.insertId,
    product_id,
    image_url,
    sort_order,
  };
}

async function add_product_images_bulk_for_owner(product_id, owner_id, images) {
  await ensure_owned_product(product_id, owner_id);

  if (!Array.isArray(images) || images.length === 0) {
    const err = new Error("images is required");
    err.code = "VALIDATION";
    throw err;
  }

  const inserted = [];

  for (let i = 0; i < images.length; i += 1) {
    const item = images[i];

    const image_url =
      typeof item?.image_url === "string" ? item.image_url.trim() : "";
    const sort_order =
      typeof item?.sort_order === "number" && Number.isFinite(item.sort_order)
        ? item.sort_order
        : i;

    if (!image_url) continue;

    const res = await query(
      `
        INSERT INTO product_images (product_id, image_url, sort_order)
        VALUES (?,?,?)
      `,
      [product_id, image_url, sort_order]
    );

    inserted.push({
      id: res.insertId,
      product_id,
      image_url,
      sort_order,
    });
  }

  return inserted;
}

async function update_product_image_for_owner(
  product_id,
  owner_id,
  image_id,
  payload
) {
  await ensure_owned_product(product_id, owner_id);

  const id = Number(image_id);
  if (!id) {
    const err = new Error("image_id is invalid");
    err.code = "VALIDATION";
    throw err;
  }

  const sets = [];
  const params = [];

  if (typeof payload?.image_url === "string") {
    const image_url = payload.image_url.trim();
    if (!image_url) {
      const err = new Error("image_url cannot be empty");
      err.code = "VALIDATION";
      throw err;
    }
    sets.push("image_url = ?");
    params.push(image_url);
  }

  if (
    typeof payload?.sort_order === "number" &&
    Number.isFinite(payload.sort_order)
  ) {
    sets.push("sort_order = ?");
    params.push(payload.sort_order);
  }

  if (sets.length === 0) {
    const err = new Error("No fields to update");
    err.code = "VALIDATION";
    throw err;
  }

  params.push(product_id, id);

  const res = await query(
    `
      UPDATE product_images
      SET ${sets.join(", ")}
      WHERE product_id = ? AND id = ?
    `,
    params
  );

  return { affected_rows: res.affectedRows || 0 };
}

async function delete_product_image_for_owner(product_id, owner_id, image_id) {
  await ensure_owned_product(product_id, owner_id);

  const id = Number(image_id);
  if (!id) {
    const err = new Error("image_id is invalid");
    err.code = "VALIDATION";
    throw err;
  }

  const res = await query(
    `
      DELETE FROM product_images
      WHERE product_id = ? AND id = ?
    `,
    [product_id, id]
  );

  return { affected_rows: res.affectedRows || 0 };
}

async function reorder_product_images_for_owner(product_id, owner_id, order) {
  await ensure_owned_product(product_id, owner_id);

  if (!Array.isArray(order) || order.length === 0) {
    const err = new Error("order is required");
    err.code = "VALIDATION";
    throw err;
  }

  let touched = 0;

  // update satu-satu (simple)
  for (const item of order) {
    const id = Number(item?.id);
    const sort_order = Number(item?.sort_order);

    if (!id || !Number.isFinite(sort_order)) continue;

    const res = await query(
      `
        UPDATE product_images
        SET sort_order = ?
        WHERE product_id = ? AND id = ?
      `,
      [sort_order, product_id, id]
    );

    touched += res.affectedRows || 0;
  }

  return { affected_rows: touched };
}

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
  get_product_by_id
};
