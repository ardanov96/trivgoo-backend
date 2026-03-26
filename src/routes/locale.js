const express = require('express');
const router  = express.Router();
const geoip   = require('geoip-lite');

const COUNTRY_LANG = {
  ID: 'id',
  CN: 'zh', TW: 'zh', HK: 'zh', MO: 'zh',
  GB: 'en', US: 'en', AU: 'en', CA: 'en', NZ: 'en', SG: 'en',
  SA: 'ar', AE: 'ar', EG: 'ar', QA: 'ar', KW: 'ar', BH: 'ar', OM: 'ar', JO: 'ar',
};

router.get('/locale/detect', (req, res) => {
  const ip =
    req.headers['cf-connecting-ip'] ||
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    '127.0.0.1';

  // Saat development, IP lokal (::1 / 127.0.0.1) tidak bisa di-lookup
  // fallback ke 'id' untuk development
  const geo     = geoip.lookup(ip);
  const country = geo?.country ?? 'ID';
  const lang    = COUNTRY_LANG[country] ?? 'id';

  console.log(`[LOCALE] IP: ${ip} → Country: ${country} → Lang: ${lang}`);

  res.json({ lang, country, redirect: `/${lang}` });
});

module.exports = router;