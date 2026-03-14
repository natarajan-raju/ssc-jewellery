const db = require('../config/db');

const escapeXml = (value = '') => String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const getBaseUrl = () => String(
    process.env.APP_BASE_URL
    || process.env.CLIENT_BASE_URL
    || process.env.FRONTEND_URL
    || ''
).trim().replace(/\/+$/, '');

const absoluteUrl = (pathname = '/') => {
    const baseUrl = getBaseUrl();
    const normalizedPath = String(pathname || '/').startsWith('/') ? String(pathname || '/') : `/${pathname}`;
    return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath;
};

const buildRobotsTxt = () => [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /login',
    'Disallow: /register',
    'Disallow: /forgot-password',
    'Disallow: /profile',
    'Disallow: /wishlist',
    'Disallow: /orders',
    'Disallow: /track-order',
    'Disallow: /cart',
    'Disallow: /checkout',
    'Disallow: /payment/success',
    'Disallow: /payment/failed',
    '',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    ''
].join('\n');

const buildSitemapXml = (entries = []) => {
    const urls = entries.map(({ loc, lastmod }) => [
        '  <url>',
        `    <loc>${escapeXml(loc)}</loc>`,
        lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : null,
        '  </url>'
    ].filter(Boolean).join('\n')).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
};

const loadSitemapEntries = async () => {
    const today = new Date().toISOString().slice(0, 10);
    const staticPaths = [
        '/',
        '/shop',
        '/about',
        '/faq',
        '/contact',
        '/terms',
        '/shipping',
        '/refund',
        '/privacy',
        '/copyright'
    ];

    const entries = staticPaths.map((pathname) => ({
        loc: absoluteUrl(pathname),
        lastmod: today
    }));

    const [categoryRows] = await db.execute(
        `SELECT c.name, MAX(p.updated_at) AS lastmod
         FROM categories c
         JOIN product_categories pc ON pc.category_id = c.id
         JOIN products p ON p.id = pc.product_id
         WHERE LOWER(COALESCE(p.status, '')) = 'active'
         GROUP BY c.id, c.name
         HAVING COUNT(DISTINCT p.id) > 0
         ORDER BY c.name ASC`
    );
    const [productRows] = await db.execute(
        `SELECT id, updated_at
         FROM products
         WHERE LOWER(COALESCE(status, '')) = 'active'
         ORDER BY updated_at DESC, created_at DESC`
    );

    categoryRows.forEach((row) => {
        const categoryName = String(row.name || '').trim();
        if (!categoryName) return;
        entries.push({
            loc: absoluteUrl(`/shop/${encodeURIComponent(categoryName)}`),
            lastmod: String(row.lastmod || '').slice(0, 10) || today
        });
    });

    productRows.forEach((row) => {
        const productId = String(row.id || '').trim();
        if (!productId) return;
        entries.push({
            loc: absoluteUrl(`/product/${encodeURIComponent(productId)}`),
            lastmod: String(row.updated_at || '').slice(0, 10) || today
        });
    });

    return entries;
};

module.exports = {
    buildRobotsTxt,
    buildSitemapXml,
    loadSitemapEntries
};
