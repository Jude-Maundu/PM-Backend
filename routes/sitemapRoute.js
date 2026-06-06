import express from 'express';
import User from '../models/users.js';

const router = express.Router();
const SITE = 'https://relicsnap.onrender.com';

router.get('/sitemap.xml', async (req, res) => {
  try {
    const photographers = await User.find({ role: 'photographer' })
      .select('username _id updatedAt')
      .lean();

    const portfolioUrls = photographers.map(p => `
  <url>
    <loc>${SITE}/portfolio/${p.username || p._id}</loc>
    <lastmod>${new Date(p.updatedAt || Date.now()).toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`).join('');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE}/explore</loc>
    <changefreq>daily</changefreq>
    <priority>0.9</priority>
  </url>
  <url>
    <loc>${SITE}/register</loc>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${SITE}/login</loc>
    <changefreq>monthly</changefreq>
    <priority>0.4</priority>
  </url>${portfolioUrls}
</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.header('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('[sitemap] failed:', err.message);
    res.status(500).send('Failed to generate sitemap');
  }
});

export default router;
