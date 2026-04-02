const Hashids = require('hashids');
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
  return text.toString().toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '').replace(/\-\-+/g, '-');
};

const baseUrl = 'https://trivgoo.com';
const SUPPORTED_LANGS = ['', '/en', '/zh', '/ja', '/ar'];

// Reusable function to generate url block with hreflang
const generateUrlBlock = (path, priority = '0.8', changefreq = 'daily', lastMod = null, imageMeta = null) => {
  let xml = '';
  SUPPORTED_LANGS.forEach(lang => {
    const fullPath = lang ? `${lang}${path}` : path;
    const loc = `${baseUrl}${fullPath}`;
    
    xml += `  <url>\n`;
    xml += `    <loc>${loc}</loc>\n`;
    if (lastMod) xml += `    <lastmod>${lastMod}</lastmod>\n`;
    xml += `    <changefreq>${changefreq}</changefreq>\n`;
    xml += `    <priority>${priority}</priority>\n`;
    
    // Hreflang alternates
    SUPPORTED_LANGS.forEach(altLang => {
      const altCode = altLang ? altLang.replace('/', '') : 'id';
      const altPath = altLang ? `${altLang}${path}` : path;
      xml += `    <xhtml:link rel="alternate" hreflang="${altCode}" href="${baseUrl}${altPath}" />\n`;
    });
    // Add x-default pointing to root (ID)
    xml += `    <xhtml:link rel="alternate" hreflang="x-default" href="${baseUrl}${path}" />\n`;

    // Image tags
    if (imageMeta && imageMeta.url) {
      xml += `    <image:image>\n`;
      xml += `      <image:loc><![CDATA[${imageMeta.url}]]></image:loc>\n`;
      if (imageMeta.title) xml += `      <image:title><![CDATA[${imageMeta.title}]]></image:title>\n`;
      if (imageMeta.caption) xml += `      <image:caption><![CDATA[${imageMeta.caption}]]></image:caption>\n`;
      xml += `    </image:image>\n`;
    }

    xml += `  </url>\n`;
  });
  return xml;
};

const sitemapIndex = (req, res) => {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
  xml += `  <sitemap>\n    <loc>${baseUrl}/sitemap-pages.xml</loc>\n  </sitemap>\n`;
  xml += `  <sitemap>\n    <loc>${baseUrl}/sitemap-products.xml</loc>\n  </sitemap>\n`;
  xml += `  <sitemap>\n    <loc>${baseUrl}/sitemap-blog.xml</loc>\n  </sitemap>\n`;
  xml += `</sitemapindex>`;
  
  res.header('Content-Type', 'application/xml');
  res.send(xml);
};

const sitemapPages = (req, res) => {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
  
  const staticPages = [
    '', '/explore', '/about-us', '/contact', '/career', 
    '/help-center', '/privacy-policy', '/terms', '/press', 
    '/trivpay', '/ai-trip-planner'
  ];

  staticPages.forEach(path => {
    const priority = path === '' ? '1.0' : '0.8';
    xml += generateUrlBlock(path, priority, 'daily');
  });

  xml += `</urlset>`;
  res.header('Content-Type', 'application/xml');
  res.send(xml);
};

const sitemapProducts = async (req, res) => {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;
  
  // Use today's date for fallback
  const fallbackDate = new Date().toISOString().split('T')[0];

  try {
    const products = await productModel.list_all_products();
    if (products && Array.isArray(products)) {
      products.forEach(product => {
        if(!product.id || !product.name) return;
        const hash = encodeId(product.id);
        const slug = product.seo_slug || generateSlug(product.name);
        const path = `/product/${hash}/${slug}`;
        
        let lastModDate = new Date();
        if (product.updated_at || product.created_at) {
          lastModDate = new Date(product.updated_at || product.created_at);
        }
        const strDate = !isNaN(lastModDate.getTime()) ? lastModDate.toISOString().split('T')[0] : fallbackDate;

        const imageMeta = product.image_url || product.image ? {
          url: product.image_url || product.image,
          title: product.name,
          caption: product.seo_description || `Detail pemesanan ${product.name} di Trivgoo`
        } : null;

        xml += generateUrlBlock(path, '0.9', 'weekly', strDate, imageMeta);
      });
    }
  } catch (err) {
    console.error('DB Error on sitemapProducts:', err);
    // Fallback: return minimum viable sitemap node so crawler doesn't fail parsing
    xml += generateUrlBlock('/explore?category_id=3', '0.6', 'monthly', fallbackDate);
  }

  xml += `</urlset>`;
  res.header('Content-Type', 'application/xml');
  res.send(xml);
};

const sitemapBlog = (req, res) => {
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n`;
  
  const strDate = new Date().toISOString().split('T')[0];
  xml += generateUrlBlock('/blog', '0.8', 'weekly', strDate);

  const posts = ['/blog/ultimate-bali-guide', '/blog/top-10-destinations-2026'];
  posts.forEach(path => {
    xml += generateUrlBlock(path, '0.7', 'monthly', strDate);
  });

  xml += `</urlset>`;
  res.header('Content-Type', 'application/xml');
  res.send(xml);
};

module.exports = {
  sitemapIndex,
  sitemapPages,
  sitemapProducts,
  sitemapBlog
};
