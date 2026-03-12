const test = require('node:test');
const assert = require('node:assert/strict');

const { requireFresh } = require('./testUtils');

test('invoice share token helper requires configured secret outside dev/test', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalInvoiceSecret = process.env.INVOICE_SHARE_SECRET;
    const originalJwtSecret = process.env.JWT_SECRET;

    process.env.NODE_ENV = 'production';
    delete process.env.INVOICE_SHARE_SECRET;
    delete process.env.JWT_SECRET;

    try {
        const service = requireFresh('../services/invoiceShareService');
        assert.throws(() => service.buildInvoiceShareUrl({ orderId: 1, userId: 'u1', baseUrl: 'https://example.com' }), /must be configured/i);
    } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (originalInvoiceSecret === undefined) {
            delete process.env.INVOICE_SHARE_SECRET;
        } else {
            process.env.INVOICE_SHARE_SECRET = originalInvoiceSecret;
        }
        if (originalJwtSecret === undefined) {
            delete process.env.JWT_SECRET;
        } else {
            process.env.JWT_SECRET = originalJwtSecret;
        }
    }
});

test('invoice share token helper still works in test without explicit secret', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalInvoiceSecret = process.env.INVOICE_SHARE_SECRET;
    const originalJwtSecret = process.env.JWT_SECRET;

    process.env.NODE_ENV = 'test';
    delete process.env.INVOICE_SHARE_SECRET;
    delete process.env.JWT_SECRET;

    try {
        const service = requireFresh('../services/invoiceShareService');
        const url = service.buildInvoiceShareUrl({ orderId: 1, userId: 'u1', baseUrl: 'https://example.com' });
        assert.match(url, /invoice\/share/);
    } finally {
        process.env.NODE_ENV = originalNodeEnv;
        if (originalInvoiceSecret === undefined) {
            delete process.env.INVOICE_SHARE_SECRET;
        } else {
            process.env.INVOICE_SHARE_SECRET = originalInvoiceSecret;
        }
        if (originalJwtSecret === undefined) {
            delete process.env.JWT_SECRET;
        } else {
            process.env.JWT_SECRET = originalJwtSecret;
        }
    }
});
