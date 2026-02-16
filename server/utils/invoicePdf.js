const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const DEFAULT_SUPPORT_EMAIL = 'support@sscjewellery.com';
const TAMIL_REGEX = /[\u0B80-\u0BFF]/;

const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const parseObject = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const inr = (value) => `INR ${toNumber(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
})}`;

const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    });
};

const normalizeAddressLines = (address) => {
    const source = parseObject(address) || {};
    const line1 = source.line1 || source.addressLine1 || source.address || '';
    const line2 = source.line2 || source.addressLine2 || '';
    const cityState = [source.city, source.state].filter(Boolean).join(', ');
    const zip = source.zip || source.pincode || source.postalCode || '';
    const country = source.country || 'India';
    return [line1, line2, cityState, zip, country].filter(Boolean);
};

const resolveFirstExistingPath = (candidates = []) => {
    for (const filePath of candidates) {
        if (fs.existsSync(filePath)) return filePath;
    }
    return null;
};

const resolveLogoPath = () => resolveFirstExistingPath([
    path.join(__dirname, '../../client/public/apple-touch-icon.png'),
    path.join(__dirname, '../../client/public/logo.png'),
    path.join(__dirname, '../../client/public/logo.jpg'),
    path.join(__dirname, '../../client/public/logo.jpeg'),
    path.join(__dirname, '../../client/public/logo.webp')
]);

const resolvePaidStampPath = () => resolveFirstExistingPath([
    path.join(__dirname, '../../client/src/assets/paid-stamp.png'),
    path.join(__dirname, '../../client/public/paid-stamp.png')
]);

const resolveCancelledStampPath = () => resolveFirstExistingPath([
    path.join(__dirname, '../../client/src/assets/cancelled-stamp.png'),
    path.join(__dirname, '../../client/public/cancelled-stamp.png')
]);

const resolveUnicodeFontPath = () => resolveFirstExistingPath([
    '/usr/share/fonts/truetype/noto/NotoSansTamil-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSansTamilUI-Regular.ttf',
    '/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf'
]);

const containsTamil = (value) => TAMIL_REGEX.test(String(value || ''));

const textHeight = (doc, text, width, size, fonts) => {
    const font = containsTamil(text) ? (fonts.tamil || fonts.base) : fonts.base;
    doc.font(font).fontSize(size);
    return doc.heightOfString(String(text || ''), { width, lineGap: 1 });
};

const drawMixedText = (doc, text, x, y, options = {}, fonts = { base: 'Helvetica', tamil: null }) => {
    const size = options.size || 9;
    const color = options.color || '#111827';
    const width = options.width;
    const align = options.align || 'left';
    const safe = String(text || '');
    const font = containsTamil(safe) ? (fonts.tamil || fonts.base) : fonts.base;
    doc.font(font).fontSize(size).fillColor(color).text(safe, x, y, {
        width,
        align
    });
};

const getCompany = (order = {}) => {
    const snapshot = parseObject(order.company_snapshot || order.companySnapshot) || {};
    return {
        displayName: String(snapshot.displayName || 'SSC Jewellery'),
        contactNumber: String(snapshot.contactNumber || ''),
        supportEmail: String(snapshot.supportEmail || ''),
        address: String(snapshot.address || '')
    };
};

const stringifyVariantOptions = (value) => {
    const options = parseObject(value) || value;
    if (!options || typeof options !== 'object') return '';
    if (Array.isArray(options)) {
        return options
            .map((entry) => {
                if (!entry || typeof entry !== 'object') return '';
                const name = entry.name || entry.key || '';
                const val = entry.value || entry.label || '';
                if (!name && !val) return '';
                return name ? `${name}: ${val}` : String(val);
            })
            .filter(Boolean)
            .join(', ');
    }
    return Object.entries(options)
        .map(([key, val]) => `${key}: ${val}`)
        .join(', ');
};

const getItems = (order = {}) => {
    const raw = Array.isArray(order.items) ? order.items : [];
    return raw.map((item) => {
        const snapshot = parseObject(item.item_snapshot || item.itemSnapshot || item.snapshot) || {};
        const qty = Math.max(0, toNumber(item.quantity ?? snapshot.quantity, 0));
        const paidUnit = toNumber(item.price ?? snapshot.unitPrice, 0);
        const mrpUnit = toNumber(item.original_price ?? snapshot.originalPrice, paidUnit) || paidUnit;
        const finalLineTotal = toNumber(item.line_total ?? snapshot.lineTotal, paidUnit * qty);
        const variantTitle = item.variant_title || snapshot.variantTitle || '';
        const variantOptions = stringifyVariantOptions(snapshot.variantOptions || item.variant_options || item.variantOptions);

        return {
            name: String(item.title || snapshot.title || 'Item'),
            variantLine: [variantTitle, variantOptions].filter(Boolean).join(' | '),
            qty,
            unitPriceMrp: mrpUnit,
            unitPricePaid: paidUnit,
            discount: Math.max(0, (mrpUnit - paidUnit) * qty),
            lineTotal: finalLineTotal
        };
    });
};

const drawAddressBlock = (doc, fonts, { x, y, width, heading, lines = [] }) => {
    doc.roundedRect(x, y, width, 98, 6).strokeColor('#E5E7EB').stroke();
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#6B7280').text(heading, x + 10, y + 8, { width: width - 20 });
    let cursorY = y + 24;
    lines.slice(0, 6).forEach((text) => {
        drawMixedText(doc, String(text), x + 10, cursorY, {
            size: 10,
            color: '#111827',
            width: width - 20
        }, fonts);
        cursorY += 14;
    });
};

const drawTableHeader = (doc, y) => {
    const left = 44;
    const tableWidth = 525;
    const cols = {
        idx: 48,
        name: 72,
        qty: 305,
        price: 350,
        discount: 438,
        total: 512
    };
    doc.rect(left, y, tableWidth, 22).fill('#F9FAFB');
    doc.fillColor('#4B5563').font('Helvetica-Bold').fontSize(8);
    doc.text('#', cols.idx, y + 7);
    doc.text('Item', cols.name, y + 7);
    doc.text('Qty', cols.qty, y + 7, { width: 36, align: 'right' });
    doc.text('Unit Price (MRP)', cols.price, y + 7, { width: 84, align: 'right' });
    doc.text('Discount', cols.discount, y + 7, { width: 72, align: 'right' });
    doc.text('Line Total', cols.total, y + 7, { width: 55, align: 'right' });
    return { left, tableWidth, cols, nextY: y + 22 };
};

const drawItemsTable = (doc, fonts, startY, items = []) => {
    const pageBottom = doc.page.height - 220;
    const table = drawTableHeader(doc, startY);
    let y = table.nextY;

    if (!items.length) {
        doc.rect(table.left, y, table.tableWidth, 24).strokeColor('#E5E7EB').stroke();
        doc.font('Helvetica').fontSize(9).fillColor('#6B7280').text('No items found', table.cols.name, y + 7);
        return y + 24;
    }

    items.forEach((item, idx) => {
        const itemText = item.variantLine ? `${item.name}\n${item.variantLine}` : item.name;
        const itemTextHeight = textHeight(doc, itemText, 224, 9, fonts);
        const rowHeight = Math.max(24, itemTextHeight + 8);

        if (y + rowHeight > pageBottom) {
            doc.addPage();
            const next = drawTableHeader(doc, 52);
            y = next.nextY;
        }

        doc.rect(table.left, y, table.tableWidth, rowHeight).strokeColor('#E5E7EB').stroke();
        doc.font('Helvetica').fontSize(9).fillColor('#111827').text(String(idx + 1), table.cols.idx, y + 6);

        const lines = String(itemText).split('\n');
        let lineY = y + 5;
        lines.forEach((lineText) => {
            drawMixedText(doc, lineText, table.cols.name, lineY, {
                size: 9,
                color: '#111827',
                width: 224
            }, fonts);
            lineY += textHeight(doc, lineText, 224, 9, fonts) + 1;
        });

        doc.font('Helvetica').fontSize(9).fillColor('#111827').text(String(item.qty), table.cols.qty, y + 6, { width: 36, align: 'right' });
        doc.text(inr(item.unitPriceMrp), table.cols.price, y + 6, { width: 84, align: 'right' });
        doc.text(inr(item.discount), table.cols.discount, y + 6, { width: 72, align: 'right' });
        doc.text(inr(item.lineTotal), table.cols.total, y + 6, { width: 55, align: 'right' });
        y += rowHeight;
    });

    return y;
};

const ensureSpace = (doc, neededHeight, topY = 46) => {
    const available = doc.page.height - doc.page.margins.bottom - doc.y;
    if (available >= neededHeight) return;
    doc.addPage();
    doc.y = topY;
};

const addPageNumbers = (doc) => {
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(i);
        doc.font('Helvetica').fontSize(8).fillColor('#9CA3AF').text(
            `Page ${i + 1} of ${range.count}`,
            42,
            doc.page.height - 52,
            { width: 520, align: 'right', lineBreak: false }
        );
    }
};

const toBuffer = (doc) => new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
});

const buildInvoicePdfBuffer = async (order = {}) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });

    const unicodeFontPath = resolveUnicodeFontPath();
    const unicodeFontName = unicodeFontPath ? 'InvoiceTamil' : null;
    if (unicodeFontPath) {
        doc.registerFont(unicodeFontName, unicodeFontPath);
    }
    const fonts = {
        base: 'Helvetica',
        tamil: unicodeFontName || 'Helvetica'
    };

    const company = getCompany(order);
    const billing = parseObject(order.billing_address || order.billingAddress) || {};
    const shipping = parseObject(order.shipping_address || order.shippingAddress) || {};
    const items = getItems(order);
    const orderRef = order.order_ref || order.orderRef || `ORDER-${order.id || 'N/A'}`;

    const subtotal = toNumber(order.subtotal, items.reduce((sum, item) => sum + item.lineTotal, 0));
    const shippingFee = toNumber(order.shipping_fee, 0);
    const couponDiscount = toNumber(order.discount_total, 0);
    const total = toNumber(order.total, subtotal + shippingFee - couponDiscount);
    const couponCode = String(order.coupon_code || order.couponCode || '').trim();

    const logoPath = resolveLogoPath();
    if (logoPath) {
        try {
            doc.image(logoPath, 42, 36, { fit: [96, 52] });
        } catch {}
    }

    const isCancelledOrder = String(order?.status || '').toLowerCase() === 'cancelled';
    const stampPath = isCancelledOrder
        ? (resolveCancelledStampPath() || resolvePaidStampPath())
        : resolvePaidStampPath();
    if (stampPath) {
        try {
            doc.save();
            doc.opacity(0.14).image(stampPath, 420, 132, { fit: [130, 130] });
            doc.restore();
        } catch {}
    }

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#111827').text('TAX INVOICE', 418, 42, { align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor('#6B7280').text(`Invoice Date: ${formatDate(order.created_at || order.createdAt)}`, 360, 66, { width: 200, align: 'right' });
    doc.font('Helvetica').fontSize(10).fillColor('#6B7280').text(`Invoice No: INV-${orderRef}`, 340, 84, { width: 220, align: 'right' });

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text(company.displayName, 42, 94, { width: 300 });
    if (company.address) {
        drawMixedText(doc, company.address, 42, 111, {
            size: 9,
            color: '#374151',
            width: 300
        }, fonts);
    }
    const contactLine = [company.contactNumber, company.supportEmail || DEFAULT_SUPPORT_EMAIL].filter(Boolean).join(' | ');
    doc.font('Helvetica').fontSize(8).fillColor('#6B7280').text(contactLine, 42, 137, { width: 320 });

    const billingLines = [
        billing.name || billing.fullName || order.customer_name || 'Customer',
        billing.mobile || billing.phone || order.customer_mobile || '',
        ...normalizeAddressLines(billing)
    ].filter(Boolean);
    const shippingLines = normalizeAddressLines(shipping);

    drawAddressBlock(doc, fonts, { x: 42, y: 162, width: 250, heading: 'BILL TO', lines: billingLines });
    drawAddressBlock(doc, fonts, { x: 318, y: 162, width: 250, heading: 'SHIP TO', lines: shippingLines.length ? shippingLines : ['Address not provided'] });

    doc.font('Helvetica').fontSize(9).fillColor('#6B7280').text('Order Ref:', 42, 270, { continued: true });
    doc.font('Helvetica-Bold').fillColor('#111827').text(` ${orderRef}`);
    doc.font('Helvetica').fontSize(9).fillColor('#6B7280').text('Payment:', 220, 270, { continued: true });
    doc.font('Helvetica-Bold').fillColor('#111827').text(` ${String(order.payment_gateway || 'razorpay').toUpperCase()}`);
    doc.font('Helvetica').fontSize(9).fillColor('#6B7280').text('Payment Status:', 392, 270, { continued: true });
    doc.font('Helvetica-Bold').fillColor('#111827').text(` ${String(order.payment_status || '—').toUpperCase()}`, { align: 'right' });

    let cursorY = drawItemsTable(doc, fonts, 292, items);

    doc.y = cursorY + 12;
    ensureSpace(doc, 180, 52);

    const totalsX = 350;
    const totalsY = doc.y;
    const writeTotal = (label, value, y, strong = false) => {
        doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 11 : 10).fillColor(strong ? '#111827' : '#4B5563').text(label, totalsX, y, { width: 120 });
        doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').text(value, totalsX + 120, y, { width: 95, align: 'right' });
    };

    writeTotal('Subtotal', inr(subtotal), totalsY);
    writeTotal('Shipping', inr(shippingFee), totalsY + 18);
    writeTotal(
        `Coupon Discount${couponCode ? ` (${couponCode})` : ''}`,
        `- ${inr(couponDiscount)}`,
        totalsY + 36
    );
    doc.moveTo(totalsX, totalsY + 58).lineTo(totalsX + 215, totalsY + 58).strokeColor('#D1D5DB').stroke();
    writeTotal('Grand Total', inr(total), totalsY + 66, true);

    doc.y = totalsY + 102;
    ensureSpace(doc, 120, 52);

    const policyTop = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151').text('Terms & Conditions', 42, policyTop);
    doc.font('Helvetica').fontSize(8).fillColor('#6B7280').text(
        '1. All sales are final after dispatch. 2. Product visuals and colour may slightly vary based on display settings.',
        42,
        policyTop + 12,
        { width: 520, lineGap: 1 }
    );

    const refundHeadingY = policyTop + 34;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151').text('Refund Policy', 42, refundHeadingY);
    doc.font('Helvetica').fontSize(8).fillColor('#6B7280').text(
        'No refunds are allowed under any circumstances. Replacements are allowed only when the customer provides a continuous unedited video from receiving the courier package, opening the box, and clearly showing the defect, if any.',
        42,
        refundHeadingY + 12,
        { width: 520, lineGap: 1 }
    );

    doc.font('Helvetica').fontSize(8).fillColor('#6B7280').text(
        `Support: ${company.supportEmail || DEFAULT_SUPPORT_EMAIL}${company.contactNumber ? ` | ${company.contactNumber}` : ''}`,
        42,
        doc.page.height - 70,
        { width: 520, align: 'left', lineBreak: false }
    );
    doc.font('Helvetica').fontSize(8).fillColor('#9CA3AF').text(
        'This is a computer-generated invoice and does not require a signature.',
        42,
        doc.page.height - 58,
        { width: 520, align: 'left', lineBreak: false }
    );

    addPageNumbers(doc);
    return toBuffer(doc);
};

module.exports = { buildInvoicePdfBuffer };
