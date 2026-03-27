// api-trivgoo/src/routes/locale.js
// Geo-IP detection endpoint
// GET /api/v1/locale/detect → { country: 'JP', lang: 'ja' }
const express = require('express');
const router  = express.Router();

// Map country code → language code (sama dengan frontend)
const COUNTRY_LANG = {
  // Indonesian
  ID: 'id',
  // Chinese
  CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh', SG: 'zh',
  // English
  GB: 'en', US: 'en', AU: 'en', CA: 'en', NZ: 'en', IE: 'en', ZA: 'en',
  // Arabic
  SA: 'ar', AE: 'ar', EG: 'ar', QA: 'ar', KW: 'ar', BH: 'ar',
  OM: 'ar', JO: 'ar', LB: 'ar', IQ: 'ar', SY: 'ar', LY: 'ar',
  TN: 'ar', MA: 'ar', DZ: 'ar', YE: 'ar', SD: 'ar',
  // Malay
  MY: 'ms', BN: 'ms',
  // French
  FR: 'fr', BE: 'fr', CH: 'fr', LU: 'fr', MC: 'fr',
  // German
  DE: 'de', AT: 'de', LI: 'de',
  // Japanese — kode negara JP → bahasa ja
  JP: 'ja',
  // Korean — kode negara KR → bahasa ko
  KR: 'ko',
};

/**
 * GET /api/v1/locale/detect
 * Deteksi bahasa berdasarkan IP address user.
 *
 * Strategi (berurutan):
 * 1. Header CF-IPCountry dari Cloudflare (jika pakai CF)
 * 2. Header X-Country-Code dari reverse proxy / load balancer
 * 3. Fetch dari ip-api.com menggunakan IP user
 * 4. Fallback ke 'id'
 */
router.get('/detect', async (req, res) => {
  try {
    // ── Strategi 1: Cloudflare header (gratis, paling akurat jika pakai CF) ──
    const cfCountry = req.headers['cf-ipcountry'];
    if (cfCountry && cfCountry !== 'XX' && cfCountry !== 'T1') {
      const country = String(cfCountry).toUpperCase();
      const lang    = COUNTRY_LANG[country] ?? 'id';
      return res.json({ country, lang, source: 'cloudflare' });
    }

    // ── Strategi 2: Custom header dari proxy ──────────────────────────────
    const proxyCountry = req.headers['x-country-code'];
    if (proxyCountry) {
      const country = String(proxyCountry).toUpperCase();
      const lang    = COUNTRY_LANG[country] ?? 'id';
      return res.json({ country, lang, source: 'proxy' });
    }

    // ── Strategi 3: ip-api.com (free tier: 1000 req/bulan untuk produksi) ─
    // Ambil IP yang sebenarnya (support proxy/load balancer)
    const ip =
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.headers['x-real-ip'] ||
      req.socket.remoteAddress ||
      '';

    // Skip untuk localhost / private IP
    const isPrivate = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1)/.test(ip);
    if (isPrivate) {
      return res.json({ country: 'ID', lang: 'id', source: 'fallback_local' });
    }

    // Fetch geo dari ip-api.com (free, no key needed)
    const geoRes  = await fetch(`http://ip-api.com/json/${ip}?fields=countryCode`);
    const geoData = await geoRes.json();

    if (geoData.countryCode) {
      const country = String(geoData.countryCode).toUpperCase();
      const lang    = COUNTRY_LANG[country] ?? 'id';
      return res.json({ country, lang, source: 'ip-api' });
    }

    // ── Fallback ─────────────────────────────────────────────────────────
    return res.json({ country: 'ID', lang: 'id', source: 'fallback' });

  } catch (err) {
    console.error('[locale/detect] error:', err);
    return res.json({ country: 'ID', lang: 'id', source: 'error' });
  }
});

module.exports = router;
