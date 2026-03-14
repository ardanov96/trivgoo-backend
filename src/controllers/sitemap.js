const Hashids = require('hashids/cjs');
const productModel = require('../models/product');

const SALT = process.env.VITE_HASHIDS_SALT || 'TrivgooSuperSecretSalt2026';
const MIN_LENGTH = 6;
const hashids = new Hashids(SALT, MIN_LENGTH);

const encodeId = (id) => {
  const numericId = parseInt(id, 10);
  if (isNaN(numericId)) return '';
  return hashids.encode(numericId);
};

const generateSlug = (text) => {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
};

const sitemapController = async (req, res) => {
  try {
    const products = await productModel.list_all_products();
    const baseUrl = 'https://trivgoo.com'; // Hardcoded production frontend URL

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Static pages
    const staticPages = [
      '',
      '/explore',
      '/about'
    ];

    staticPages.forEach(path => {
      xml += `  <url>\n`;
      xml += `    <loc>${baseUrl}${path}</loc>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>${path === '' ? '1.0' : '0.8'}</priority>\n`;
      xml += `  </url>\n`;
    });

    // Dynamic products
    if (products && Array.isArray(products)) {
        products.forEach(product => {
          if(!product.id || !product.name) return;
            
          const hash = encodeId(product.id);
          const slug = generateSlug(product.name);
          
          xml += `  <url>\n`;
          xml += `    <loc>${baseUrl}/product/${hash}/${slug}</loc>\n`;
          let lastMod = new Date();
          if (product.updated_at || product.created_at) {
              lastMod = new Date(product.updated_at || product.created_at);
          }
          const dateStr = !isNaN(lastMod.getTime()) ? lastMod.toISOString() : new Date().toISOString();
          xml += `    <lastmod>${dateStr}</lastmod>\n`;
          xml += `    <changefreq>weekly</changefreq>\n`;
          xml += `    <priority>0.9</priority>\n`;
          xml += `  </url>\n`;
        });
    }

    xml += `</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (error) {
    console.error('Error generating sitemap:', error);
    res.status(500).send('Error generating sitemap');
  }
};

module.exports = sitemapController;
