const db = require('../configs/db');

const GROQ_KEY   = process.env.GROQ_API_KEY  ?? '';
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? '';
const PROVIDER   = process.env.AI_PROVIDER   ?? 'groq';

// ── Prompt Builders ───────────────────────────────────────────────────────────

function buildSystemPrompt(products) {
  const ctx = products.map(p => ({
    id:          p.id,
    name:        p.name,
    description: p.description?.substring(0, 200) ?? '',
    price:       p.price,
    currency:    p.currency ?? 'IDR',
    location:    p.location,
    rating:      p.rating,
    category:    p.category_id === 1 ? 'Tour'
               : p.category_id === 2 ? 'Stay'
               : 'Transport',
  }));

  return `You are an expert travel consultant for Trivgoo, a travel platform for Indonesia & Asia.

AVAILABLE TRIVGOO SERVICES (JSON):
${JSON.stringify(ctx)}

RULES:
1. Create detailed day-by-day itineraries in Markdown with ### Day N: Title headings.
2. Recommend services from AVAILABLE TRIVGOO SERVICES that fit the user's needs.
3. When refining, preserve what the user liked and only change what was requested.
4. At the very end of EVERY response, output ONLY a JSON array of recommended product IDs.

FORMAT:
[Itinerary in Markdown with ### Day N: Title headings]

---
[[RECOMMENDED_IDS]]: [101, 102]`;
}

function buildInitialPrompt(userStory) {
  return `USER REQUEST: "${userStory}"

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
  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] };
  }

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

async function callAI(messages) {
  const hasGroq   = !!GROQ_KEY;
  const hasGemini = !!GEMINI_KEY;

  if (PROVIDER === 'groq' && hasGroq) {
    try   { return { text: await callGroq(messages),   via: 'groq' }; }
    catch (e) {
      console.warn('[AI] Groq failed, fallback Gemini:', e.message);
      if (hasGemini) return { text: await callGemini(messages), via: 'gemini-fallback' };
      throw e;
    }
  }
  if (hasGemini) {
    try   { return { text: await callGemini(messages), via: 'gemini' }; }
    catch (e) {
      console.warn('[AI] Gemini failed, fallback Groq:', e.message);
      if (hasGroq) return { text: await callGroq(messages), via: 'groq-fallback' };
      throw e;
    }
  }
  throw new Error('No AI provider configured');
}

// ── Shared: fetch active products ─────────────────────────────────────────────

async function fetchProducts() {
  const [rows] = await db.execute(`
    SELECT id, name, description, price, currency, location, rating, category_id,
           image_url AS image
    FROM   products
    WHERE  is_active = 1
    ORDER  BY rating DESC
    LIMIT  60
  `);
  return rows;
}

// ── Controller: Generate (initial single-turn) ────────────────────────────────

exports.generateTripPlan = async (req, res) => {
  const { userStory } = req.body;

  if (!userStory?.trim()) {
    return res.status(400).json({ error: true, message: 'userStory wajib diisi.' });
  }
  if (!GROQ_KEY && !GEMINI_KEY) {
    return res.status(503).json({ error: true, message: 'AI service belum dikonfigurasi.' });
  }

  try {
    const products = await fetchProducts();
    const messages = [
      { role: 'system', content: buildSystemPrompt(products) },
      { role: 'user',   content: buildInitialPrompt(userStory) },
    ];

    const { text, via } = await callAI(messages);
    const { itinerary, recommendedProductIds } = parseResponse(text);
    const recommendedProducts = products.filter(p => recommendedProductIds.includes(p.id));

    console.log(`[AI] Generate via ${via} — ${recommendedProducts.length} produk`);

    return res.json({
      error: false,
      data:  { itinerary, recommendedProducts, rawForHistory: itinerary },
    });
  } catch (err) {
    console.error('[AI] generateTripPlan error:', err.message);
    return res.status(500).json({ error: true, message: 'Gagal menghasilkan itinerary. Coba lagi.' });
  }
};

// ── Controller: Refine (multi-turn) ──────────────────────────────────────────

exports.refineTripPlan = async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: true, message: 'messages wajib diisi.' });
  }
  if (!GROQ_KEY && !GEMINI_KEY) {
    return res.status(503).json({ error: true, message: 'AI service belum dikonfigurasi.' });
  }

  try {
    const products = await fetchProducts();

    const fullMessages = [
      { role: 'system', content: buildSystemPrompt(products) },
      ...messages,
    ];

    const { text, via } = await callAI(fullMessages);
    const { itinerary, recommendedProductIds } = parseResponse(text);
    const recommendedProducts = products.filter(p => recommendedProductIds.includes(p.id));

    console.log(`[AI] Refine via ${via} — ${messages.length} messages, ${recommendedProducts.length} produk`);

    return res.json({
      error: false,
      data:  { itinerary, recommendedProducts, rawForHistory: itinerary },
    });
  } catch (err) {
    console.error('[AI] refineTripPlan error:', err.message);
    return res.status(500).json({ error: true, message: 'Gagal merevisi itinerary. Coba lagi.' });
  }
};
