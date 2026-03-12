const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const importSeoModule = async (relativePath) => {
    const abs = path.resolve(__dirname, '../../client/src/seo', relativePath);
    return import(pathToFileURL(abs).href);
};

test('private routes default to noindex', async () => {
    const { buildDefaultSeo } = await importSeoModule('rules.js');
    const seo = buildDefaultSeo('/checkout');
    assert.equal(seo.robots, 'noindex,nofollow');
});

test('product seo builds product and breadcrumb structured data', async () => {
    const { buildProductSeo } = await importSeoModule('rules.js');
    const seo = buildProductSeo({
        product: {
            id: 'p1',
            title: 'Premium Chain',
            subtitle: '24 inches',
            description: '',
            categories: ['Chains'],
            media: [{ type: 'image', url: '/uploads/products/p1.jpg' }],
            mrp: 3000,
            discount_price: 2600,
            sku: 'SKU-1',
            track_quantity: 1,
            quantity: 4
        }
    });
    assert.match(seo.title, /Premium Chain/);
    assert.equal(Array.isArray(seo.structuredData), true);
    assert.equal(seo.structuredData.some((item) => item?.['@type'] === 'Product'), true);
    assert.equal(seo.structuredData.some((item) => item?.['@type'] === 'BreadcrumbList'), true);
});

test('faq seo includes faq structured data and fallback image', async () => {
    const { buildFaqSeo } = await importSeoModule('rules.js');
    const seo = buildFaqSeo({ company: {} });
    assert.equal(seo.structuredData.some((item) => item?.['@type'] === 'FAQPage'), true);
    assert.ok(String(seo.image || '').length > 0);
});

test('seo uses absolute canonicals and richer schema when app base url is configured', async () => {
    const previousBaseUrl = process.env.APP_BASE_URL;
    process.env.APP_BASE_URL = 'https://sscjewellery.example';

    try {
        const { buildCategorySeo, buildProductSeo } = await importSeoModule('rules.js');
        const categorySeo = buildCategorySeo({
            company: { displayName: 'SSC Jewellery' },
            category: { name: 'Chains', image_url: '/uploads/categories/chains.jpg' },
            products: [
                {
                    id: 'p1',
                    title: 'Premium Chain',
                    media: [{ type: 'image', url: '/uploads/products/p1.jpg' }]
                }
            ]
        });
        const productSeo = buildProductSeo({
            product: {
                id: 'p1',
                title: 'Premium Chain',
                subtitle: '24 inches',
                description: '',
                categories: ['Chains'],
                media: [{ type: 'image', url: '/uploads/products/p1.jpg' }],
                mrp: 3000,
                discount_price: 2600,
                sku: 'SKU-1',
                track_quantity: 1,
                quantity: 4
            }
        });

        assert.equal(categorySeo.canonical, 'https://sscjewellery.example/shop/Chains');
        assert.equal(String(categorySeo.image).startsWith('https://sscjewellery.example/'), true);

        const itemList = categorySeo.structuredData.find((item) => item?.['@type'] === 'ItemList');
        assert.equal(Boolean(itemList?.itemListElement?.[0]?.name), true);
        assert.equal(Boolean(itemList?.itemListElement?.[0]?.image), true);

        const productSchema = productSeo.structuredData.find((item) => item?.['@type'] === 'Product');
        assert.equal(productSchema?.brand?.name, 'SSC Jewellery');
        assert.equal(productSchema?.offers?.url, 'https://sscjewellery.example/product/p1');
    } finally {
        if (previousBaseUrl == null) delete process.env.APP_BASE_URL;
        else process.env.APP_BASE_URL = previousBaseUrl;
    }
});
