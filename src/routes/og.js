// src/routes/og.js
// GET /api/v1/og/:productId
// Returns HTML with Open Graph meta tags for social media preview
// WhatsApp/Facebook crawler hits this URL and reads og:image, og:title, og:description

const express = require('express');
const router  = express.Router();
const db      = require('../configs/db');

const BASE_URL     = (process.env.BASE_URL || 'https://trivgoo.com').replace(/\/+$/, '');
const FRONTEND_URL = (process.env.FRONTEND_URL || 'https://trivgoo.com').replace(/\/+$/, '');
const FALLBACK_IMG = 'https://images.unsplash.com/photo-1500835556837-99ac94a94552?auto=format&fit=crop&w=1200&q=80';

function resolveImageUrl(imagePath) {
  if (!imagePath) return FALLBACK_IMG;
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    // Fix localhost URLs
    return imagePath.replace(/https?:\/\/localhost:\d+\/?/g, `${BASE_URL}/`);
  }
  // Relative path → absolute
  const clean = imagePath.replace(/^\/+/, '');
  return `${BASE_URL}/${clean}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

router.get('/:productId', async (req, res) => {
  try {
    const productId = parseInt(req.params.productId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return res.redirect(302, FRONTEND_URL);
    }

    // Fetch product from DB
    const [rows] = await db.query(
      `SELECT
         p.id,
         p.name,
         p.description,
         p.image_url,
         p.location,
         p.price,
         p.currency,
         p.hash_id,
         p.seo_title,
         p.seo_description,
         p.seo_og_image,
         c.name AS category_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.id = ? AND p.is_active = 1
       LIMIT 1`,
      [productId]
    );

    if (!rows[0]) {
      return res.redirect(302, FRONTEND_URL);
    }

    const product = rows[0];

    // Build URLs
    const hashId      = product.hash_id || product.id;
    const productUrl  = `${FRONTEND_URL}/id/product/${hashId}`;
    const imageUrl    = resolveImageUrl(product.seo_og_image || product.image_url);
    const title       = escapeHtml(product.seo_title || product.name);
    const description = escapeHtml(
      product.seo_description ||
      (product.description ? product.description.substring(0, 200) : '') ||
      `Book ${product.name} on Trivgoo`
    );
    const siteName    = 'Trivgoo';
    const price       = product.price
      ? `${product.currency || 'IDR'} ${Number(product.price).toLocaleString('id-ID')}`
      : '';

    // Return HTML with OG meta tags + immediate JS redirect to actual product page
    const html = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Primary Meta -->
  <title>${title} | ${siteName}</title>
  <meta name="description" content="${description}" />

  <!-- Open Graph / Facebook / WhatsApp -->
  <meta property="og:type"        content="website" />
  <meta property="og:url"         content="${escapeHtml(productUrl)}" />
  <meta property="og:title"       content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image"       content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:width"  content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:site_name"   content="${siteName}" />
  ${price ? `<meta property="og:price:amount"   content="${escapeHtml(price)}" />` : ''}
  ${product.location ? `<meta property="og:locality" content="${escapeHtml(product.location)}" />` : ''}

  <!-- Twitter Card -->
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:title"       content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image"       content="${escapeHtml(imageUrl)}" />

  <!-- WhatsApp specific -->
  <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />

  <!-- Canonical -->
  <link rel="canonical" href="${escapeHtml(productUrl)}" />

  <!-- Redirect to actual product page immediately -->
  <meta http-equiv="refresh" content="0;url=${escapeHtml(productUrl)}" />
</head>
<body>
  <p>Redirecting to <a href="${escapeHtml(productUrl)}">${title}</a>...</p>
  <script>window.location.replace("${escapeHtml(productUrl)}");</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Cache 1 jam agar crawler tidak hit DB terus
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(html);

  } catch (err) {
    console.error('[og] error:', err);
    return res.redirect(302, FRONTEND_URL);
  }
});

module.exports = router;
