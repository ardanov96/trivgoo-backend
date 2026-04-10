const db     = require('../configs/db');

const GROQ_KEY   = process.env.GROQ_API_KEY  ?? '';
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? '';
const PROVIDER   = process.env.AI_PROVIDER   ?? 'groq';

// ── Availability check ────────────────────────────────────────────────────────

async function getUnavailableProductIds(travelStart, travelEnd) {
  if (!travelStart) return new Set();
  const unavailable = new Set();
  const end = travelEnd || travelStart;
  try {
    const [rows] = await db.execute(
      `SELECT DISTINCT product_id
       FROM   bookings
       WHERE  payment_status IN ('PAID')
         AND  (
               (date >= ? AND date <= ?)
               OR
               (date LIKE '%-%-%' AND
                SUBSTRING_INDEX(TRIM(date), ' - ', 1) <= ? AND
                SUBSTRING_INDEX(TRIM(date), ' - ', -1) >= ?)
             )`,
      [travelStart, end, end, travelStart]
    );
    rows.forEach(r => unavailable.add(r.product_id));
  } catch (err) {
    console.warn('[AI] availability check skipped:', err.message);
  }
  return unavailable;
}

async function getScarcityMap(productIds, travelStart) {
  if (!travelStart || !productIds.length) return {};
 
  try {
    const placeholders = productIds.map(() => '?').join(',');
 
    // Hitung sisa slot = daily_capacity - jumlah booking confirmed di tanggal tersebut
    const [rows] = await db.execute(
      `SELECT
         p.id                                        AS product_id,
         COALESCE(p.daily_capacity, 0)               AS capacity,
         COUNT(CASE
           WHEN b.payment_status IN ('PAID')
             AND b.date = ?
           THEN 1 END)                               AS booked_count
       FROM   products p
       LEFT   JOIN bookings b ON b.product_id = p.id
       WHERE  p.id IN (${placeholders})
       GROUP  BY p.id`,
      [travelStart, ...productIds]
    );
 
    const map = {};
    rows.forEach(r => {
      const cap     = Number(r.capacity) || 0;
      const booked  = Number(r.booked_count) || 0;
      const remaining = cap > 0 ? Math.max(0, cap - booked) : null;
      // null = unlimited (capacity tidak diset), angka = sisa slot
      map[r.product_id] = {
        capacity:  cap,
        booked:    booked,
        remaining: remaining,
        // Kategorikan urgency
        urgency: remaining === null ? 'none'
               : remaining === 0   ? 'sold_out'
               : remaining <= 2    ? 'critical'   // merah: sisa 1-2
               : remaining <= 5    ? 'low'         // amber: sisa 3-5
               : 'available',                      // hijau / normal
      };
    });
 
    console.log(`[AI] Scarcity checked for ${rows.length} products`);
    return map;
  } catch (err) {
    console.warn('[AI] getScarcityMap skipped:', err.message);
    return {};
  }
}

async function fetchLocalKnowledge(userStory, travelStart) {
  try {
    const story = (userStory ?? '').toLowerCase();
 
    // Deteksi destinasi dari userStory
    const KNOWN_LOCATIONS = [
      'bali', 'ubud', 'seminyak', 'kuta', 'canggu', 'sanur', 'nusa dua',
      'lombok', 'gili', 'sumbawa',
      'labuan bajo', 'flores', 'komodo', 'ende', 'maumere',
      'raja ampat', 'papua', 'sorong',
      'manado', 'sulawesi', 'makassar', 'toraja',
      'jakarta', 'bandung', 'yogyakarta', 'solo', 'malang', 'surabaya',
      'sumba', 'ntt', 'kupang',
      'medan', 'kalimantan', 'balikpapan',
    ];
 
    // Cari semua lokasi yang disebut di userStory
    const mentionedLocations = KNOWN_LOCATIONS.filter(loc => story.includes(loc));
    if (!mentionedLocations.length) return null;
 
    // Ambil current month untuk filter valid_months
    const currentMonth = travelStart
      ? new Date(travelStart).getMonth() + 1
      : new Date().getMonth() + 1;
 
    // Build query — ambil tips relevan per lokasi
    const placeholders = mentionedLocations.map(() => '?').join(',');
    const [rows] = await db.execute(
      `SELECT location, tip_type, title, content, valid_months
       FROM   knowledge_base
       WHERE  is_approved = 1
         AND  is_active   = 1
         AND  LOWER(location) IN (${placeholders})
         AND  (
               valid_months IS NULL
               OR FIND_IN_SET(?, valid_months) > 0
             )
       ORDER  BY location, tip_type
       LIMIT  15`,
      [...mentionedLocations, String(currentMonth)]
    );
 
    if (!rows.length) return null;
 
    // Format menjadi konteks yang mudah dibaca AI
    const grouped = {};
    rows.forEach(r => {
      const loc = r.location;
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(`[${r.tip_type.toUpperCase()}] ${r.title}: ${r.content}`);
    });
 
    const formatted = Object.entries(grouped)
      .map(([loc, tips]) => `${loc.toUpperCase()}:\n${tips.map(t => `- ${t}`).join('\n')}`)
      .join('\n\n');
 
    console.log(`[AI] Local knowledge: ${rows.length} tips untuk ${mentionedLocations.join(', ')}`);
    return { tips: formatted, locations: mentionedLocations, count: rows.length };
 
  } catch (err) {
    console.warn('[AI] fetchLocalKnowledge skipped:', err.message);
    return null;
  }
}

// ── User profile personalization ──────────────────────────────────────────────

async function getUserProfile(userId) {
  if (!userId) return null;
  try {
    const [rows] = await db.execute(
      `SELECT b.product_name, b.total_price, b.vehicle_type,
              p.location, p.category_id, p.rating
       FROM   bookings b
       LEFT   JOIN products p ON p.id = b.product_id
       WHERE  b.user_id = ?
         AND  b.payment_status IN ('PAID')
       ORDER  BY b.created_at DESC
       LIMIT  8`,
      [userId]
    );
    if (!rows.length) return null;

    const catCount = { Tour: 0, Stay: 0, Transport: 0 };
    rows.forEach(r => {
      if (r.category_id === 1 || r.vehicle_type === 'tour')      catCount.Tour++;
      else if (r.category_id === 2 || r.vehicle_type === 'stay') catCount.Stay++;
      else                                                        catCount.Transport++;
    });
    const favCategory    = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0][0];
    const locations      = [...new Set(rows.map(r => r.location?.split(',')[0]?.trim()).filter(Boolean))].slice(0, 5);
    const avgPrice       = Math.round(rows.reduce((s, r) => s + parseFloat(r.total_price || 0), 0) / rows.length);
    const recentProducts = rows.slice(0, 3).map(r => r.product_name).filter(Boolean);

    return { favCategory, locations, avgPrice, recentProducts, totalBookings: rows.length };
  } catch (err) {
    console.warn('[AI] getUserProfile skipped:', err.message);
    return null;
  }
}

// ── Blocked dates check ───────────────────────────────────────────────────────

function isProductBlocked(blockedDatesRaw, travelStart, travelEnd) {
  if (!travelStart || !blockedDatesRaw) return false;
  try {
    const dates = typeof blockedDatesRaw === 'string'
      ? blockedDatesRaw.split(',').map(d => d.trim()).filter(Boolean)
      : [];
    if (!dates.length) return false;
    const start = new Date(travelStart);
    const end   = travelEnd ? new Date(travelEnd) : start;
    return dates.some(d => { const bd = new Date(d); return bd >= start && bd <= end; });
  } catch { return false; }
}

// ── Weather-aware planning (Open-Meteo, free, no key needed) ─────────────────

async function fetchWeather(travelStart, travelEnd, userStory) {
  if (!travelStart) return null;

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
  let lat = -8.4095, lon = 115.1889;
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

    console.log(`[AI] Weather: ${rainyDays}/${days.length} hari hujan`);
    return { summary, rainyDays, totalDays: days.length };
  } catch (err) {
    console.warn('[AI] Weather fetch skipped:', err.message);
    return null;
  }
}

// ── Dynamic pricing hints ─────────────────────────────────────────────────────

async function fetchSeasonalPricing(userStory) {
  try {
    const [rows] = await db.execute(
      `SELECT MONTH(date) AS month, COUNT(*) AS booking_count, AVG(total_price) AS avg_price
       FROM   bookings b
       JOIN   products p ON p.id = b.product_id
       WHERE  b.payment_status IN ('PAID')
         AND  b.date >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
       GROUP  BY MONTH(date)
       ORDER  BY month`
    );
    if (!rows.length) return null;

    const MONTHS = ['','Januari','Februari','Maret','April','Mei','Juni',
                    'Juli','Agustus','September','Oktober','November','Desember'];

    const sorted     = [...rows].sort((a, b) => a.avg_price - b.avg_price);
    const cheapest   = sorted.slice(0, 2).map(r => MONTHS[r.month]);
    const priciest   = sorted.slice(-2).map(r => MONTHS[r.month]);
    const avgCount   = rows.reduce((s, r) => s + Number(r.booking_count), 0) / rows.length;
    const highSeason = rows.filter(r => Number(r.booking_count) > avgCount * 1.3).map(r => MONTHS[r.month]);
    const lowSeason  = rows.filter(r => Number(r.booking_count) < avgCount * 0.7).map(r => MONTHS[r.month]);

    const story          = (userStory ?? '').toLowerCase();
    const mentionedMonth = MONTHS.slice(1).find(m => story.includes(m.toLowerCase()));
    const currentMonth   = new Date().getMonth() + 1;
    const targetMonth    = mentionedMonth ? MONTHS.indexOf(mentionedMonth) : currentMonth;
    const targetRow      = rows.find(r => Number(r.month) === targetMonth);
    const baseAvg        = rows.reduce((s, r) => s + Number(r.avg_price), 0) / rows.length;
    const targetAvg      = targetRow ? Number(targetRow.avg_price) : baseAvg;
    const pctVsAvg       = Math.round(((targetAvg - baseAvg) / baseAvg) * 100);

    let targetHint = '';
    if (mentionedMonth) {
      if (pctVsAvg > 15)       targetHint = `PERINGATAN: ${mentionedMonth} adalah high season (+${pctVsAvg}% vs rata-rata). Sarankan tambah budget atau booking jauh-jauh hari.`;
      else if (pctVsAvg < -15) targetHint = `INFO: ${mentionedMonth} adalah low season (${pctVsAvg}% vs rata-rata). Waktu terbaik untuk hemat!`;
      else                     targetHint = `INFO: ${mentionedMonth} termasuk periode harga normal.`;
    }

    console.log(`[AI] Seasonal: cheapest=${cheapest.join(',')}, high=${highSeason.join(',') || 'none'}`);
    return { cheapestMonths: cheapest, priciestMonths: priciest, highSeason, lowSeason, targetHint };
  } catch (err) {
    console.warn('[AI] fetchSeasonalPricing skipped:', err.message);
    return null;
  }
}

// ── Agent Analytics — record impressions ─────────────────────────────────────

async function recordImpressions(productIds, userId, querySnippet) {
  if (!productIds?.length) return;
  try {
    for (const pid of productIds) {
      await db.execute(
        `INSERT INTO ai_impressions (product_id, user_id, query_snippet) VALUES (?, ?, ?)`,
        [pid, userId ?? null, (querySnippet ?? '').substring(0, 150)]
      );
    }
    console.log(`[AI] Recorded ${productIds.length} impressions`);
  } catch (err) {
    console.warn('[AI] recordImpressions skipped:', err.message);
  }
}

// ── System Prompt Builder ─────────────────────────────────────────────────────

function buildSystemPrompt(products, travelStart, travelEnd, userProfile, weather, pricing, knowledge) {
  const ctx = products.map(p => {
    const base = {
      id:          p.id,
      name:        p.name,
      description: p.description?.substring(0, 100) ?? '',
      price:       p.price,
      currency:    p.currency ?? 'IDR',
      location:    p.location,
      rating:      p.rating,
      category:    p.category_id === 1 ? 'Tour' : p.category_id === 2 ? 'Stay' : 'Transport',
    };
    if (travelStart) {
      base.availability = p._available ? 'AVAILABLE' : 'FULLY_BOOKED';
      if (!p._available) base.availability_note = 'Already booked on requested dates — suggest as alternative or skip';
      if (p._scarcity) {
        const s = p._scarcity;
        if (s.urgency === 'sold_out') base.scarcity = 'SOLD OUT — jangan rekomendasikan';
        if (s.urgency === 'critical') base.scarcity = `HAMPIR PENUH — sisa ${s.remaining} slot! Tekankan urgensi booking.`;
        if (s.urgency === 'low')      base.scarcity = `Sisa ${s.remaining} slot — sebutkan saat relevan.`;
      }
    }
    return base;
  });
 
  const dateCtx = travelStart
    ? `\nTRAVEL DATES: ${travelStart}${travelEnd && travelEnd !== travelStart ? ` to ${travelEnd}` : ' (single day)'}`
    : '';
 
  const profileCtx = userProfile
    ? `\nUSER PROFILE (personalize based on this):
- Favorite category: ${userProfile.favCategory}
- Previously visited: ${userProfile.locations.join(', ') || 'none yet'}
- Average spend per booking: IDR ${userProfile.avgPrice.toLocaleString('id-ID')}
- Recent bookings: ${userProfile.recentProducts.join(', ') || 'none'}
- Total past bookings: ${userProfile.totalBookings}
- Instruction: Prioritize ${userProfile.favCategory} products. Suggest unexplored destinations if user visited before. Match budget to their usual spend range.`
    : '';
 
  const weatherCtx = weather
    ? `\nWEATHER FORECAST:\n${weather.summary}` +
      (weather.rainyDays > 0
        ? `\n⚠️ ${weather.rainyDays} hari hujan diprediksi — sarankan aktivitas indoor pada hari tersebut.`
        : '\n✅ Cuaca bagus, cocok untuk aktivitas outdoor.')
    : '';
 
  const pricingCtx = pricing
    ? `\nSEASONAL PRICING INSIGHTS (from real booking data):
- Cheapest months: ${pricing.cheapestMonths.join(', ') || '-'}
- Most expensive months: ${pricing.priciestMonths.join(', ') || '-'}${pricing.highSeason.length ? `\n- High season: ${pricing.highSeason.join(', ')}` : ''}${pricing.lowSeason.length ? `\n- Low season: ${pricing.lowSeason.join(', ')}` : ''}${pricing.targetHint ? `\n- ${pricing.targetHint}` : ''}
- Instruction: Naturally mention pricing context. If high season, suggest booking early or adjusting budget. If low season, highlight the savings.`
    : '';
 
  const knowledgeCtx = knowledge
    ? `\nLOCAL INSIDER KNOWLEDGE (dari agen lokal Trivgoo — sangat akurat, gunakan ini):
${knowledge.tips}
 
INSTRUCTION: Naturally weave these local insights into your itinerary. Mention warnings as 
"important notes", best times as planning advice, and hidden gems as "insider tips from local guides". 
This is exclusive Trivgoo knowledge not available on other platforms.`
    : '';
 
  const scarcityCtx = `
SCARCITY INSTRUCTION: If a product has scarcity data, naturally mention it in the itinerary.
Example: "Bali Temple Tour (only 2 spots left — recommend booking immediately)"`;
 
  const availRule = travelStart
    ? `\n5. AVAILABILITY: Products marked FULLY_BOOKED are unavailable on requested dates. Prefer AVAILABLE products. Mention FULLY_BOOKED ones only as "alternative if dates change".`
    : '';
 
  return `You are an expert travel consultant for Trivgoo, a travel platform for Indonesia & Asia.
${dateCtx}${profileCtx}${weatherCtx}${pricingCtx}${knowledgeCtx}
 
AVAILABLE TRIVGOO SERVICES (JSON):
${JSON.stringify(ctx)}
 
RULES:
1. Create detailed day-by-day itineraries in Markdown with ### Day N: Title headings.
2. Recommend services from AVAILABLE TRIVGOO SERVICES that fit the user's needs. For multi-day trips, try to include a mix of Tour (activities), Stay (accommodation), and Transport (rental/transfer) products where relevant.
3. When refining, preserve what the user liked and only change what was requested.
4. At the very end of EVERY response, you MUST output this exact line: [[RECOMMENDED_IDS]]: followed by a JSON array.${availRule}
 
FORMAT — follow EXACTLY, no deviation:
[Itinerary in Markdown with ### Day N: Title headings]
 
---
[[RECOMMENDED_IDS]]: [101, 102]
 
CRITICAL: The last line MUST start with [[RECOMMENDED_IDS]]: — never output just a plain array like [101, 102].`;
}

// ── Initial prompt ────────────────────────────────────────────────────────────

function buildInitialPrompt(userStory, travelStart, travelEnd) {
  const dateHint = travelStart
    ? ` (travel dates: ${travelStart}${travelEnd && travelEnd !== travelStart ? ` – ${travelEnd}` : ''})`
    : '';
  return `USER REQUEST: "${userStory}"${dateHint}\n\nPlease create a detailed travel itinerary based on this request, following the format rules above.`;
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

// ── AI Provider callers ───────────────────────────────────────────────────────

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
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));

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
        if (e.message.includes('429')) await sleep(3000);
        try { return { text: await callGemini(messages), via: 'gemini-fallback' }; }
        catch (e2) {
          if (e2.message.includes('429')) {
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

  if (hasGemini) {
    try { return { text: await callGemini(messages), via: 'gemini' }; }
    catch (e) {
      console.warn('[AI] Gemini failed, fallback Groq:', e.message);
      if (hasGroq) {
        if (e.message.includes('429')) await sleep(3000);
        return { text: await callGroq(messages), via: 'groq-fallback' };
      }
      throw e;
    }
  }

  throw new Error('No AI provider configured');
}

// ── Fetch products (UNION per kategori agar semua terwakili) ──────────────────

async function fetchProducts(travelStart, travelEnd, userId) {
  const [rows] = await db.execute(`
    SELECT * FROM (
      SELECT p.id, p.name, p.description, p.price, p.currency, p.location,
             p.rating, p.category_id, p.image_url AS image, p.lat, p.lng,
             GROUP_CONCAT(pbd.blocked_date ORDER BY pbd.blocked_date) AS blocked_dates_csv
      FROM   products p
      LEFT   JOIN product_blocked_dates pbd ON pbd.product_id = p.id
      WHERE  p.is_active = 1 AND p.category_id = 1
      GROUP  BY p.id ORDER BY p.rating DESC LIMIT 25
    ) AS tour_top

    UNION

    SELECT * FROM (
      SELECT p.id, p.name, p.description, p.price, p.currency, p.location,
             p.rating, p.category_id, p.image_url AS image, p.lat, p.lng,
             GROUP_CONCAT(pbd.blocked_date ORDER BY pbd.blocked_date) AS blocked_dates_csv
      FROM   products p
      LEFT   JOIN product_blocked_dates pbd ON pbd.product_id = p.id
      WHERE  p.is_active = 1 AND p.category_id = 2
      GROUP  BY p.id ORDER BY p.rating DESC LIMIT 4
    ) AS stay_top

    UNION

    SELECT * FROM (
      SELECT p.id, p.name, p.description, p.price, p.currency, p.location,
             p.rating, p.category_id, p.image_url AS image, p.lat, p.lng,
             GROUP_CONCAT(pbd.blocked_date ORDER BY pbd.blocked_date) AS blocked_dates_csv
      FROM   products p
      LEFT   JOIN product_blocked_dates pbd ON pbd.product_id = p.id
      WHERE  p.is_active = 1 AND p.category_id = 3
      GROUP  BY p.id ORDER BY p.rating DESC LIMIT 15
    ) AS transport_top

    UNION

    SELECT * FROM (
      SELECT p.id, p.name, p.description, p.price, p.currency, p.location,
             p.rating, p.category_id, p.image_url AS image, p.lat, p.lng,
             GROUP_CONCAT(pbd.blocked_date ORDER BY pbd.blocked_date) AS blocked_dates_csv
      FROM   products p
      LEFT   JOIN product_blocked_dates pbd ON pbd.product_id = p.id
      WHERE  p.is_active = 1
      GROUP  BY p.id ORDER BY p.created_at DESC LIMIT 10
    ) AS newest
  `);

  const unavailable = await getUnavailableProductIds(travelStart, travelEnd);
  const userProfile = await getUserProfile(userId);

  const productIds  = rows.map(r => r.id);
  const scarcityMap = await getScarcityMap(productIds, travelStart);

  return {
    products: rows.map(p => ({
      ...p,
      _available:  !unavailable.has(p.id) &&
                   !isProductBlocked(p.blocked_dates_csv, travelStart, travelEnd),
      _scarcity:   scarcityMap[p.id] ?? null,
    })),
    userProfile,
  };
}

// ── Response cache (in-memory, 5 menit) ──────────────────────────────────────

const responseCache = new Map();
const CACHE_TTL_MS  = 5 * 60 * 1000;

function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { responseCache.delete(key); return null; }
  return entry.data;
}

function setCache(key, data) {
  responseCache.set(key, { data, ts: Date.now() });
  if (responseCache.size > 50) {
    const oldest = [...responseCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0];
    responseCache.delete(oldest[0]);
  }
}

// ── Rate limit error helper ───────────────────────────────────────────────────

function rateLimitResponse(res, isRateLimit) {
  return res.status(isRateLimit ? 429 : 500).json({
    error:      true,
    code:       isRateLimit ? 'RATE_LIMIT' : 'AI_ERROR',
    message:    isRateLimit
      ? 'AI sedang sibuk karena banyak permintaan. Tunggu 1-2 menit lalu coba lagi.'
      : 'Gagal menghasilkan itinerary. Coba lagi.',
    retryAfter: isRateLimit ? 60 : null,
  });
}

// ── Controller: Generate ──────────────────────────────────────────────────────

exports.generateTripPlan = async (req, res) => {
  const { userStory, travelStart, travelEnd } = req.body;

  if (!userStory?.trim())
    return res.status(400).json({ error: true, message: 'userStory wajib diisi.' });
  if (!GROQ_KEY && !GEMINI_KEY)
    return res.status(503).json({ error: true, message: 'AI service belum dikonfigurasi.' });

  try {
    const userId   = req.session?.user?.id ?? null;
    const cacheKey = `${userStory.trim()}_${travelStart ?? ''}_${userId ?? 'anon'}`;
    const cached   = getCached(cacheKey);
    if (cached) {
      console.log('[AI] Cache hit:', cacheKey.substring(0, 50));
      return res.json({ error: false, data: cached });
    }

    const [{ products, userProfile }, weather, pricing, knowledge] = await Promise.all([
      fetchProducts(travelStart, travelEnd, userId),
      fetchWeather(travelStart, travelEnd, userStory),
      fetchSeasonalPricing(userStory),
      fetchLocalKnowledge(userStory, travelStart),
    ]);

    if (userProfile)
      console.log(`[AI] Personalized for user ${userId}: fav=${userProfile.favCategory}`);

    const messages = [
      { role: 'system', content: buildSystemPrompt(products, travelStart, travelEnd, userProfile, weather, pricing, knowledge) },
      { role: 'user',   content: buildInitialPrompt(userStory, travelStart, travelEnd) },
    ];

    const { text, via }                        = await callAI(messages);
    const { itinerary, recommendedProductIds } = parseResponse(text);

    const recommendedProducts = products
    .filter(p => recommendedProductIds.includes(p.id) && (travelStart ? p._available : true))
    .map(p => ({
      ...p,
      slotsRemaining:  p._scarcity?.remaining ?? null,
      scarcityUrgency: p._scarcity?.urgency   ?? 'none',
    }));

    const unavailableProducts = products.filter(p =>
      recommendedProductIds.includes(p.id) && travelStart && !p._available
    );

    recordImpressions(recommendedProductIds, userId, userStory).catch(() => {});
    console.log(`[AI] Generate via ${via} | ${recommendedProducts.length} available, ${unavailableProducts.length} unavailable`);

    const responseData = {
      itinerary,
      recommendedProducts,
      unavailableProducts,
      rawForHistory: itinerary.substring(0, 800) + (itinerary.length > 800 ? '\n[...itinerary continues...]' : ''),
      travelDates:   travelStart ? { start: travelStart, end: travelEnd ?? travelStart } : null,
    };

    setCache(cacheKey, responseData);
    return res.json({ error: false, data: responseData });

  } catch (err) {
    console.error('[AI] generateTripPlan error:', err.stack || err.message);
    return rateLimitResponse(res, err.message?.includes('429'));
  }
};

// ── Controller: Refine ────────────────────────────────────────────────────────

exports.refineTripPlan = async (req, res) => {
  const { messages, travelStart, travelEnd } = req.body;

  if (!Array.isArray(messages) || !messages.length)
    return res.status(400).json({ error: true, message: 'messages wajib diisi.' });
  if (!GROQ_KEY && !GEMINI_KEY)
    return res.status(503).json({ error: true, message: 'AI service belum dikonfigurasi.' });

  try {
    const userId       = req.session?.user?.id ?? null;
    const firstUserMsg = messages.find(m => m.role === 'user')?.content ?? '';

    const [{ products, userProfile }, weather, pricing, knowledge] = await Promise.all([
      fetchProducts(travelStart, travelEnd, userId),
      fetchWeather(travelStart, travelEnd, firstUserMsg),
      fetchSeasonalPricing(firstUserMsg),
      fetchLocalKnowledge(firstUserMsg, travelStart),
    ]);

    const fullMessages = [
      { role: 'system', content: buildSystemPrompt(products, travelStart, travelEnd, userProfile, weather, pricing) },
      ...messages,
    ];

    const { text, via }                        = await callAI(fullMessages);
    const { itinerary, recommendedProductIds } = parseResponse(text);

    const recommendedProducts = products.filter(p =>
      recommendedProductIds.includes(p.id) && (travelStart ? p._available : true)
    );
    const unavailableProducts = products.filter(p =>
      recommendedProductIds.includes(p.id) && travelStart && !p._available
    );

    recordImpressions(recommendedProductIds, userId, firstUserMsg).catch(() => {});
    console.log(`[AI] Refine via ${via} | ${messages.length} msgs`);

    return res.json({
      error: false,
      data:  {
        itinerary,
        recommendedProducts,
        unavailableProducts,
        rawForHistory: itinerary.substring(0, 800) + (itinerary.length > 800 ? '\n[...itinerary continues...]' : ''),
        travelDates:   travelStart ? { start: travelStart, end: travelEnd ?? travelStart } : null,
      },
    });

  } catch (err) {
    console.error('[AI] refineTripPlan error:', err.stack || err.message);
    return rateLimitResponse(res, err.message?.includes('429'));
  }
};