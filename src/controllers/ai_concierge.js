const db       = require('../configs/db');
const GROQ_KEY  = process.env.GROQ_API_KEY  ?? '';
const GEMINI_KEY = process.env.GEMINI_API_KEY ?? '';
const PROVIDER   = process.env.AI_PROVIDER   ?? 'groq';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function callGroq(messages) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
    body:    JSON.stringify({
      model:       'llama-3.3-70b-versatile',
      messages,
      temperature: 0.6,
      max_tokens:  1024,
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
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

async function callAI(messages) {
  const hasGroq = !!GROQ_KEY, hasGemini = !!GEMINI_KEY;
  if (PROVIDER === 'groq' && hasGroq) {
    try { return await callGroq(messages); }
    catch (e) {
      if (hasGemini) {
        if (e.message.includes('429')) await sleep(3000);
        try { return await callGemini(messages); }
        catch (e2) {
          if (e2.message.includes('429')) { await sleep(10000); return await callGroq(messages); }
          throw e2;
        }
      }
      throw e;
    }
  }
  if (hasGemini) {
    try { return await callGemini(messages); }
    catch (e) {
      if (hasGroq) { if (e.message.includes('429')) await sleep(3000); return await callGroq(messages); }
      throw e;
    }
  }
  throw new Error('No AI provider configured');
}

// ── Fetch booking context ─────────────────────────────────────────────────────

async function getBookingContext(bookingId, userId) {
  // Ambil detail booking milik user
  const [[booking]] = await db.execute(
    `SELECT
       b.id, b.date, b.vehicle_type, b.total_price, b.payment_status,
       b.product_name, b.created_at,
       p.name          AS product_full_name,
       p.description   AS product_description,
       p.location      AS product_location,
       p.category_id,
       p.lat, p.lng
     FROM   bookings b
     LEFT   JOIN products p ON p.id = b.product_id
     WHERE  b.id = ? AND b.user_id = ?`,
    [bookingId, userId]
  );

  if (!booking) return null;

  // Ambil local knowledge relevan berdasarkan lokasi produk
  let knowledge = [];
  if (booking.product_location) {
    const city = booking.product_location.split(',')[0].trim().toLowerCase();
    const currentMonth = new Date().getMonth() + 1;
    const [kbRows] = await db.execute(
      `SELECT tip_type, title, content
       FROM   knowledge_base
       WHERE  is_approved = 1
         AND  is_active   = 1
         AND  LOWER(location) LIKE ?
         AND  (valid_months IS NULL OR FIND_IN_SET(?, valid_months) > 0)
       LIMIT  5`,
      [`%${city}%`, String(currentMonth)]
    );
    knowledge = kbRows;
  }

  return { booking, knowledge };
}

// ── System prompt builder ─────────────────────────────────────────────────────

function buildConciergePrompt(booking, knowledge) {
  const catLabel = booking.category_id === 1 || booking.category_id === 3 ? 'Paket Tour'
                 : booking.category_id === 2 ? 'Akomodasi / Hotel'
                 : 'Transport / Rental';

  const bookingCtx = `
BOOKING USER:
- Nama produk: ${booking.product_full_name || booking.product_name}
- Tipe: ${catLabel}
- Lokasi: ${booking.product_location || 'tidak diketahui'}
- Tanggal: ${booking.date}
- Status pembayaran: ${booking.payment_status}
- Total: Rp ${Number(booking.total_price || 0).toLocaleString('id-ID')}
${booking.product_description ? `- Deskripsi singkat: ${booking.product_description.substring(0, 200)}` : ''}`;

  const knowledgeCtx = knowledge.length
    ? `\nLOCAL INSIDER TIPS untuk ${booking.product_location?.split(',')[0] ?? 'destinasi ini'}:
${knowledge.map(k => `- [${k.tip_type}] ${k.title}: ${k.content}`).join('\n')}`
    : '';

  return `Kamu adalah Trivgoo Concierge — asisten perjalanan personal yang membantu traveler setelah booking.

${bookingCtx}${knowledgeCtx}

CARA MENJAWAB:
1. Gunakan konteks booking di atas untuk menjawab pertanyaan spesifik (lokasi, tanggal, tips persiapan).
2. Berikan rekomendasi praktis: restoran terdekat, tips packing, hal yang perlu dibawa, transportasi lokal.
3. Jika ditanya soal "guide" atau "driver", arahkan untuk hubungi agen melalui fitur chat/whatsapp di halaman booking.
4. Jawab dalam Bahasa Indonesia yang ramah dan singkat. Maksimal 3-4 paragraf.
5. Jika ada local tips relevan di atas, sertakan secara natural dalam jawaban.
6. Jangan menyebutkan nama AI model atau Groq/Gemini.`;
}

// ── Controller: Chat ──────────────────────────────────────────────────────────

exports.conciergeChat = async (req, res) => {
  const { bookingId, messages } = req.body;
  const userId = req.session?.user?.id ?? null;

  if (!userId)
    return res.status(401).json({ error: true, message: 'Login diperlukan.' });
  if (!bookingId || !Array.isArray(messages) || !messages.length)
    return res.status(400).json({ error: true, message: 'bookingId dan messages wajib diisi.' });
  if (!GROQ_KEY && !GEMINI_KEY)
    return res.status(503).json({ error: true, message: 'AI service belum dikonfigurasi.' });

  try {
    const ctx = await getBookingContext(bookingId, userId);
    if (!ctx)
      return res.status(404).json({ error: true, message: 'Booking tidak ditemukan.' });

    const { booking, knowledge } = ctx;

    const fullMessages = [
      { role: 'system', content: buildConciergePrompt(booking, knowledge) },
      ...messages.slice(-6), // Maksimal 6 pesan terakhir untuk hemat token
    ];

    const reply = await callAI(fullMessages);

    console.log(`[Concierge] booking ${bookingId} | user ${userId} | ${messages.length} msgs`);

    return res.json({ error: false, data: { reply } });

  } catch (err) {
    console.error('[Concierge] error:', err.message);
    const isRateLimit = err.message?.includes('429');
    return res.status(isRateLimit ? 429 : 500).json({
      error:   true,
      code:    isRateLimit ? 'RATE_LIMIT' : 'AI_ERROR',
      message: isRateLimit
        ? 'AI sedang sibuk. Tunggu sebentar lalu coba lagi.'
        : 'Gagal memproses pertanyaan. Coba lagi.',
    });
  }
};

// ── Controller: Get booking context (untuk prefill UI) ───────────────────────

exports.getConciergeContext = async (req, res) => {
  const { bookingId } = req.params;
  const userId = req.session?.user?.id ?? null;

  if (!userId)
    return res.status(401).json({ error: true, message: 'Login diperlukan.' });

  try {
    const ctx = await getBookingContext(bookingId, userId);
    if (!ctx)
      return res.status(404).json({ error: true, message: 'Booking tidak ditemukan.' });

    const { booking } = ctx;
    return res.json({
      error: false,
      data: {
        productName: booking.product_full_name || booking.product_name,
        location:    booking.product_location,
        date:        booking.date,
        categoryId:  booking.category_id,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: true, message: 'Gagal mengambil konteks.' });
  }
};