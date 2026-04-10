const db     = require('../configs/db');
const crypto = require('crypto');

const GROQ_KEY   = process.env.GROQ_API_KEY  ?? '';
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? '';
const PROVIDER   = process.env.AI_PROVIDER   ?? 'groq';

// ── Availability check ────────────────────────────────────────────────────────
// Returns a Set of product IDs that are fully booked / blocked
// during the requested travel window.

async function getUnavailableProductIds(travelStart, travelEnd) {
  if (!travelStart) return new Set();

  const unavailable = new Set();
  const end = travelEnd || travelStart; // single-date trip = same day

  try {
    // 1. Check bookings table — products with confirmed/paid bookings in window
    //    Tours use a single `date` column.
    //    Stays/Cars use `date` as "start_date – end_date" string, OR have
    //    separate columns. We do a broad LIKE check as fallback.
    const [rows] = await db.execute(
      `SELECT DISTINCT product_id
       FROM   bookings
       WHERE  payment_status IN ('PAID','CONFIRMED','confirmed','paid')
         AND  (
               -- single-date booking overlaps window
               (date >= ? AND date <= ?)
               OR
               -- range booking stored as "YYYY-MM-DD - YYYY-MM-DD"
               (date LIKE '%-%-%' AND
                SUBSTRING_INDEX(TRIM(date), ' - ', 1) <= ? AND
                SUBSTRING_INDEX(TRIM(date), ' - ', -1) >= ?)
             )`,
      [travelStart, end, end, travelStart]
    );
    rows.forEach(r => unavailable.add(r.product_id));
  } catch (err) {
    // bookings table structure may differ — skip silently, don't block AI call
    console.warn('[AI] availability check skipped:', err.message);
  }

  return unavailable;
}

// ── User booking profile ──────────────────────────────────────────────────────
// Ambil histori booking user untuk personalisasi rekomendasi AI

async function getUserProfile(userId) {
  if (!userId) return null;

  try {
    const [rows] = await db.execute(
      `SELECT
         b.product_name,
         b.total_price,
         b.date,
         b.vehicle_type,
         p.location,
         p.category_id,
         p.rating
       FROM   bookings b
       LEFT   JOIN products p ON p.id = b.product_id
       WHERE  b.user_id = ?
         AND  b.payment_status IN ('PAID', 'CONFIRMED')
       ORDER  BY b.created_at DESC
       LIMIT  8`,
      [userId]
    );

    if (!rows.length) return null;

    // Hitung kategori favorit
    const catCount = { Tour: 0, Stay: 0, Transport: 0 };
    rows.forEach(r => {
      if (r.category_id === 1 || r.vehicle_type === 'tour')      catCount.Tour++;
      else if (r.category_id === 2 || r.vehicle_type === 'stay') catCount.Stay++;
      else                                                        catCount.Transport++;
    });
    const favCategory = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0][0];

    // Lokasi yang pernah dikunjungi
    const locations = [...new Set(
      rows.map(r => r.location?.split(',')[0]?.trim()).filter(Boolean)
    )].slice(0, 5);

    // Rata-rata spend
    const avgPrice = Math.round(
      rows.reduce((s, r) => s + parseFloat(r.total_price || 0), 0) / rows.length
    );

    // Produk terakhir
    const recentProducts = rows.slice(0, 3).map(r => r.product_name).filter(Boolean);

    return { favCategory, locations, avgPrice, recentProducts, totalBookings: rows.length };
  } catch (err) {
    console.warn('[AI] getUserProfile skipped:', err.message);
    return null;
  }
}

// Check if a product's blocked_dates overlap with the travel window
function isProductBlocked(blockedDatesRaw, travelStart, travelEnd) {
  if (!travelStart || !blockedDatesRaw) return false;
  try {
    // blocked_dates_csv dari GROUP_CONCAT: "2026-05-01,2026-05-02,..."
    const dates = typeof blockedDatesRaw === 'string'
      ? blockedDatesRaw.split(',').map(d => d.trim()).filter(Boolean)
      : [];
    if (!Array.isArray(dates) || dates.length === 0) return false;

    const start = new Date(travelStart);
    const end   = travelEnd ? new Date(travelEnd) : start;

    return dates.some(d => {
      const bd = new Date(d);
      return bd >= start && bd <= end;
    });
  } catch {
    return false;
  }
}

// ── Prompt Builders ───────────────────────────────────────────────────────────

function buildSystemPrompt(products, travelStart, travelEnd, userProfile) {
  const ctx = products.map(p => {
    const base = {
      id:           p.id,
      name:         p.name,
      description:  p.description?.substring(0, 100) ?? '',
      price:        p.price,
      currency:     p.currency ?? 'IDR',
      location:     p.location,
      rating:       p.rating,
      category:     p.category_id === 1 ? 'Tour'
                  : p.category_id === 2 ? 'Stay'
                  : 'Transport',
    };

    // Attach availability if dates were provided
    if (travelStart) {
      base.availability = p._available ? 'AVAILABLE' : 'FULLY_BOOKED';
      if (!p._available) {
        base.availability_note = 'Already booked on requested dates — suggest as alternative or skip';
      }
    }

    return base;
  });

  const dateCtx = travelStart
    ? `\nTRAVEL DATES: ${travelStart}${travelEnd && travelEnd !== travelStart ? ` to ${travelEnd}` : ' (single day)'}`
    : '';

  const availRule = travelStart
    ? `\n5. AVAILABILITY: Products marked FULLY_BOOKED are unavailable on the requested dates. Prefer AVAILABLE products. You may mention FULLY_BOOKED ones as "alternative if dates change" but do NOT place them as primary recommendations.`
    : '';

  const profileCtx = userProfile
      ? `\nUSER PROFILE (personalize based on this):
  - Favorite category: ${userProfile.favCategory}
  - Previously visited: ${userProfile.locations.join(', ') || 'none yet'}
  - Average spend per booking: IDR ${userProfile.avgPrice.toLocaleString('id-ID')}
  - Recent bookings: ${userProfile.recentProducts.join(', ') || 'none'}
  - Total past bookings: ${userProfile.totalBookings}
  - Instruction: Prioritize ${userProfile.favCategory} products. If user visited a location before, suggest nearby unexplored destinations. Match budget to their usual spend range.`
      : '';

  return `You are an expert travel consultant for Trivgoo, a travel platform for Indonesia & Asia.
${dateCtx}${profileCtx}

AVAILABLE TRIVGOO SERVICES (JSON):
${JSON.stringify(ctx)}

RULES:
1. Create detailed day-by-day itineraries in Markdown with ### Day N: Title headings.
2. Recommend services from AVAILABLE TRIVGOO SERVICES that fit the user's needs.
3. When refining, preserve what the user liked and only change what was requested.
4. At the very end of EVERY response, you MUST output this exact line: [[RECOMMENDED_IDS]]: followed by a JSON array.${availRule}

FORMAT — follow EXACTLY, no deviation:
[Itinerary in Markdown with ### Day N: Title headings]

---
[[RECOMMENDED_IDS]]: [101, 102]

CRITICAL: The last line MUST start with [[RECOMMENDED_IDS]]: — never output just a plain array like [101, 102].`;}

function buildInitialPrompt(userStory, travelStart, travelEnd) {
  const dateHint = travelStart
    ? ` (travel dates: ${travelStart}${travelEnd && travelEnd !== travelStart ? ` – ${travelEnd}` : ''})`
    : '';
  return `USER REQUEST: "${userStory}"${dateHint}

Please create a detailed travel itinerary based on this request, following the format rules above.`;
}

// ── Response Parser ───────────────────────────────────────────────────────────

function parseResponse(fullText) {
  const marker              = '[[RECOMMENDED_IDS]]:';
  let itinerary             = fullText;
  let recommendedProductIds = [];

  if (fullText.includes(marker)) {
    const parts = fullText.split(marker);
    itinerary = parts[0].replace(/---\s*$/, '').trim();
    try {
      recommendedProductIds = JSON.parse(parts[1].trim());
    } catch {
      console.error('[AI] Failed to parse recommended IDs');
    }
  }

  return { itinerary, recommendedProductIds };
}

// ── Provider Callers ──────────────────────────────────────────────────────────

async function callGroq(messages) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body:    JSON.stringify({
      model:       'llama-3.3-70b-versatile',
      messages,
      temperature: 0.7,
      max_tokens:  2048,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callGemini(messages) {
  const systemMsg = messages.find(m => m.role === 'system');
  const contents  = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const body = { contents };
  if (systemMsg) body.systemInstruction = { parts: [{ text: systemMsg.content }] };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callAI(messages) {
  const hasGroq   = !!GROQ_KEY;
  const hasGemini = !!GEMINI_KEY;

  if (PROVIDER === 'groq' && hasGroq) {
    try { return { text: await callGroq(messages), via: 'groq' }; }
    catch (e) {
      console.warn('[AI] Groq failed, fallback Gemini:', e.message);
      if (hasGemini) {
        // Jika 429, tunggu 3 detik sebelum coba Gemini
        if (e.message.includes('429')) await sleep(3000);
        try { return { text: await callGemini(messages), via: 'gemini-fallback' }; }
        catch (e2) {
          if (e2.message.includes('429')) {
            // Kedua provider rate limited — retry Groq sekali lagi setelah 10 detik
            console.warn('[AI] Both rate limited, retry Groq in 10s...');
            await sleep(10000);
            return { text: await callGroq(messages), via: 'groq-retry' };
          }
          throw e2;
        }
      }
      throw e;
    }
  }
}
// ── Shared: fetch products + mark availability ────────────────────────────────

async function fetchProducts(travelStart, travelEnd, userId) {
  const [rows] = await db.execute(
    `SELECT p.id, p.name, p.description, p.price, p.currency, p.location,
            p.rating, p.category_id, p.image_url AS image,
            GROUP_CONCAT(pbd.blocked_date ORDER BY pbd.blocked_date) AS blocked_dates_csv
     FROM   products p
     LEFT JOIN product_blocked_dates pbd ON pbd.product_id = p.id
     WHERE  p.is_active = 1
     GROUP  BY p.id
     ORDER  BY p.rating DESC
     LIMIT  30`
  );

  // Attach availability flag
  const unavailable = await getUnavailableProductIds(travelStart, travelEnd);

  const userProfile = await getUserProfile(userId);

  return {
    products: rows.map(p => ({
      ...p,
      _available: !unavailable.has(p.id) && !isProductBlocked(p.blocked_dates_csv, travelStart, travelEnd),
    })),
    userProfile,
  };
}

// ── Controller: Generate ──────────────────────────────────────────────────────

exports.generateTripPlan = async (req, res) => {
  const { userStory, travelStart, travelEnd } = req.body;

  if (!userStory?.trim()) {
    return res.status(400).json({ error: true, message: 'userStory wajib diisi.' });
  }
  if (!GROQ_KEY && !GEMINI_KEY) {
    return res.status(503).json({ error: true, message: 'AI service belum dikonfigurasi.' });
  }

  try {
    const userId = req.session?.user?.id ?? null;
    const { products, userProfile } = await fetchProducts(travelStart, travelEnd, userId);

    if (userProfile) {
      console.log(`[AI] Personalized for user ${userId}: fav=${userProfile.favCategory}, bookings=${userProfile.totalBookings}`);
    }

    const messages = [
      { role: 'system', content: buildSystemPrompt(products, travelStart, travelEnd, userProfile) },
      { role: 'user',   content: buildInitialPrompt(userStory, travelStart, travelEnd) },
    ];

    const { text, via } = await callAI(messages);
    const { itinerary, recommendedProductIds } = parseResponse(text);

    // Only return AVAILABLE products in recommendations
    const recommendedProducts = products.filter(p =>
      recommendedProductIds.includes(p.id) && (travelStart ? p._available : true)
    );

    // Also provide unavailable alternatives that AI mentioned
    const unavailableProducts = products.filter(p =>
      recommendedProductIds.includes(p.id) && travelStart && !p._available
    );

    console.log(`[AI] Generate via ${via} | dates: ${travelStart ?? 'none'} | ${recommendedProducts.length} available, ${unavailableProducts.length} unavailable`);

    return res.json({
      error: false,
      data:  {
        itinerary,
        recommendedProducts,
        unavailableProducts,    // frontend bisa tampilkan sebagai "cek tanggal lain"
        rawForHistory: itinerary,
        travelDates: travelStart ? { start: travelStart, end: travelEnd ?? travelStart } : null,
      },
    });
  } catch (err) {
    console.error('[AI] generateTripPlan error FULL:', err);
    return res.status(500).json({ error: true, message: 'Gagal menghasilkan itinerary. Coba lagi.' });
  }
};

// ── Controller: Refine ────────────────────────────────────────────────────────

exports.refineTripPlan = async (req, res) => {
  const { messages, travelStart, travelEnd } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: true, message: 'messages wajib diisi.' });
  }
  if (!GROQ_KEY && !GEMINI_KEY) {
    return res.status(503).json({ error: true, message: 'AI service belum dikonfigurasi.' });
  }

  try {
    const userId = req.session?.user?.id ?? null;
    const { products, userProfile } = await fetchProducts(travelStart, travelEnd, userId);

    const fullMessages = [
      { role: 'system', content: buildSystemPrompt(products, travelStart, travelEnd, userProfile) },
      ...messages,
    ];

    const { text, via } = await callAI(fullMessages);
    const { itinerary, recommendedProductIds } = parseResponse(text);

    const recommendedProducts = products.filter(p =>
      recommendedProductIds.includes(p.id) && (travelStart ? p._available : true)
    );
    const unavailableProducts = products.filter(p =>
      recommendedProductIds.includes(p.id) && travelStart && !p._available
    );

    console.log(`[AI] Refine via ${via} | ${messages.length} messages | dates: ${travelStart ?? 'none'}`);

    return res.json({
      error: false,
      data:  {
        itinerary,
        recommendedProducts,
        unavailableProducts,
        rawForHistory: itinerary,
        travelDates: travelStart ? { start: travelStart, end: travelEnd ?? travelStart } : null,
      },
    });
  } catch (err) {
    console.error('[AI] refineTripPlan error:', err.message);
    return res.status(500).json({ error: true, message: 'Gagal merevisi itinerary. Coba lagi.' });
  }

  async function fetchWeather(travelStart, travelEnd, userStory) {
    if (!travelStart) return null;
  
    // City → koordinat (lat, lon)
    const CITY_COORDS = {
      'bali':        [-8.4095, 115.1889],
      'ubud':        [-8.5069, 115.2625],
      'seminyak':    [-8.6924, 115.1673],
      'lombok':      [-8.6529, 116.3240],
      'gili':        [-8.3500, 116.0500],
      'sumbawa':     [-8.6574, 117.4112],
      'flores':      [-8.6574, 121.0794],
      'ntt':         [-9.0,    120.5],
      'labuan bajo': [-8.4888, 119.8835],
      'komodo':      [-8.5500, 119.4800],
      'ende':        [-8.8432, 121.6625],
      'maumere':     [-8.6228, 122.2124],
      'raja ampat':  [-0.2340, 130.5254],
      'papua':       [-4.0,    136.0],
      'manado':      [ 1.4748, 124.8421],
      'sulawesi':    [-2.0,    120.0],
      'makassar':    [-5.1477, 119.4327],
      'toraja':      [-3.0,    120.0],
      'jakarta':     [-6.2088, 106.8456],
      'bandung':     [-6.9175, 107.6191],
      'yogyakarta':  [-7.7956, 110.3695],
      'solo':        [-7.5755, 110.8243],
      'malang':      [-7.9666, 112.6326],
      'surabaya':    [-7.2575, 112.7521],
      'kalimantan':  [ 0.0,    114.0],
      'sumatra':     [ 0.0,    102.0],
      'medan':       [ 3.5952,  98.6722],
    };
  
    const story = (userStory ?? '').toLowerCase();
    let lat = -8.4095, lon = 115.1889; // default: Bali
  
    for (const [city, coords] of Object.entries(CITY_COORDS)) {
      if (story.includes(city)) { [lat, lon] = coords; break; }
    }
  
    try {
      const endDate = travelEnd || travelStart;
      const url =
        `https://api.open-meteo.com/v1/forecast` +
        `?latitude=${lat}&longitude=${lon}` +
        `&daily=weathercode,precipitation_sum,temperature_2m_max` +
        `&timezone=Asia%2FJakarta` +
        `&start_date=${travelStart}&end_date=${endDate}`;
  
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.daily?.weathercode?.length) return null;
  
      const wmoDesc = c => {
        if (c <= 1)  return 'cerah';
        if (c <= 3)  return 'berawan';
        if (c <= 48) return 'berkabut';
        if (c <= 57) return 'gerimis';
        if (c <= 67) return 'hujan';
        if (c <= 82) return 'hujan lebat';
        return 'badai';
      };
  
      const days = data.daily.time.map((date, i) => ({
        date,
        weather: wmoDesc(data.daily.weathercode[i]),
        rain:    Math.round(data.daily.precipitation_sum?.[i] ?? 0),
        maxTemp: Math.round(data.daily.temperature_2m_max?.[i] ?? 30),
      }));
  
      const rainyDays = days.filter(d => d.rain > 5).length;
      const summary   = days
        .map(d => `${d.date}: ${d.weather} ${d.maxTemp}°C${d.rain > 5 ? ` (hujan ${d.rain}mm)` : ''}`)
        .join(' | ');
  
      console.log(`[AI] Weather fetched: ${rainyDays}/${days.length} hari hujan`);
      return { summary, rainyDays, totalDays: days.length };
    } catch (err) {
      console.warn('[AI] Weather fetch skipped:', err.message);
      return null;
    }
  }
  
  // ── B. Agent Analytics — catat impressi produk ───────────────────────────────
  
  async function recordImpressions(productIds, userId, querySnippet) {
    if (!productIds?.length) return;
    try {
      for (const pid of productIds) {
        await db.execute(
          `INSERT INTO ai_impressions (product_id, user_id, query_snippet)
          VALUES (?, ?, ?)`,
          [pid, userId ?? null, (querySnippet ?? '').substring(0, 150)]
        );
      }
      console.log(`[AI] Recorded ${productIds.length} impressions`);
    } catch (err) {
      console.warn('[AI] recordImpressions skipped:', err.message);
    }
  }
};