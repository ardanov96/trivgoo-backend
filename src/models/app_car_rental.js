const db = require('../configs/db');
const tableExistsCache = new Map();

function to_number(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function safe_json_parse(value, fallback) {
  if (value == null) return fallback;
  if (Buffer.isBuffer(value)) {
    try {
      return JSON.parse(value.toString('utf8'));
    } catch {
      return fallback;
    }
  }
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function resolve_asset_url(path) {
  if (!path) return null;
  const value = String(path).trim();
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;

  const base = (
    process.env.BASE_URL ||
    process.env.API_URL_DEV ||
    'http://localhost:4000'
  ).replace(/\/+$/, '');

  const normalized = `/${value.replace(/\\/g, '/').replace(/^\/+/, '').replace(/^public\//, '')}`;
  return `${base}${normalized}`;
}

function format_mysql_datetime(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function format_currency(amount, currency = 'IDR', unit = 'day') {
  const safeAmount = Number(amount || 0);
  const formatter = new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  });
  return `${formatter.format(safeAmount)}/${unit === 'day' ? 'hari' : unit}`;
}

function truncate_text(text, max = 96) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}...`;
}

function normalize_features(value) {
  const parsed = safe_json_parse(value, []);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalize_location(location, lat, lng) {
  const label = String(location || '').trim();
  return {
    code: slugify(label),
    label,
    lat: to_number(lat),
    lng: to_number(lng),
  };
}

function extract_car_details(row, details = {}) {
  return {
    id: row.car_id || to_number(details.car_id),
    name: row.car_name || row.name || null,
    brand: row.car_brand || null,
    model_year: row.car_model_year || (details.year != null ? String(details.year) : null),
    transmission: row.car_transmission || details.transmission || null,
    seats: to_number(row.car_seats) || to_number(details.seats),
    fuel_type: row.car_fuel_type || details.fuel_type || null,
    luggage: to_number(details.luggage),
  };
}

function build_availability(row, availability = null) {
  if (!row) {
    return {
      is_available: availability ? availability.total_booked <= 0 : true,
      daily_capacity: 1,
      remaining_on_selected_date: availability ? Math.max(0, 1 - availability.total_booked) : null,
    };
  }

  const capacity = Math.max(1, to_number(row.daily_capacity) || 1);
  const remaining = availability ? Math.max(0, capacity - availability.total_booked) : null;
  return {
    is_available: availability ? remaining > 0 : true,
    daily_capacity: capacity,
    remaining_on_selected_date: remaining,
  };
}

function is_car_rental_row(row, details = {}) {
  return details?.type === 'car' || !!row.car_id || !!details?.car_id;
}

function build_list_item(row, availability = null) {
  const details = safe_json_parse(row.details, {});
  if (!is_car_rental_row(row, details)) return null;

  const car = extract_car_details(row, details);
  const priceUnit = String(details.price_unit || 'day').trim().toLowerCase() || 'day';

  return {
    id: row.id,
    slug: row.seo_slug || slugify(row.name),
    name: row.name,
    short_description: truncate_text(row.description, 104),
    price: {
      amount: Number(row.price || 0),
      currency: row.currency || 'IDR',
      unit: priceUnit,
      formatted: format_currency(row.price, row.currency || 'IDR', priceUnit),
    },
    location: normalize_location(row.location, row.lat, row.lng),
    car,
    media: {
      cover_url: resolve_asset_url(row.image_url) || resolve_asset_url(row.car_image),
    },
    rating: {
      average: Number(row.avg_rating || row.rating || 0),
      count: Number(row.review_count || 0),
    },
    features: normalize_features(row.features).slice(0, 3),
    availability: build_availability(row, availability),
  };
}

function matches_filters(item, filters) {
  const q = String(filters.q || '').trim().toLowerCase();
  const location = String(filters.location || '').trim().toLowerCase();
  const transmission = String(filters.transmission || '').trim().toLowerCase();
  const seatsMin = to_number(filters.seats_min);
  const priceMin = to_number(filters.price_min);
  const priceMax = to_number(filters.price_max);

  if (q) {
    const haystack = [
      item.name,
      item.location.label,
      item.car.name,
      item.car.brand,
      item.short_description,
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ');

    if (!haystack.includes(q)) return false;
  }

  if (location) {
    const locationCode = String(item.location.code || '').toLowerCase();
    const locationLabel = String(item.location.label || '').toLowerCase();
    if (!locationCode.includes(location) && !locationLabel.includes(location)) return false;
  }

  if (transmission) {
    const currentTransmission = String(item.car.transmission || '').toLowerCase();
    if (currentTransmission !== transmission) return false;
  }

  if (seatsMin != null && Number(item.car.seats || 0) < seatsMin) return false;
  if (priceMin != null && Number(item.price.amount || 0) < priceMin) return false;
  if (priceMax != null && Number(item.price.amount || 0) > priceMax) return false;

  return true;
}

function sort_items(items, sort) {
  const mode = String(sort || 'recommended').trim().toLowerCase();
  const sorted = [...items];

  if (mode === 'price_asc') {
    sorted.sort((a, b) => a.price.amount - b.price.amount || b.rating.average - a.rating.average);
    return sorted;
  }

  if (mode === 'price_desc') {
    sorted.sort((a, b) => b.price.amount - a.price.amount || b.rating.average - a.rating.average);
    return sorted;
  }

  if (mode === 'rating_desc') {
    sorted.sort((a, b) => b.rating.average - a.rating.average || b.rating.count - a.rating.count);
    return sorted;
  }

  sorted.sort((a, b) => {
    if (b.rating.average !== a.rating.average) return b.rating.average - a.rating.average;
    if (b.rating.count !== a.rating.count) return b.rating.count - a.rating.count;
    return a.price.amount - b.price.amount;
  });
  return sorted;
}

async function query(sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows;
}

async function has_table(tableName) {
  if (tableExistsCache.has(tableName)) {
    return tableExistsCache.get(tableName);
  }

  const rows = await query(
    `SELECT 1
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = ?
     LIMIT 1`,
    [tableName],
  );

  const exists = rows.length > 0;
  tableExistsCache.set(tableName, exists);
  return exists;
}

async function get_base_rows() {
  const hasReviewsTable = await has_table('reviews');

  return query(
    `SELECT
       p.id,
       p.owner_id,
       p.name,
       p.description,
       p.price,
       p.currency,
       p.location,
       p.lat,
       p.lng,
       p.image_url,
       p.features,
       p.details,
       p.daily_capacity,
       p.rating,
       p.created_at,
       p.updated_at,
       p.seo_slug,
       p.car_id AS product_car_id,
       u.id AS agent_id,
       u.name AS agent_name,
       u.specialization AS agent_specialization,
       av.company_name AS agent_company_name,
       c.id AS car_id,
       c.name AS car_name,
       c.brand AS car_brand,
       c.model_year AS car_model_year,
       c.transmission AS car_transmission,
       c.seats AS car_seats,
       c.fuel_type AS car_fuel_type,
       c.image AS car_image,
       c.description AS car_description,
       ${hasReviewsTable ? 'COALESCE(rs.review_count, 0)' : '0'} AS review_count,
       ${hasReviewsTable ? 'COALESCE(rs.avg_rating, p.rating, 0)' : 'COALESCE(p.rating, 0)'} AS avg_rating
     FROM products p
     JOIN users u ON u.id = p.owner_id
     LEFT JOIN agent_verifications av ON av.user_id = u.id
     LEFT JOIN cars c
       ON c.id = COALESCE(
         p.car_id,
         CASE
           WHEN JSON_VALID(p.details) THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(p.details, '$.car_id')) AS UNSIGNED)
           ELSE NULL
         END
       )
     ${hasReviewsTable ? `LEFT JOIN (
       SELECT product_id, COUNT(*) AS review_count, ROUND(AVG(rating), 1) AS avg_rating
       FROM reviews
       GROUP BY product_id
     ) rs ON rs.product_id = p.id` : ''}
     WHERE p.is_active = 1
       AND u.specialization = 'TRANSPORT'
     ORDER BY p.created_at DESC`,
  );
}

async function get_row_by_id(id) {
  const hasReviewsTable = await has_table('reviews');
  const rows = await query(
    `SELECT
       p.id,
       p.owner_id,
       p.name,
       p.description,
       p.price,
       p.currency,
       p.location,
       p.lat,
       p.lng,
       p.image_url,
       p.features,
       p.details,
       p.daily_capacity,
       p.rating,
       p.created_at,
       p.updated_at,
       p.seo_slug,
       p.car_id AS product_car_id,
       u.id AS agent_id,
       u.name AS agent_name,
       u.specialization AS agent_specialization,
       av.company_name AS agent_company_name,
       c.id AS car_id,
       c.name AS car_name,
       c.brand AS car_brand,
       c.model_year AS car_model_year,
       c.transmission AS car_transmission,
       c.seats AS car_seats,
       c.fuel_type AS car_fuel_type,
       c.image AS car_image,
       c.description AS car_description,
       ${hasReviewsTable ? 'COALESCE(rs.review_count, 0)' : '0'} AS review_count,
       ${hasReviewsTable ? 'COALESCE(rs.avg_rating, p.rating, 0)' : 'COALESCE(p.rating, 0)'} AS avg_rating
     FROM products p
     JOIN users u ON u.id = p.owner_id
     LEFT JOIN agent_verifications av ON av.user_id = u.id
     LEFT JOIN cars c
       ON c.id = COALESCE(
         p.car_id,
         CASE
           WHEN JSON_VALID(p.details) THEN CAST(JSON_UNQUOTE(JSON_EXTRACT(p.details, '$.car_id')) AS UNSIGNED)
           ELSE NULL
         END
       )
     ${hasReviewsTable ? `LEFT JOIN (
       SELECT product_id, COUNT(*) AS review_count, ROUND(AVG(rating), 1) AS avg_rating
       FROM reviews
       GROUP BY product_id
     ) rs ON rs.product_id = p.id` : ''}
     WHERE p.id = ?
       AND p.is_active = 1
       AND u.specialization = 'TRANSPORT'
     LIMIT 1`,
    [id],
  );

  return rows[0] || null;
}

async function get_gallery(productId, coverUrl) {
  const hasProductImagesTable = await has_table('product_images');
  if (!hasProductImagesTable) {
    return coverUrl ? [coverUrl] : [];
  }

  const rows = await query(
    `SELECT image_url
     FROM product_images
     WHERE product_id = ?
     ORDER BY sort_order ASC, id ASC`,
    [productId],
  );

  const urls = [];
  const seen = new Set();

  for (const candidate of [coverUrl, ...rows.map((row) => resolve_asset_url(row.image_url))]) {
    const value = String(candidate || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    urls.push(value);
  }

  return urls;
}

async function get_reviews_preview(productId) {
  const hasReviewsTable = await has_table('reviews');
  if (!hasReviewsTable) return [];

  const rows = await query(
    `SELECT
       r.id,
       r.rating,
       r.comment,
       r.created_at,
       u.name AS user_name
     FROM reviews r
     JOIN users u ON u.id = r.user_id
     WHERE r.product_id = ?
     ORDER BY r.created_at DESC
     LIMIT 3`,
    [productId],
  );

  return rows.map((row) => ({
    id: row.id,
    user_name: row.user_name || 'User',
    rating: Number(row.rating || 0),
    comment: row.comment || '',
    created_at: row.created_at,
  }));
}

function date_to_datetime_range(startDate, endDate) {
  const start = String(startDate || '').trim();
  const end = String(endDate || startDate || '').trim();
  if (!start || !end) return null;

  const endDateValue = new Date(`${end}T00:00:00`);
  if (Number.isNaN(endDateValue.getTime())) return null;
  endDateValue.setDate(endDateValue.getDate() + 1);

  return {
    startDate: start,
    endDate: end,
    startAt: `${start} 00:00:00`,
    endAtExclusive: format_mysql_datetime(endDateValue),
  };
}

async function get_availability_map(productIds, startDate, endDate) {
  if (!Array.isArray(productIds) || productIds.length === 0) return new Map();

  const range = date_to_datetime_range(startDate, endDate);
  if (!range) return new Map();

  const placeholders = productIds.map(() => '?').join(', ');
  const rows = await query(
    `SELECT
       product_id,
       COALESCE(SUM(quantity), 0) AS total_booked
     FROM bookings
     WHERE product_id IN (${placeholders})
       AND status != 'CANCELLED'
       AND payment_status = 'PAID'
       AND (
         (start_time IS NOT NULL AND end_time IS NOT NULL AND start_time < ? AND end_time > ?)
         OR
         ((start_time IS NULL OR end_time IS NULL) AND date BETWEEN ? AND ?)
       )
     GROUP BY product_id`,
    [...productIds, range.endAtExclusive, range.startAt, range.startDate, range.endDate],
  );

  const map = new Map();
  for (const row of rows) {
    map.set(Number(row.product_id), {
      total_booked: Number(row.total_booked || 0),
    });
  }
  return map;
}

async function list_car_rentals(filters = {}) {
  const rows = await get_base_rows();
  const rowMap = new Map(rows.map((row) => [Number(row.id), row]));
  const rawItems = rows
    .map((row) => build_list_item(row))
    .filter(Boolean);

  const filtered = rawItems.filter((item) => matches_filters(item, filters));
  const availabilityMap = await get_availability_map(
    filtered.map((item) => item.id),
    filters.start_date,
    filters.end_date,
  );

  const withAvailability = filtered.map((item) => {
    const sourceRow = rowMap.get(Number(item.id));
    return {
      ...item,
      availability: build_availability(sourceRow, availabilityMap.get(item.id) || null),
    };
  });

  const sorted = sort_items(withAvailability, filters.sort);
  const page = Math.max(1, Number.parseInt(filters.page, 10) || 1);
  const limit = Math.min(50, Math.max(1, Number.parseInt(filters.limit, 10) || 10));
  const total = sorted.length;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 0;
  const startIndex = (page - 1) * limit;
  const data = sorted.slice(startIndex, startIndex + limit);

  return {
    data,
    meta: {
      page,
      limit,
      total,
      total_pages: totalPages,
      has_next: page < totalPages,
      has_prev: page > 1,
    },
  };
}

async function get_car_rental_detail(id, filters = {}) {
  const row = await get_row_by_id(id);
  if (!row) return null;

  const details = safe_json_parse(row.details, {});
  if (!is_car_rental_row(row, details)) return null;

  const availabilityMap = await get_availability_map(
    [Number(id)],
    filters.start_date,
    filters.end_date,
  );
  const availability = availabilityMap.get(Number(id)) || null;
  const car = extract_car_details(row, details);
  const coverUrl = resolve_asset_url(row.image_url) || resolve_asset_url(row.car_image);
  const gallery = await get_gallery(row.id, coverUrl);
  const reviewsPreview = await get_reviews_preview(row.id);
  const priceUnit = String(details.price_unit || 'day').trim().toLowerCase() || 'day';

  return {
    id: row.id,
    slug: row.seo_slug || slugify(row.name),
    name: row.name,
    description: row.description || row.car_description || '',
    price: {
      amount: Number(row.price || 0),
      currency: row.currency || 'IDR',
      unit: priceUnit,
      formatted: format_currency(row.price, row.currency || 'IDR', priceUnit),
    },
    location: normalize_location(row.location, row.lat, row.lng),
    car,
    media: {
      cover_url: coverUrl,
      gallery,
    },
    features: normalize_features(row.features),
    policy: {
      with_driver_available: Boolean(details.driver),
      pickup_available: true,
      dropoff_available: true,
      instant_confirmation: details.instant_confirmation !== false,
      cancellation_policy: details.cancellation_policy || null,
    },
    agent: {
      id: row.agent_id,
      name: row.agent_name || null,
      company_name: row.agent_company_name || null,
    },
    rating: {
      average: Number(row.avg_rating || row.rating || 0),
      count: Number(row.review_count || 0),
    },
    reviews_preview: reviewsPreview,
    availability: build_availability(row, availability),
  };
}

async function get_car_rental_filters() {
  const rows = await get_base_rows();
  const items = rows
    .map((row) => build_list_item(row))
    .filter(Boolean);

  const locationsMap = new Map();
  const transmissions = new Set();
  const fuelTypes = new Set();
  const seatOptions = new Set();

  for (const item of items) {
    if (item.location.label) {
      locationsMap.set(item.location.code, {
        id: item.location.code,
        label: item.location.label,
      });
    }
    if (item.car.transmission) transmissions.add(item.car.transmission);
    if (item.car.fuel_type) fuelTypes.add(item.car.fuel_type);
    if (item.car.seats) seatOptions.add(Number(item.car.seats));
  }

  return {
    locations: Array.from(locationsMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
    transmissions: Array.from(transmissions.values()).sort((a, b) => a.localeCompare(b)),
    fuel_types: Array.from(fuelTypes.values()).sort((a, b) => a.localeCompare(b)),
    seat_options: Array.from(seatOptions.values()).sort((a, b) => a - b),
    sort_options: [
      { id: 'recommended', label: 'Rekomendasi' },
      { id: 'price_asc', label: 'Harga Terendah' },
      { id: 'price_desc', label: 'Harga Tertinggi' },
      { id: 'rating_desc', label: 'Rating Tertinggi' },
    ],
  };
}

module.exports = {
  list_car_rentals,
  get_car_rental_detail,
  get_car_rental_filters,
};
