const db = require('../config/db');
const AbandonedCart = require('./AbandonedCart');
const Coupon = require('./Coupon');
const CompanyProfile = require('./CompanyProfile');
const { getUserLoyaltyStatus, calculateOrderLoyaltyAdjustments } = require('../services/loyaltyService');

const buildOrderRef = () => {
    const now = new Date();
    const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `SSC-${datePart}-${randomPart}`;
};

const normalizeAddress = (address) => {
    if (!address) return null;
    if (typeof address === 'string') {
        try {
            return JSON.parse(address);
        } catch {
            return address;
        }
    }
    return address;
};

const parseJsonSafe = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return null;
    }
};

const toSubunits = (amount) => Math.round(Number(amount || 0) * 100);
const fromSubunits = (subunits) => Number(subunits || 0) / 100;

const applyDefaultPending = (order) => {
    if (!order) return order;
    const status = order.status || '';
    if (!['confirmed'].includes(status)) return order;
    const createdAt = order.created_at ? new Date(order.created_at) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return order;
    const now = new Date();
    const isNextDay = createdAt.toDateString() !== now.toDateString();
    if (!isNextDay) return order;
    return { ...order, status: 'pending' };
};

const computeShippingFee = async (connection, shippingAddress, subtotal, totalWeightKg) => {
    if (!shippingAddress || !shippingAddress.state) return 0;
    const [zones] = await connection.execute('SELECT * FROM shipping_zones');
    const [options] = await connection.execute('SELECT * FROM shipping_options');
    const normalizeStateKey = (value) => String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
    const state = normalizeStateKey(shippingAddress.state);
    if (!state) return 0;

    const zone = zones.find((z) => {
        if (!z.states) return false;
        try {
            const states = JSON.parse(z.states || '[]');
            return states.some((s) => normalizeStateKey(s) === state);
        } catch {
            return false;
        }
    });

    if (!zone) return 0;
    const zoneOptions = options.filter((opt) => opt.zone_id === zone.id);
    if (zoneOptions.length === 0) return 0;

    const eligible = zoneOptions.filter((opt) => {
        const min = opt.min_value === null ? null : Number(opt.min_value);
        const max = opt.max_value === null ? null : Number(opt.max_value);
        if (opt.condition_type === 'weight') {
            if (min !== null && totalWeightKg < min) return false;
            if (max !== null && totalWeightKg > max) return false;
            return true;
        }
        if (opt.condition_type === 'price' || !opt.condition_type) {
            if (min !== null && subtotal < min) return false;
            if (max !== null && subtotal > max) return false;
            return true;
        }
        return true;
    });

    if (eligible.length === 0) return 0;
    eligible.sort((a, b) => Number(a.rate) - Number(b.rate));
    return Number(eligible[0].rate || 0);
};

const buildAdminOrderFilters = ({ status = 'all', search = '', startDate = '', endDate = '', quickRange = 'all' } = {}) => {
    const params = [];
    let where = 'WHERE 1=1';
    let latestLimit = null;

    if (status && status !== 'all') {
        where += ' AND o.status = ?';
        params.push(status);
    }

    if (search) {
        where += ' AND (o.order_ref LIKE ? OR u.name LIKE ? OR u.mobile LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
    }

    switch (quickRange) {
        case 'last_7_days':
            where += ' AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
            break;
        case 'last_1_month':
            where += ' AND o.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
            break;
        case 'last_1_year':
            where += ' AND o.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)';
            break;
        case 'latest_10':
            latestLimit = 10;
            break;
        default:
            if (startDate) {
                where += ' AND DATE(o.created_at) >= ?';
                params.push(startDate);
            }
            if (endDate) {
                where += ' AND DATE(o.created_at) <= ?';
                params.push(endDate);
            }
            break;
    }

    return { where, params, latestLimit };
};

const resolveAdminOrderSort = ({ sortBy = 'newest', quickRange = 'all' } = {}) => {
    if (quickRange === 'latest_10') return 'o.created_at DESC';
    switch (sortBy) {
        case 'priority':
            return `CASE LOWER(COALESCE(o.loyalty_tier, 'regular'))
                WHEN 'platinum' THEN 5
                WHEN 'gold' THEN 4
                WHEN 'silver' THEN 3
                WHEN 'bronze' THEN 2
                ELSE 1
            END DESC, o.created_at DESC`;
        case 'oldest':
            return 'o.created_at ASC';
        case 'amount_high':
            return 'o.total DESC, o.created_at DESC';
        case 'amount_low':
            return 'o.total ASC, o.created_at DESC';
        default:
            return 'o.created_at DESC';
    }
};

class Order {
    static async getAvailableCoupons(userId) {
        const connection = await db.getConnection();
        try {
            const [cartRows] = await connection.execute(
                `SELECT ci.quantity, ci.product_id,
                        p.status as product_status, p.mrp, p.discount_price as product_discount_price,
                        pv.price as variant_price, pv.discount_price as variant_discount_price
                 FROM cart_items ci
                 JOIN products p ON p.id = ci.product_id
                 LEFT JOIN product_variants pv ON pv.id = ci.variant_id
                 WHERE ci.user_id = ?`,
                [userId]
            );
            if (!cartRows.length) return [];
            let subtotal = 0;
            const productIds = [];
            for (const row of cartRows) {
                const quantity = Number(row.quantity || 0);
                if (quantity <= 0) continue;
                if (row.product_status && row.product_status !== 'active') continue;
                const unitPrice = Number(
                    row.variant_discount_price || row.variant_price || row.product_discount_price || row.mrp || 0
                );
                subtotal += unitPrice * quantity;
                if (row.product_id) productIds.push(row.product_id);
            }
            const loyaltyStatus = await getUserLoyaltyStatus(userId);
            return Coupon.getAvailableCouponsForUser({
                userId,
                loyaltyTier: loyaltyStatus?.tier || 'regular',
                cartTotalSubunits: toSubunits(subtotal),
                cartProductIds: [...new Set(productIds)]
            });
        } finally {
            connection.release();
        }
    }

    static async computeShippingFeeForSummary({
        shippingAddress = null,
        subtotal = 0,
        totalWeightKg = 0
    } = {}) {
        if (!shippingAddress || !shippingAddress.state) return 0;
        const connection = await db.getConnection();
        try {
            return await computeShippingFee(connection, shippingAddress, subtotal, totalWeightKg);
        } finally {
            connection.release();
        }
    }

    static async getCheckoutSummary(userId, { shippingAddress, couponCode = null } = {}) {
        const connection = await db.getConnection();
        try {
            const [cartRows] = await connection.execute(
                `SELECT ci.quantity, ci.product_id,
                        p.status as product_status, p.mrp, p.discount_price as product_discount_price, p.weight_kg as product_weight_kg,
                        pv.price as variant_price, pv.discount_price as variant_discount_price, pv.weight_kg as variant_weight_kg
                 FROM cart_items ci
                 JOIN products p ON p.id = ci.product_id
                 LEFT JOIN product_variants pv ON pv.id = ci.variant_id
                 WHERE ci.user_id = ?`,
                [userId]
            );

            if (!cartRows.length) {
                throw new Error('Cart is empty');
            }

            let subtotal = 0;
            let totalWeightKg = 0;
            let itemCount = 0;

            for (const row of cartRows) {
                const quantity = Number(row.quantity || 0);
                if (quantity <= 0) continue;

                if (row.product_status && row.product_status !== 'active') {
                    throw new Error('Some items are no longer available');
                }

                const unitPrice = Number(
                    row.variant_discount_price || row.variant_price || row.product_discount_price || row.mrp || 0
                );
                const itemWeight = Number(row.variant_weight_kg || row.product_weight_kg || 0);

                subtotal += unitPrice * quantity;
                totalWeightKg += itemWeight * quantity;
                itemCount += quantity;
            }

            if (!itemCount) {
                throw new Error('Cart is empty');
            }

            const shippingFee = await computeShippingFee(connection, shippingAddress, subtotal, totalWeightKg);
            let couponDiscountTotal = 0;
            let coupon = null;
            const cartProductIds = [...new Set(cartRows.map((row) => row.product_id).filter(Boolean))];
            const loyaltyStatus = await getUserLoyaltyStatus(userId);
            if (couponCode) {
                const discount = await Coupon.resolveRedeemableCoupon({
                    code: couponCode,
                    userId,
                    cartTotalSubunits: toSubunits(subtotal),
                    loyaltyTier: loyaltyStatus?.tier || 'regular',
                    cartProductIds,
                    connection
                });
                if (!discount) {
                    throw new Error('Coupon is invalid or expired');
                }
                couponDiscountTotal = fromSubunits(discount.discountSubunits);
                coupon = {
                    id: discount.id,
                    code: discount.code,
                    source: discount.source || 'coupon',
                    type: discount.type || 'percent',
                    percent: Number(discount.percent || 0),
                    fixedAmount: Number(discount.fixedAmount || 0),
                    journeyId: discount.journeyId || null,
                    discountSubunits: Number(discount.discountSubunits || 0)
                };
            }
            if (couponDiscountTotal > subtotal) couponDiscountTotal = subtotal;

            const loyaltyAdjustments = calculateOrderLoyaltyAdjustments({
                subtotal,
                shippingFee,
                couponDiscount: couponDiscountTotal,
                tier: loyaltyStatus?.tier || 'regular'
            });
            const loyaltyDiscountTotal = Math.min(
                Math.max(0, subtotal - couponDiscountTotal),
                Number(loyaltyAdjustments.loyaltyDiscount || 0)
            );
            const loyaltyShippingDiscountTotal = Math.min(
                Math.max(0, shippingFee),
                Number(loyaltyAdjustments.shippingDiscount || 0)
            );
            const discountTotal = couponDiscountTotal + loyaltyDiscountTotal + loyaltyShippingDiscountTotal;
            const total = Math.max(0, subtotal + shippingFee - discountTotal);

            return {
                itemCount,
                subtotal,
                shippingFee,
                couponDiscountTotal,
                loyaltyDiscountTotal,
                loyaltyShippingDiscountTotal,
                discountTotal,
                total,
                currency: 'INR',
                coupon,
                loyaltyTier: loyaltyStatus?.tier || 'regular',
                loyaltyProfile: loyaltyStatus?.profile || null,
                loyaltyMeta: {
                    profile: loyaltyAdjustments.profile || null,
                    progress: loyaltyStatus?.progress || null
                }
            };
        } finally {
            connection.release();
        }
    }

    static async createFromCart(userId, {
        billingAddress,
        shippingAddress,
        payment = null,
        skipStockDeduction = false,
        couponCode = null,
        sourceChannel = null
    }) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const [cartRows] = await connection.execute(
                `SELECT ci.product_id, ci.variant_id, ci.quantity,
                        p.title as product_title, p.status as product_status,
                        p.mrp, p.discount_price as product_discount_price, p.track_quantity as product_track_quantity,
                        p.quantity as product_quantity, p.sku as product_sku, p.media as product_media, p.weight_kg as product_weight_kg,
                        pv.variant_title, pv.price as variant_price, pv.discount_price as variant_discount_price,
                        pv.track_quantity as variant_track_quantity, pv.quantity as variant_quantity,
                        pv.sku as variant_sku, pv.image_url as variant_image_url, pv.weight_kg as variant_weight_kg,
                        pv.variant_options
                 FROM cart_items ci
                 JOIN products p ON p.id = ci.product_id
                 LEFT JOIN product_variants pv ON pv.id = ci.variant_id
                 WHERE ci.user_id = ?`,
                [userId]
            );

            if (!cartRows.length) {
                throw new Error('Cart is empty');
            }

            const orderItems = [];
            let subtotal = 0;
            let totalWeightKg = 0;

            for (const row of cartRows) {
                const quantity = Number(row.quantity || 0);
                if (quantity <= 0) continue;

                if (row.product_status && row.product_status !== 'active') {
                    throw new Error('Some items are no longer available');
                }

                const hasVariant = !!row.variant_id;
                const price = Number(
                    row.variant_discount_price || row.variant_price || row.product_discount_price || row.mrp || 0
                );
                const originalPrice = Number(
                    row.variant_price || row.mrp || price
                );
                const lineTotal = price * quantity;
                const itemWeight = Number(row.variant_weight_kg || row.product_weight_kg || 0);
                totalWeightKg += itemWeight * quantity;

                if (!skipStockDeduction) {
                    if (hasVariant) {
                        const [variantRows] = await connection.execute(
                            'SELECT quantity, track_quantity FROM product_variants WHERE id = ? FOR UPDATE',
                            [row.variant_id]
                        );
                        const variant = variantRows[0];
                        if (!variant) throw new Error('Variant not found');
                        if (Number(variant.track_quantity) === 1 && Number(variant.quantity) < quantity) {
                            throw new Error('Insufficient stock for some items');
                        }
                        if (Number(variant.track_quantity) === 1) {
                            await connection.execute(
                                'UPDATE product_variants SET quantity = quantity - ? WHERE id = ?',
                                [quantity, row.variant_id]
                            );
                        }
                    } else {
                        const [productRows] = await connection.execute(
                            'SELECT quantity, track_quantity FROM products WHERE id = ? FOR UPDATE',
                            [row.product_id]
                        );
                        const product = productRows[0];
                        if (!product) throw new Error('Product not found');
                        if (Number(product.track_quantity) === 1 && Number(product.quantity) < quantity) {
                            throw new Error('Insufficient stock for some items');
                        }
                        if (Number(product.track_quantity) === 1) {
                            await connection.execute(
                                'UPDATE products SET quantity = quantity - ? WHERE id = ?',
                                [quantity, row.product_id]
                            );
                        }
                    }
                }

                let imageUrl = row.variant_image_url || null;
                if (!imageUrl && row.product_media) {
                    try {
                        const media = JSON.parse(row.product_media || '[]');
                        imageUrl = Array.isArray(media) ? (media[0]?.url || media[0] || null) : null;
                    } catch {
                        imageUrl = null;
                    }
                }

                subtotal += lineTotal;
                orderItems.push({
                    productId: row.product_id,
                    variantId: row.variant_id || '',
                    title: row.product_title,
                    variantTitle: row.variant_title || null,
                    quantity,
                    price,
                    lineTotal,
                    imageUrl,
                    sku: row.variant_sku || row.product_sku || null,
                    snapshot: {
                        productId: row.product_id,
                        variantId: row.variant_id || '',
                        title: row.product_title || '',
                        variantTitle: row.variant_title || null,
                        variantOptions: row.variant_options ? (
                            typeof row.variant_options === 'string'
                                ? (() => {
                                    try { return JSON.parse(row.variant_options); } catch { return null; }
                                })()
                                : row.variant_options
                        ) : null,
                        quantity,
                        unitPrice: price,
                        originalPrice,
                        discountValuePerUnit: Math.max(0, originalPrice - price),
                        lineTotal,
                        imageUrl,
                        sku: row.variant_sku || row.product_sku || null,
                        weightKg: itemWeight,
                        productStatus: row.product_status || 'active',
                        capturedAt: new Date().toISOString()
                    }
                });
            }

            if (!orderItems.length) {
                throw new Error('Cart is empty');
            }

            const shippingFee = await computeShippingFee(connection, shippingAddress, subtotal, totalWeightKg);
            let couponDiscountTotal = 0;
            let coupon = null;
            const cartProductIds = [...new Set(orderItems.map((item) => item.productId).filter(Boolean))];
            const loyaltyStatus = await getUserLoyaltyStatus(userId);
            if (couponCode) {
                const discount = await Coupon.resolveRedeemableCoupon({
                    code: couponCode,
                    userId,
                    cartTotalSubunits: toSubunits(subtotal),
                    loyaltyTier: loyaltyStatus?.tier || 'regular',
                    cartProductIds,
                    connection
                });
                if (!discount) {
                    throw new Error('Coupon is invalid or expired');
                }
                couponDiscountTotal = fromSubunits(discount.discountSubunits);
                coupon = {
                    id: discount.id,
                    code: discount.code,
                    source: discount.source || 'coupon',
                    type: discount.type || 'percent',
                    percent: Number(discount.percent || 0),
                    fixedAmount: Number(discount.fixedAmount || 0),
                    journeyId: discount.journeyId || null,
                    discountSubunits: Number(discount.discountSubunits || 0)
                };
            }
            if (couponDiscountTotal > subtotal) couponDiscountTotal = subtotal;

            const loyaltyAdjustments = calculateOrderLoyaltyAdjustments({
                subtotal,
                shippingFee,
                couponDiscount: couponDiscountTotal,
                tier: loyaltyStatus?.tier || 'regular'
            });
            const loyaltyDiscountTotal = Math.min(
                Math.max(0, subtotal - couponDiscountTotal),
                Number(loyaltyAdjustments.loyaltyDiscount || 0)
            );
            const loyaltyShippingDiscountTotal = Math.min(
                Math.max(0, shippingFee),
                Number(loyaltyAdjustments.shippingDiscount || 0)
            );
            const discountTotal = couponDiscountTotal + loyaltyDiscountTotal + loyaltyShippingDiscountTotal;
            const total = Math.max(0, subtotal + shippingFee - discountTotal);
            const orderRef = buildOrderRef();
            const paymentStatus = payment?.paymentStatus || 'created';
            const paymentGateway = payment?.gateway || 'razorpay';
            const razorpayOrderId = payment?.razorpayOrderId || null;
            const razorpayPaymentId = payment?.razorpayPaymentId || null;
            const razorpaySignature = payment?.razorpaySignature || null;
            const settlementId = payment?.settlementId || null;
            const settlementSnapshot = payment?.settlementSnapshot || null;
            const couponMeta = coupon ? {
                percent: coupon.percent || 0,
                fixedAmount: coupon.fixedAmount || 0,
                source: coupon.source || 'coupon',
                discountSubunits: coupon.discountSubunits || 0
            } : null;
            const isAbandonedRecovery = coupon?.journeyId ? 1 : 0;
            const loyaltyTier = String(loyaltyStatus?.tier || 'regular').toLowerCase();
            const loyaltyMeta = {
                tierProfile: loyaltyStatus?.profile || null,
                adjustmentProfile: loyaltyAdjustments.profile || null,
                progress: loyaltyStatus?.progress || null
            };
            const companyProfile = await CompanyProfile.get();
            const companySnapshot = CompanyProfile.sanitizeForSnapshot(companyProfile);

            const [orderResult] = await connection.execute(
                `INSERT INTO orders 
                (order_ref, user_id, status, payment_status, payment_gateway, razorpay_order_id, razorpay_payment_id, razorpay_signature, coupon_code, coupon_type, coupon_discount_value, coupon_meta, loyalty_tier, loyalty_discount_total, loyalty_shipping_discount_total, loyalty_meta, source_channel, is_abandoned_recovery, abandoned_journey_id, subtotal, shipping_fee, discount_total, total, currency, billing_address, shipping_address, company_snapshot, settlement_id, settlement_snapshot)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    orderRef,
                    userId,
                    'confirmed',
                    paymentStatus,
                    paymentGateway,
                    razorpayOrderId,
                    razorpayPaymentId,
                    razorpaySignature,
                    coupon?.code || null,
                    coupon?.type || null,
                    couponDiscountTotal,
                    couponMeta ? JSON.stringify(couponMeta) : null,
                    loyaltyTier,
                    loyaltyDiscountTotal,
                    loyaltyShippingDiscountTotal,
                    JSON.stringify(loyaltyMeta),
                    sourceChannel ? String(sourceChannel).slice(0, 30) : null,
                    isAbandonedRecovery,
                    coupon?.journeyId || null,
                    subtotal,
                    shippingFee,
                    discountTotal,
                    total,
                    'INR',
                    JSON.stringify(billingAddress || null),
                    JSON.stringify(shippingAddress || null),
                    JSON.stringify(companySnapshot),
                    settlementId,
                    settlementSnapshot ? JSON.stringify(settlementSnapshot) : null
                ]
            );

            const orderId = orderResult.insertId;
            if (coupon?.id) {
                await Coupon.markRedeemed({
                    source: coupon.source || 'coupon',
                    id: coupon.id,
                    orderId,
                    userId,
                    connection
                });
            }
            await connection.execute(
                'INSERT INTO order_status_events (order_id, status) VALUES (?, ?)',
                [orderId, 'confirmed']
            );
            if (orderItems.length) {
                const values = orderItems.map(item => ([
                    orderId,
                    item.productId,
                    item.variantId,
                    item.title,
                    item.variantTitle,
                    item.quantity,
                    item.price,
                    item.lineTotal,
                    item.imageUrl,
                    item.sku,
                    JSON.stringify(item.snapshot || null)
                ]));
                await connection.query(
                    `INSERT INTO order_items 
                    (order_id, product_id, variant_id, title, variant_title, quantity, price, line_total, image_url, sku, item_snapshot)
                    VALUES ?`,
                    [values]
                );
            }

            await connection.execute('DELETE FROM cart_items WHERE user_id = ?', [userId]);

            await connection.commit();

            return {
                id: orderId,
                orderRef,
                userId,
                status: 'confirmed',
                paymentStatus,
                paymentGateway,
                razorpayOrderId,
                razorpayPaymentId,
                subtotal,
                shippingFee,
                discountTotal,
                total,
                currency: 'INR',
                couponCode: coupon?.code || null,
                couponType: coupon?.type || null,
                couponDiscountTotal,
                loyaltyTier,
                loyaltyDiscountTotal,
                loyaltyShippingDiscountTotal,
                loyaltyMeta,
                sourceChannel: sourceChannel || null,
                isAbandonedRecovery: Boolean(isAbandonedRecovery),
                abandonedJourneyId: coupon?.journeyId || null,
                billingAddress: normalizeAddress(billingAddress),
                shippingAddress: normalizeAddress(shippingAddress),
                companySnapshot,
                items: orderItems
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async createFromRecoveryJourney(userId, {
        journey,
        payment = null,
        billingAddress = null,
        shippingAddress = null,
        orderRef = null,
        shippingFeeOverrideSubunits = null
    }) {
        if (!userId) throw new Error('userId is required');
        if (!journey?.id) throw new Error('journey is required');
        const snapshotItems = Array.isArray(journey.cart_snapshot_json) ? journey.cart_snapshot_json : [];
        if (!snapshotItems.length) throw new Error('Recovery snapshot is empty');

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            const orderItems = snapshotItems.map((item) => {
                const quantity = Math.max(1, Number(item?.quantity || 1));
                const price = Number(item?.price || 0);
                const lineTotal = Number(item?.lineTotal ?? (price * quantity));
                return {
                    productId: item?.productId || null,
                    variantId: item?.variantId || '',
                    title: item?.title || 'Item',
                    variantTitle: item?.variantTitle || null,
                    quantity,
                    price,
                    lineTotal,
                    imageUrl: item?.imageUrl || item?.image_url || null,
                    sku: item?.sku || null,
                    snapshot: {
                        ...item,
                        quantity,
                        unitPrice: price,
                        lineTotal,
                        capturedAt: new Date().toISOString()
                    }
                };
            });

            const subtotal = fromSubunits(Number(journey.cart_total_subunits || 0))
                || orderItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0);
            const totalWeightKg = orderItems.reduce((sum, item) => {
                const weight = Number(item?.snapshot?.weightKg || item?.weightKg || 0);
                const qty = Number(item?.quantity || 0);
                return sum + (weight * qty);
            }, 0);
            const shippingFee = shippingFeeOverrideSubunits != null
                ? fromSubunits(Number(shippingFeeOverrideSubunits || 0))
                : await computeShippingFee(connection, shippingAddress, subtotal, totalWeightKg);
            const discountTotal = 0;
            const total = subtotal + shippingFee - discountTotal;

            const paymentStatus = payment?.paymentStatus || 'paid';
            const paymentGateway = payment?.gateway || 'razorpay';
            const razorpayOrderId = payment?.razorpayOrderId || null;
            const razorpayPaymentId = payment?.razorpayPaymentId || null;
            const settlementId = payment?.settlementId || null;
            const settlementSnapshot = payment?.settlementSnapshot || null;
            const finalOrderRef = orderRef || buildOrderRef();
            const loyaltyStatus = await getUserLoyaltyStatus(userId);
            const companyProfile = await CompanyProfile.get();
            const companySnapshot = CompanyProfile.sanitizeForSnapshot(companyProfile);

            const [orderResult] = await connection.execute(
                `INSERT INTO orders
                (order_ref, user_id, status, payment_status, payment_gateway, razorpay_order_id, razorpay_payment_id, razorpay_signature, coupon_code, coupon_type, coupon_discount_value, coupon_meta, loyalty_tier, loyalty_discount_total, loyalty_shipping_discount_total, loyalty_meta, source_channel, is_abandoned_recovery, abandoned_journey_id, subtotal, shipping_fee, discount_total, total, currency, billing_address, shipping_address, company_snapshot, settlement_id, settlement_snapshot)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    finalOrderRef,
                    userId,
                    'confirmed',
                    paymentStatus,
                    paymentGateway,
                    razorpayOrderId,
                    razorpayPaymentId,
                    null,
                    null,
                    null,
                    0,
                    null,
                    String(loyaltyStatus?.tier || 'regular').toLowerCase(),
                    0,
                    0,
                    JSON.stringify({ tierProfile: loyaltyStatus?.profile || null, progress: loyaltyStatus?.progress || null }),
                    'abandoned_recovery',
                    1,
                    journey.id,
                    subtotal,
                    shippingFee,
                    discountTotal,
                    total,
                    'INR',
                    JSON.stringify(billingAddress || null),
                    JSON.stringify(shippingAddress || null),
                    JSON.stringify(companySnapshot),
                    settlementId,
                    settlementSnapshot ? JSON.stringify(settlementSnapshot) : null
                ]
            );

            const orderId = orderResult.insertId;
            await connection.execute(
                'INSERT INTO order_status_events (order_id, status) VALUES (?, ?)',
                [orderId, 'confirmed']
            );

            const values = orderItems.map((item) => ([
                orderId,
                item.productId,
                item.variantId,
                item.title,
                item.variantTitle,
                item.quantity,
                item.price,
                item.lineTotal,
                item.imageUrl,
                item.sku,
                JSON.stringify(item.snapshot || null)
            ]));
            await connection.query(
                `INSERT INTO order_items
                (order_id, product_id, variant_id, title, variant_title, quantity, price, line_total, image_url, sku, item_snapshot)
                VALUES ?`,
                [values]
            );

            await connection.execute('DELETE FROM cart_items WHERE user_id = ?', [userId]);
            await connection.commit();
            return Order.getById(orderId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getByRazorpayOrderId(razorpayOrderId) {
        const [rows] = await db.execute(
            'SELECT id FROM orders WHERE razorpay_order_id = ? ORDER BY id DESC LIMIT 1',
            [razorpayOrderId]
        );
        if (!rows.length) return null;
        return Order.getById(rows[0].id);
    }

    static async getByRazorpayPaymentId(razorpayPaymentId) {
        const [rows] = await db.execute(
            'SELECT id FROM orders WHERE razorpay_payment_id = ? ORDER BY id DESC LIMIT 1',
            [razorpayPaymentId]
        );
        if (!rows.length) return null;
        return Order.getById(rows[0].id);
    }

    static async getBySettlementId(settlementId, { limit = 100 } = {}) {
        const ref = String(settlementId || '').trim();
        if (!ref) return [];
        const safeLimit = Math.max(1, Math.min(500, Number(limit) || 100));
        const [rows] = await db.execute(
            `SELECT id
             FROM orders
             WHERE settlement_id = ?
             ORDER BY id DESC
             LIMIT ?`,
            [ref, safeLimit]
        );
        if (!rows.length) return [];
        const orders = await Promise.all(rows.map((row) => Order.getById(row.id)));
        return orders.filter(Boolean);
    }

    static async updatePaymentByRazorpayOrderId({
        razorpayOrderId,
        paymentStatus,
        razorpayPaymentId = null,
        razorpaySignature = null,
        settlementId = null,
        settlementSnapshot = null,
        refundReference = null,
        refundAmount = null,
        refundStatus = null
    }) {
        const [result] = await db.execute(
            `UPDATE orders
             SET payment_status = ?,
                 payment_gateway = 'razorpay',
                 razorpay_payment_id = COALESCE(?, razorpay_payment_id),
                 razorpay_signature = COALESCE(?, razorpay_signature),
                 settlement_id = COALESCE(?, settlement_id),
                 settlement_snapshot = COALESCE(?, settlement_snapshot),
                 refund_reference = COALESCE(?, refund_reference),
                 refund_amount = COALESCE(?, refund_amount),
                 refund_status = COALESCE(?, refund_status),
                 updated_at = CURRENT_TIMESTAMP
             WHERE razorpay_order_id = ?`,
            [
                paymentStatus,
                razorpayPaymentId,
                razorpaySignature,
                settlementId,
                settlementSnapshot ? JSON.stringify(settlementSnapshot) : null,
                refundReference,
                refundAmount,
                refundStatus,
                razorpayOrderId
            ]
        );
        return Number(result?.affectedRows || 0);
    }

    static async updateSettlementByOrderId({
        orderId,
        settlementId = null,
        settlementSnapshot = null
    } = {}) {
        const [result] = await db.execute(
            `UPDATE orders
             SET settlement_id = COALESCE(?, settlement_id),
                 settlement_snapshot = COALESCE(?, settlement_snapshot),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [settlementId, settlementSnapshot ? JSON.stringify(settlementSnapshot) : null, orderId]
        );
        return Number(result?.affectedRows || 0);
    }

    static async getPaginated({
        page = 1,
        limit = 20,
        status = 'all',
        search = '',
        startDate = '',
        endDate = '',
        quickRange = 'all',
        sortBy = 'newest'
    }) {
        const safeLimit = Math.max(1, Number(limit) || 20);
        const safePage = Math.max(1, Number(page) || 1);
        const offset = (safePage - 1) * safeLimit;
        const latestLimit = quickRange === 'latest_10' ? 10 : null;
        const includeAttemptRows = status === 'all' || status === 'failed';

        const buildDateClause = (alias, params) => {
            switch (quickRange) {
                case 'last_7_days':
                    return ` AND ${alias}.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
                case 'last_1_month':
                    return ` AND ${alias}.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)`;
                case 'last_1_year':
                    return ` AND ${alias}.created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)`;
                default: {
                    let clause = '';
                    if (startDate) {
                        clause += ` AND DATE(${alias}.created_at) >= ?`;
                        params.push(startDate);
                    }
                    if (endDate) {
                        clause += ` AND DATE(${alias}.created_at) <= ?`;
                        params.push(endDate);
                    }
                    return clause;
                }
            }
        };

        const searchClauseForOrder = (params) => {
            if (!search) return '';
            const term = `%${search}%`;
            params.push(term, term, term, term, term);
            return ' AND (o.order_ref LIKE ? OR u.name LIKE ? OR u.mobile LIKE ? OR o.razorpay_order_id LIKE ? OR o.razorpay_payment_id LIKE ?)';
        };

        const searchClauseForAttempt = (params) => {
            if (!search) return '';
            const term = `%${search}%`;
            params.push(term, term, term, term);
            return ' AND (pa.razorpay_order_id LIKE ? OR pa.razorpay_payment_id LIKE ? OR u.name LIKE ? OR u.mobile LIKE ?)';
        };

        const orderParams = [];
        let orderWhere = 'WHERE 1=1';
        if (status && status !== 'all' && status !== 'failed') {
            orderWhere += ' AND o.status = ?';
            orderParams.push(status);
        } else if (status === 'failed') {
            orderWhere += " AND (o.status = 'failed' OR LOWER(COALESCE(o.payment_status, '')) = 'failed')";
        }
        orderWhere += searchClauseForOrder(orderParams);
        orderWhere += buildDateClause('o', orderParams);

        const attemptParams = [];
        let attemptWhere = `WHERE pa.local_order_id IS NULL
            AND pa.status IN ('failed', 'attempted', 'created', 'expired')
            AND NOT EXISTS (
                SELECT 1
                FROM payment_attempts pa_success
                WHERE pa_success.user_id = pa.user_id
                  AND pa_success.created_at > pa.created_at
                  AND (
                    pa_success.local_order_id IS NOT NULL
                    OR pa_success.status = 'paid'
                  )
            )
            AND NOT (
                pa.status = 'failed'
                AND EXISTS (
                    SELECT 1
                    FROM payment_attempts pa_retry
                    WHERE pa_retry.user_id = pa.user_id
                      AND JSON_UNQUOTE(JSON_EXTRACT(pa_retry.notes, '$.retryOfAttemptId')) = CAST(pa.id AS CHAR)
                      AND (
                          pa_retry.local_order_id IS NOT NULL
                          OR pa_retry.status = 'paid'
                      )
                )
            )`;
        attemptWhere += searchClauseForAttempt(attemptParams);
        attemptWhere += buildDateClause('pa', attemptParams);

        const unionSql = `
            SELECT
                CAST(o.id AS CHAR) as id,
                'order' as entity_type,
                o.id as order_id,
                NULL as attempt_id,
                o.order_ref,
                o.user_id,
                o.status,
                o.payment_status,
                o.payment_gateway,
                o.razorpay_order_id,
                o.razorpay_payment_id,
                o.coupon_code,
                o.coupon_type,
                o.coupon_discount_value,
                o.coupon_meta,
                o.loyalty_tier,
                o.loyalty_discount_total,
                o.loyalty_shipping_discount_total,
                o.loyalty_meta,
                o.source_channel,
                o.is_abandoned_recovery,
                o.abandoned_journey_id,
                o.refund_reference,
                o.refund_amount,
                o.refund_status,
                o.subtotal,
                o.shipping_fee,
                o.discount_total,
                o.total,
                o.currency,
                o.billing_address,
                o.shipping_address,
                o.created_at,
                o.updated_at,
                u.name as customer_name,
                u.mobile as customer_mobile,
                NULL as failure_reason
            FROM orders o
            LEFT JOIN users u ON u.id = o.user_id
            ${orderWhere}
            ${includeAttemptRows ? `
            UNION ALL
            SELECT
                CONCAT('attempt_', pa.id) as id,
                'attempt' as entity_type,
                NULL as order_id,
                pa.id as attempt_id,
                CONCAT('PAY-', pa.razorpay_order_id) as order_ref,
                pa.user_id,
                'failed' as status,
                pa.status as payment_status,
                'razorpay' as payment_gateway,
                pa.razorpay_order_id,
                pa.razorpay_payment_id,
                NULL as coupon_code,
                NULL as coupon_type,
                0 as coupon_discount_value,
                NULL as coupon_meta,
                'regular' as loyalty_tier,
                0 as loyalty_discount_total,
                0 as loyalty_shipping_discount_total,
                NULL as loyalty_meta,
                NULL as source_channel,
                0 as is_abandoned_recovery,
                NULL as abandoned_journey_id,
                NULL as refund_reference,
                0 as refund_amount,
                NULL as refund_status,
                ROUND(pa.amount_subunits / 100, 2) as subtotal,
                0 as shipping_fee,
                0 as discount_total,
                ROUND(pa.amount_subunits / 100, 2) as total,
                pa.currency,
                pa.billing_address,
                pa.shipping_address,
                pa.created_at,
                pa.updated_at,
                u.name as customer_name,
                u.mobile as customer_mobile,
                pa.failure_reason
            FROM payment_attempts pa
            LEFT JOIN users u ON u.id = pa.user_id
            ${attemptWhere}` : ''}
        `;

        const queryParams = includeAttemptRows
            ? [...orderParams, ...attemptParams]
            : [...orderParams];

        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total FROM (${unionSql}) combined_rows`,
            queryParams
        );
        const totalRaw = Number(countRows[0]?.total || 0);
        const total = latestLimit ? Math.min(totalRaw, latestLimit) : totalRaw;
        if (total === 0 || offset >= total) {
            return {
                orders: [],
                total,
                totalPages: Math.ceil(total / safeLimit)
            };
        }

        const queryLimit = Math.min(safeLimit, total - offset);
        let rows = [];

        if (latestLimit) {
            const [latestRows] = await db.execute(
                `SELECT * FROM (${unionSql}) combined_rows
                 ORDER BY created_at DESC
                 LIMIT ${latestLimit}`,
                queryParams
            );
            rows = latestRows.slice(offset, offset + queryLimit);
        } else {
            const mappedOrderBy = (() => {
                if (sortBy === 'priority') {
                    return `CASE LOWER(COALESCE(loyalty_tier, 'regular'))
                        WHEN 'platinum' THEN 5
                        WHEN 'gold' THEN 4
                        WHEN 'silver' THEN 3
                        WHEN 'bronze' THEN 2
                        ELSE 1
                    END DESC, created_at DESC`;
                }
                if (sortBy === 'amount_high') return 'total DESC, created_at DESC';
                if (sortBy === 'amount_low') return 'total ASC, created_at DESC';
                if (sortBy === 'oldest') return 'created_at ASC';
                return 'created_at DESC';
            })();
            const [normalRows] = await db.execute(
                `SELECT * FROM (${unionSql}) combined_rows
                 ORDER BY ${mappedOrderBy}
                 LIMIT ? OFFSET ?`,
                [...queryParams, Number(queryLimit), Number(offset)]
            );
            rows = normalRows;
        }

        const normalized = rows.map((row) => {
            const base = {
                ...row,
                billing_address: normalizeAddress(row.billing_address),
                shipping_address: normalizeAddress(row.shipping_address),
                company_snapshot: parseJsonSafe(row.company_snapshot),
                settlement_snapshot: parseJsonSafe(row.settlement_snapshot),
                loyalty_meta: parseJsonSafe(row.loyalty_meta),
                coupon_meta: row?.coupon_meta && typeof row.coupon_meta === 'string'
                    ? (() => {
                        try { return JSON.parse(row.coupon_meta); } catch { return null; }
                    })()
                    : row.coupon_meta || null,
                items: [],
                events: []
            };
            if (row.entity_type === 'attempt') {
                return base;
            }
            return applyDefaultPending(base);
        });
        return {
            orders: normalized,
            total,
            totalPages: Math.ceil(total / safeLimit)
        };
    }

    static async getById(orderId) {
        const [orders] = await db.execute(
            `SELECT o.*, u.name as customer_name, u.mobile as customer_mobile
             FROM orders o
             LEFT JOIN users u ON u.id = o.user_id
             WHERE o.id = ?`,
            [orderId]
        );
        if (!orders.length) return null;
        const order = orders[0];
        const [items] = await db.execute(
            'SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC',
            [orderId]
        );
        const normalizedItems = items.map((item) => {
            if (item.item_snapshot && typeof item.item_snapshot === 'string') {
                try {
                    return { ...item, item_snapshot: JSON.parse(item.item_snapshot) };
                } catch {
                    return { ...item, item_snapshot: null };
                }
            }
            return item;
        });
        const [events] = await db.execute(
            'SELECT * FROM order_status_events WHERE order_id = ? ORDER BY created_at ASC',
            [orderId]
        );
        return applyDefaultPending({
            ...order,
            billing_address: normalizeAddress(order.billing_address),
            shipping_address: normalizeAddress(order.shipping_address),
            company_snapshot: parseJsonSafe(order.company_snapshot),
            settlement_snapshot: parseJsonSafe(order.settlement_snapshot),
            loyalty_meta: parseJsonSafe(order.loyalty_meta),
            coupon_meta: order?.coupon_meta && typeof order.coupon_meta === 'string'
                ? (() => {
                    try { return JSON.parse(order.coupon_meta); } catch { return null; }
                })()
                : order.coupon_meta || null,
            items: normalizedItems,
            events
        });
    }

    static async getByUser(userId) {
        const result = await Order.getByUserPaginated({ userId, page: 1, limit: 500, duration: 'all' });
        return result.orders;
    }

    static async getByUserPaginated({ userId, page = 1, limit = 10, duration = 'all' }) {
        const safeLimit = Math.max(1, Number(limit) || 10);
        const safePage = Math.max(1, Number(page) || 1);
        const offset = (safePage - 1) * safeLimit;
        let latestLimit = null;
        let where = 'WHERE o.user_id = ?';
        const params = [userId];

        if (duration === 'latest_10') {
            latestLimit = 10;
        } else if (duration && duration !== 'all') {
            const days = Number(duration);
            if (Number.isFinite(days) && days > 0) {
                where += ' AND o.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)';
                params.push(days);
            }
        }

        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total
             FROM orders o
             ${where}`,
            params
        );

        const totalRaw = Number(countRows[0]?.total || 0);
        const total = latestLimit ? Math.min(totalRaw, latestLimit) : totalRaw;
        if (total === 0 || offset >= total) {
            return {
                orders: [],
                total,
                totalPages: Math.ceil(total / safeLimit)
            };
        }

        const queryLimit = Math.min(safeLimit, total - offset);
        let orders = [];
        if (latestLimit) {
            const [latestRows] = await db.execute(
                `SELECT * FROM (
                    SELECT o.*
                    FROM orders o
                    ${where}
                    ORDER BY o.created_at DESC
                    LIMIT ${latestLimit}
                ) latest_orders
                ORDER BY latest_orders.created_at DESC
                LIMIT ? OFFSET ?`,
                [...params, Number(queryLimit), Number(offset)]
            );
            orders = latestRows;
        } else {
            const [normalRows] = await db.execute(
                `SELECT o.*
                 FROM orders o
                 ${where}
                 ORDER BY o.created_at DESC
                 LIMIT ? OFFSET ?`,
                [...params, Number(queryLimit), Number(offset)]
            );
            orders = normalRows;
        }

        if (!orders.length) {
            return {
                orders: [],
                total,
                totalPages: Math.ceil(total / safeLimit)
            };
        }

        const orderIds = orders.map(o => o.id);
        const placeholders = orderIds.map(() => '?').join(',');
        const [items] = await db.execute(
            `SELECT * FROM order_items WHERE order_id IN (${placeholders}) ORDER BY order_id DESC, id ASC`,
            orderIds
        );
        const [events] = await db.execute(
            `SELECT * FROM order_status_events WHERE order_id IN (${placeholders}) ORDER BY created_at ASC`,
            orderIds
        );
        const itemsByOrder = items.reduce((acc, item) => {
            if (item.item_snapshot && typeof item.item_snapshot === 'string') {
                try {
                    item.item_snapshot = JSON.parse(item.item_snapshot);
                } catch {
                    item.item_snapshot = null;
                }
            }
            acc[item.order_id] = acc[item.order_id] || [];
            acc[item.order_id].push(item);
            return acc;
        }, {});
        const eventsByOrder = events.reduce((acc, evt) => {
            acc[evt.order_id] = acc[evt.order_id] || [];
            acc[evt.order_id].push(evt);
            return acc;
        }, {});
        const normalizedOrders = orders.map(order => applyDefaultPending({
            ...order,
            billing_address: normalizeAddress(order.billing_address),
            shipping_address: normalizeAddress(order.shipping_address),
            company_snapshot: parseJsonSafe(order.company_snapshot),
            settlement_snapshot: parseJsonSafe(order.settlement_snapshot),
            loyalty_meta: parseJsonSafe(order.loyalty_meta),
            coupon_meta: order?.coupon_meta && typeof order.coupon_meta === 'string'
                ? (() => {
                    try { return JSON.parse(order.coupon_meta); } catch { return null; }
                })()
                : order.coupon_meta || null,
            items: itemsByOrder[order.id] || [],
            events: eventsByOrder[order.id] || []
        }));

        return {
            orders: normalizedOrders,
            total,
            totalPages: Math.ceil(total / safeLimit)
        };
    }

    static async getMetrics({ status = 'all', search = '', startDate = '', endDate = '', quickRange = 'all' } = {}) {
        const { where, params, latestLimit } = buildAdminOrderFilters({ status, search, startDate, endDate, quickRange });
        let summaryRows = [];
        if (latestLimit) {
            [summaryRows] = await db.execute(
                `SELECT
                    COUNT(*) as total_orders,
                    SUM(CASE WHEN scoped.status <> 'cancelled' THEN scoped.total ELSE 0 END) as total_revenue,
                    SUM(CASE WHEN scoped.status = 'pending' OR (scoped.status = 'confirmed' AND DATE(scoped.created_at) < CURDATE()) THEN 1 ELSE 0 END) as pending_orders,
                    SUM(CASE WHEN scoped.status = 'confirmed' AND DATE(scoped.created_at) = CURDATE() THEN 1 ELSE 0 END) as confirmed_orders,
                    SUM(CASE WHEN DATE(scoped.created_at) = CURDATE() THEN 1 ELSE 0 END) as today_orders,
                    SUM(CASE WHEN DATE(scoped.created_at) = CURDATE() AND scoped.status <> 'cancelled' THEN scoped.total ELSE 0 END) as today_revenue
                 FROM (
                    SELECT o.total, o.status, o.created_at
                    FROM orders o
                    LEFT JOIN users u ON u.id = o.user_id
                    ${where}
                    ORDER BY o.created_at DESC
                    LIMIT ${latestLimit}
                 ) scoped`,
                params
            );
        } else {
            [summaryRows] = await db.execute(
                `SELECT
                    COUNT(*) as total_orders,
                    SUM(CASE WHEN o.status <> 'cancelled' THEN o.total ELSE 0 END) as total_revenue,
                    SUM(CASE WHEN o.status = 'pending' OR (o.status = 'confirmed' AND DATE(o.created_at) < CURDATE()) THEN 1 ELSE 0 END) as pending_orders,
                    SUM(CASE WHEN o.status = 'confirmed' AND DATE(o.created_at) = CURDATE() THEN 1 ELSE 0 END) as confirmed_orders,
                    SUM(CASE WHEN DATE(o.created_at) = CURDATE() THEN 1 ELSE 0 END) as today_orders,
                    SUM(CASE WHEN DATE(o.created_at) = CURDATE() AND o.status <> 'cancelled' THEN o.total ELSE 0 END) as today_revenue
                 FROM orders o
                 LEFT JOIN users u ON u.id = o.user_id
                 ${where}`,
                params
            );
        }

        return {
            totalOrders: summaryRows[0]?.total_orders || 0,
            totalRevenue: Number(summaryRows[0]?.total_revenue || 0),
            pendingOrders: summaryRows[0]?.pending_orders || 0,
            confirmedOrders: summaryRows[0]?.confirmed_orders || 0,
            todayOrders: summaryRows[0]?.today_orders || 0,
            todayRevenue: Number(summaryRows[0]?.today_revenue || 0)
        };
    }

    static async updateStatus(orderId, status) {
        const allowed = ['pending', 'confirmed', 'shipped', 'completed', 'cancelled'];
        if (!allowed.includes(status)) {
            throw new Error('Invalid status');
        }
        await db.execute('UPDATE orders SET status = ? WHERE id = ?', [status, orderId]);
        await db.execute('INSERT INTO order_status_events (order_id, status) VALUES (?, ?)', [orderId, status]);
        return true;
    }

    static async deleteById(orderId) {
        const [result] = await db.execute('DELETE FROM orders WHERE id = ?', [orderId]);
        return Number(result?.affectedRows || 0) > 0;
    }

    static async markStaleAsPending() {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const [rows] = await connection.execute(
                `SELECT id FROM orders
                 WHERE status IN ('confirmed')
                 AND DATE(created_at) < CURDATE()`
            );
            if (rows.length === 0) {
                await connection.commit();
                return { updated: 0 };
            }
            const ids = rows.map(r => r.id);
            const placeholders = ids.map(() => '?').join(',');
            await connection.execute(
                `UPDATE orders SET status = 'pending' WHERE id IN (${placeholders})`,
                ids
            );
            const values = ids.map(id => [id, 'pending']);
            await connection.query(
                'INSERT INTO order_status_events (order_id, status) VALUES ?',
                [values]
            );
            await connection.commit();
            return { updated: ids.length, ids };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = Order;
