const db = require('../config/db');
const AbandonedCart = require('./AbandonedCart');
const Coupon = require('./Coupon');
const CompanyProfile = require('./CompanyProfile');
const { getUserLoyaltyStatus, calculateOrderLoyaltyAdjustments, reassessUserTier } = require('../services/loyaltyService');

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
    const diffHours = (now.getTime() - createdAt.getTime()) / (60 * 60 * 1000);
    if (!Number.isFinite(diffHours) || diffHours < 24) return order;
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

const MAX_FETCH_RANGE_DAYS = 90;

const buildAdminOrderFilters = ({ status = 'all', search = '', startDate = '', endDate = '', quickRange = 'last_90_days', sourceChannel = 'all' } = {}) => {
    const params = [];
    let where = 'WHERE 1=1';
    let latestLimit = null;

    if (status && status !== 'all') {
        const normalizedStatus = String(status || '').trim().toLowerCase();
        if (normalizedStatus === 'pending') {
            where += " AND (o.status = 'pending' OR (o.status = 'confirmed' AND TIMESTAMPDIFF(HOUR, o.created_at, UTC_TIMESTAMP()) >= 24))";
        } else if (normalizedStatus === 'confirmed') {
            where += " AND (o.status = 'confirmed' AND TIMESTAMPDIFF(HOUR, o.created_at, UTC_TIMESTAMP()) < 24)";
        } else {
            where += ' AND o.status = ?';
            params.push(normalizedStatus);
        }
    }

    if (search) {
        where += ' AND (o.order_ref LIKE ? OR u.name LIKE ? OR u.mobile LIKE ?)';
        const term = `%${search}%`;
        params.push(term, term, term);
    }

    if (sourceChannel && sourceChannel !== 'all') {
        const normalizedSource = String(sourceChannel || '').trim().toLowerCase();
        if (normalizedSource === 'abandoned_recovery') {
            where += " AND (o.is_abandoned_recovery = 1 OR LOWER(COALESCE(o.source_channel, '')) = 'abandoned_recovery')";
        } else if (normalizedSource === 'direct') {
            where += " AND (o.is_abandoned_recovery = 0 AND (COALESCE(o.source_channel, '') = '' OR LOWER(o.source_channel) <> 'abandoned_recovery'))";
        } else {
            where += ' AND LOWER(COALESCE(o.source_channel, \'\')) = ?';
            params.push(normalizedSource);
        }
    }

    switch (quickRange) {
        case 'last_7_days':
            where += ' AND o.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
            break;
        case 'last_30_days':
        case 'last_1_month':
            where += ' AND o.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)';
            break;
        case 'last_90_days':
            where += ` AND o.created_at >= DATE_SUB(NOW(), INTERVAL ${MAX_FETCH_RANGE_DAYS} DAY)`;
            break;
        case 'latest_10':
            where += ` AND o.created_at >= DATE_SUB(NOW(), INTERVAL ${MAX_FETCH_RANGE_DAYS} DAY)`;
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
            if (!startDate && !endDate) {
                where += ` AND o.created_at >= DATE_SUB(NOW(), INTERVAL ${MAX_FETCH_RANGE_DAYS} DAY)`;
            }
            break;
    }

    return { where, params, latestLimit };
};

const resolveAdminOrderSort = ({ sortBy = 'newest', quickRange = 'last_90_days' } = {}) => {
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
            const eligibleLoyaltyTier = loyaltyStatus?.eligibility?.isEligible
                ? (loyaltyStatus?.tier || 'regular')
                : 'regular';
            return Coupon.getAvailableCouponsForUser({
                userId,
                loyaltyTier: eligibleLoyaltyTier,
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
            const isMembershipEligible = Boolean(loyaltyStatus?.eligibility?.isEligible);
            const eligibleLoyaltyTier = isMembershipEligible ? (loyaltyStatus?.tier || 'regular') : 'regular';
            if (couponCode) {
                const discount = await Coupon.resolveRedeemableCoupon({
                    code: couponCode,
                    userId,
                    cartTotalSubunits: toSubunits(subtotal),
                    shippingFeeSubunits: toSubunits(shippingFee),
                    loyaltyTier: eligibleLoyaltyTier,
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
            const maxCouponDiscount = Math.max(0, subtotal + shippingFee);
            if (couponDiscountTotal > maxCouponDiscount) couponDiscountTotal = maxCouponDiscount;

            const loyaltyAdjustments = calculateOrderLoyaltyAdjustments({
                subtotal,
                shippingFee,
                couponDiscount: couponDiscountTotal,
                tier: eligibleLoyaltyTier,
                membershipEligible: isMembershipEligible
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
                loyaltyTier: eligibleLoyaltyTier,
                loyaltyProfile: loyaltyStatus?.profile || null,
                loyaltyMeta: {
                    profile: loyaltyAdjustments.profile || null,
                    progress: loyaltyStatus?.progress || null,
                    spends: loyaltyStatus?.spends || null
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
            const isMembershipEligible = Boolean(loyaltyStatus?.eligibility?.isEligible);
            const eligibleLoyaltyTier = isMembershipEligible ? (loyaltyStatus?.tier || 'regular') : 'regular';
            if (couponCode) {
                const discount = await Coupon.resolveRedeemableCoupon({
                    code: couponCode,
                    userId,
                    cartTotalSubunits: toSubunits(subtotal),
                    shippingFeeSubunits: toSubunits(shippingFee),
                    loyaltyTier: eligibleLoyaltyTier,
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
            const maxCouponDiscount = Math.max(0, subtotal + shippingFee);
            if (couponDiscountTotal > maxCouponDiscount) couponDiscountTotal = maxCouponDiscount;

            const loyaltyAdjustments = calculateOrderLoyaltyAdjustments({
                subtotal,
                shippingFee,
                couponDiscount: couponDiscountTotal,
                tier: eligibleLoyaltyTier,
                membershipEligible: isMembershipEligible
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
            const loyaltyTier = String(eligibleLoyaltyTier || 'regular').toLowerCase();
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
            await reassessUserTier(userId, { reason: 'order_paid', sendNotifications: true, notificationMode: 'upgrade_welcome' }).catch(() => {});

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
            const isMembershipEligible = Boolean(loyaltyStatus?.eligibility?.isEligible);
            const eligibleLoyaltyTier = isMembershipEligible ? (loyaltyStatus?.tier || 'regular') : 'regular';
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
                    String(eligibleLoyaltyTier || 'regular').toLowerCase(),
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
            await reassessUserTier(userId, { reason: 'order_paid', sendNotifications: true, notificationMode: 'upgrade_welcome' }).catch(() => {});
            return Order.getById(orderId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async createManualOrderFromAttempt({
        attempt = null,
        paymentGateway = 'manual',
        paymentReference = '',
        actorUserId = null
    } = {}) {
        if (!attempt || !attempt.id) throw new Error('Payment attempt is required');
        if (attempt.local_order_id) throw new Error('Attempt already linked to an order');
        const userId = String(attempt.user_id || '').trim();
        if (!userId) throw new Error('Attempt user is missing');

        const notes = parseJsonSafe(attempt.notes) || {};
        const snapshot = notes?.attemptSnapshot && typeof notes.attemptSnapshot === 'object'
            ? notes.attemptSnapshot
            : null;
        const pricing = snapshot?.pricing && typeof snapshot.pricing === 'object'
            ? snapshot.pricing
            : {};
        const loyalty = snapshot?.loyalty && typeof snapshot.loyalty === 'object'
            ? snapshot.loyalty
            : {};
        const coupon = snapshot?.coupon && typeof snapshot.coupon === 'object'
            ? snapshot.coupon
            : {};

        let snapshotItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
        if (!snapshotItems.length) {
            const [reservationRows] = await db.execute(
                `SELECT
                    pir.id,
                    pir.product_id,
                    pir.variant_id,
                    pir.quantity,
                    p.title as product_title,
                    COALESCE(pv.variant_title, '') as variant_title,
                    COALESCE(
                        NULLIF(pv.discount_price, 0),
                        NULLIF(pv.price, 0),
                        NULLIF(p.discount_price, 0),
                        NULLIF(p.mrp, 0),
                        0
                    ) as unit_price,
                    COALESCE(
                        NULLIF(pv.image_url, ''),
                        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p.media, '$[0].url')), ''),
                        ''
                    ) as image_url,
                    COALESCE(NULLIF(pv.sku, ''), NULLIF(p.sku, '')) as sku
                 FROM payment_item_reservations pir
                 LEFT JOIN products p ON p.id = pir.product_id
                 LEFT JOIN product_variants pv ON pv.id = pir.variant_id
                 WHERE pir.attempt_id = ?
                 ORDER BY pir.id ASC`,
                [attempt.id]
            );
            snapshotItems = (reservationRows || []).map((row) => {
                const quantity = Math.max(0, Number(row.quantity || 0));
                const unitPrice = Math.max(0, Number(row.unit_price || 0));
                return {
                    id: row.id,
                    productId: row.product_id,
                    variantId: row.variant_id || '',
                    title: row.product_title || 'Product',
                    variantTitle: row.variant_title || '',
                    quantity,
                    unitPrice,
                    lineTotal: Number((quantity * unitPrice).toFixed(2)),
                    imageUrl: row.image_url || '',
                    sku: row.sku || null,
                    capturedAt: new Date().toISOString()
                };
            });
        }

        if (!snapshotItems.length) {
            throw new Error('Attempt snapshot has no items to convert');
        }

        const subtotal = Number(pricing.subtotal ?? fromSubunits(attempt.amount_subunits) ?? 0);
        const shippingFee = Number(pricing.shippingFee ?? 0);
        const discountTotal = Number(pricing.discountTotal ?? 0);
        const total = Number(pricing.total ?? fromSubunits(attempt.amount_subunits) ?? 0);
        const couponDiscountTotal = Number(pricing.couponDiscountTotal ?? 0);
        const loyaltyDiscountTotal = Number(pricing.loyaltyDiscountTotal ?? 0);
        const loyaltyShippingDiscountTotal = Number(pricing.loyaltyShippingDiscountTotal ?? 0);
        const loyaltyTier = String(loyalty?.tier || 'regular').toLowerCase();

        const orderItems = snapshotItems.map((item) => {
            const quantity = Math.max(0, Number(item?.quantity || 0));
            const unitPrice = Math.max(0, Number(item?.unitPrice ?? item?.price ?? 0));
            const lineTotal = Number(item?.lineTotal ?? (quantity * unitPrice));
            return {
                productId: item?.productId || null,
                variantId: item?.variantId || '',
                title: item?.title || 'Product',
                variantTitle: item?.variantTitle || '',
                quantity,
                price: unitPrice,
                lineTotal: Number.isFinite(lineTotal) ? lineTotal : 0,
                imageUrl: item?.imageUrl || '',
                sku: item?.sku || null,
                snapshot: item && typeof item === 'object' ? item : null
            };
        });

        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            const companyProfile = await CompanyProfile.get();
            const companySnapshot = CompanyProfile.sanitizeForSnapshot(companyProfile);
            const orderRef = buildOrderRef();
            const loyaltyMeta = {
                ...(loyalty?.meta && typeof loyalty.meta === 'object' ? loyalty.meta : {}),
                source: 'attempt_snapshot_conversion',
                convertedBy: actorUserId || null,
                convertedAt: new Date().toISOString(),
                paymentReference: String(paymentReference || '').trim() || null
            };
            const couponMeta = coupon?.code ? {
                source: coupon?.source || 'coupon',
                type: coupon?.type || null,
                discountSubunits: toSubunits(couponDiscountTotal)
            } : null;

            const [orderResult] = await connection.execute(
                `INSERT INTO orders
                (order_ref, user_id, status, payment_status, payment_gateway, razorpay_order_id, razorpay_payment_id, razorpay_signature, coupon_code, coupon_type, coupon_discount_value, coupon_meta, loyalty_tier, loyalty_discount_total, loyalty_shipping_discount_total, loyalty_meta, source_channel, is_abandoned_recovery, abandoned_journey_id, subtotal, shipping_fee, discount_total, total, currency, billing_address, shipping_address, company_snapshot, settlement_id, settlement_snapshot)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    orderRef,
                    userId,
                    'confirmed',
                    'paid',
                    String(paymentGateway || 'manual').slice(0, 30),
                    null,
                    null,
                    null,
                    coupon?.code || null,
                    coupon?.type || null,
                    couponDiscountTotal,
                    couponMeta ? JSON.stringify(couponMeta) : null,
                    loyaltyTier,
                    loyaltyDiscountTotal,
                    loyaltyShippingDiscountTotal,
                    JSON.stringify(loyaltyMeta),
                    'admin_attempt_conversion',
                    0,
                    null,
                    subtotal,
                    shippingFee,
                    discountTotal,
                    total,
                    String(attempt.currency || 'INR'),
                    JSON.stringify(normalizeAddress(attempt.billing_address) || null),
                    JSON.stringify(normalizeAddress(attempt.shipping_address) || null),
                    JSON.stringify(companySnapshot),
                    null,
                    null
                ]
            );

            const orderId = orderResult.insertId;
            await connection.execute(
                'INSERT INTO order_status_events (order_id, status, actor_user_id) VALUES (?, ?, ?)',
                [orderId, 'confirmed', actorUserId || null]
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

            await connection.execute(
                `UPDATE payment_item_reservations
                 SET status = 'consumed',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE attempt_id = ?
                   AND status = 'reserved'`,
                [attempt.id]
            );
            await connection.execute(
                `UPDATE payment_attempts
                 SET local_order_id = ?,
                     status = 'paid',
                     verify_started_at = NULL,
                     verified_at = CURRENT_TIMESTAMP,
                     failure_reason = NULL,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = ?
                   AND local_order_id IS NULL`,
                [orderId, attempt.id]
            );

            await connection.commit();
            await reassessUserTier(userId, { reason: 'order_paid', sendNotifications: true, notificationMode: 'upgrade_welcome' }).catch(() => {});
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
        quickRange = 'last_90_days',
        sortBy = 'newest',
        sourceChannel = 'all'
    }) {
        const safeLimit = Math.max(1, Number(limit) || 20);
        const safePage = Math.max(1, Number(page) || 1);
        const offset = (safePage - 1) * safeLimit;
        const latestLimit = quickRange === 'latest_10' ? 10 : null;
        const includeAttemptRows = (status === 'all' || status === 'failed') && String(sourceChannel || 'all').toLowerCase() === 'all';

        const buildDateClause = (alias, params) => {
            switch (quickRange) {
                case 'last_7_days':
                    return ` AND ${alias}.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`;
                case 'last_30_days':
                case 'last_1_month':
                    return ` AND ${alias}.created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)`;
                case 'last_90_days':
                    return ` AND ${alias}.created_at >= DATE_SUB(NOW(), INTERVAL ${MAX_FETCH_RANGE_DAYS} DAY)`;
                case 'latest_10':
                    return ` AND ${alias}.created_at >= DATE_SUB(NOW(), INTERVAL ${MAX_FETCH_RANGE_DAYS} DAY)`;
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
                    if (!startDate && !endDate) {
                        clause += ` AND ${alias}.created_at >= DATE_SUB(NOW(), INTERVAL ${MAX_FETCH_RANGE_DAYS} DAY)`;
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
            const normalizedStatus = String(status || '').trim().toLowerCase();
            if (normalizedStatus === 'pending') {
                orderWhere += " AND (o.status = 'pending' OR (o.status = 'confirmed' AND TIMESTAMPDIFF(HOUR, o.created_at, UTC_TIMESTAMP()) >= 24))";
            } else if (normalizedStatus === 'confirmed') {
                orderWhere += " AND (o.status = 'confirmed' AND TIMESTAMPDIFF(HOUR, o.created_at, UTC_TIMESTAMP()) < 24)";
            } else {
                orderWhere += ' AND o.status = ?';
                orderParams.push(normalizedStatus);
            }
        } else if (status === 'failed') {
            orderWhere += " AND (o.status = 'failed' OR LOWER(COALESCE(o.payment_status, '')) = 'failed')";
        }
        if (sourceChannel && sourceChannel !== 'all') {
            const normalizedSource = String(sourceChannel || '').trim().toLowerCase();
            if (normalizedSource === 'abandoned_recovery') {
                orderWhere += " AND (o.is_abandoned_recovery = 1 OR LOWER(COALESCE(o.source_channel, '')) = 'abandoned_recovery')";
            } else if (normalizedSource === 'direct') {
                orderWhere += " AND (o.is_abandoned_recovery = 0 AND (COALESCE(o.source_channel, '') = '' OR LOWER(o.source_channel) <> 'abandoned_recovery'))";
            } else {
                orderWhere += ' AND LOWER(COALESCE(o.source_channel, \'\')) = ?';
                orderParams.push(normalizedSource);
            }
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
                NULL as attempt_notes,
                o.source_channel,
                o.is_abandoned_recovery,
                o.abandoned_journey_id,
                o.refund_reference,
                o.refund_amount,
                o.refund_status,
                o.refund_mode,
                o.refund_method,
                o.manual_refund_ref,
                o.manual_refund_utr,
                o.refund_coupon_code,
                o.refund_notes,
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
                COALESCE(NULLIF(LOWER(JSON_UNQUOTE(JSON_EXTRACT(pa.notes, '$.attemptSnapshot.loyalty.tier'))), ''), NULLIF(LOWER(ul.tier), ''), 'regular') as loyalty_tier,
                0 as loyalty_discount_total,
                0 as loyalty_shipping_discount_total,
                NULL as loyalty_meta,
                pa.notes as attempt_notes,
                NULL as source_channel,
                0 as is_abandoned_recovery,
                NULL as abandoned_journey_id,
                NULL as refund_reference,
                0 as refund_amount,
                NULL as refund_status,
                NULL as refund_mode,
                NULL as refund_method,
                NULL as manual_refund_ref,
                NULL as manual_refund_utr,
                NULL as refund_coupon_code,
                NULL as refund_notes,
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
            LEFT JOIN user_loyalty ul ON ul.user_id = pa.user_id
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

        const attemptItemMap = {};
        const attemptIds = rows
            .filter((row) => String(row?.entity_type || '').toLowerCase() === 'attempt')
            .map((row) => Number(row.attempt_id))
            .filter((id) => Number.isFinite(id) && id > 0);
        if (attemptIds.length > 0) {
            const placeholders = attemptIds.map(() => '?').join(',');
            const [attemptItems] = await db.execute(
                `SELECT
                    pir.id,
                    pir.attempt_id,
                    pir.product_id,
                    pir.variant_id,
                    pir.quantity,
                    p.title as product_title,
                    COALESCE(pv.variant_title, '') as variant_title,
                    COALESCE(
                        NULLIF(pv.discount_price, 0),
                        NULLIF(pv.price, 0),
                        NULLIF(p.discount_price, 0),
                        NULLIF(p.mrp, 0),
                        0
                    ) as unit_price,
                    COALESCE(
                        NULLIF(pv.image_url, ''),
                        NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p.media, '$[0].url')), ''),
                        ''
                    ) as image_url
                 FROM payment_item_reservations pir
                 LEFT JOIN products p ON p.id = pir.product_id
                 LEFT JOIN product_variants pv ON pv.id = pir.variant_id
                 WHERE pir.attempt_id IN (${placeholders})
                 ORDER BY pir.attempt_id ASC, pir.id ASC`,
                attemptIds
            );
            for (const item of (attemptItems || [])) {
                const attemptId = Number(item.attempt_id);
                if (!Number.isFinite(attemptId) || attemptId <= 0) continue;
                const quantity = Math.max(0, Number(item.quantity || 0));
                const unitPrice = Math.max(0, Number(item.unit_price || 0));
                const entry = {
                    id: item.id,
                    product_id: item.product_id,
                    variant_id: item.variant_id,
                    title: item.product_title || 'Product',
                    variant_title: item.variant_title || '',
                    quantity,
                    price: unitPrice,
                    line_total: Number((quantity * unitPrice).toFixed(2)),
                    image_url: item.image_url || ''
                };
                if (!attemptItemMap[attemptId]) attemptItemMap[attemptId] = [];
                attemptItemMap[attemptId].push(entry);
            }
        }

        const normalized = rows.map((row) => {
            const base = {
                ...row,
                billing_address: normalizeAddress(row.billing_address),
                shipping_address: normalizeAddress(row.shipping_address),
                company_snapshot: parseJsonSafe(row.company_snapshot),
                settlement_snapshot: parseJsonSafe(row.settlement_snapshot),
                refund_notes: parseJsonSafe(row.refund_notes),
                loyalty_meta: parseJsonSafe(row.loyalty_meta),
                attempt_notes: parseJsonSafe(row.attempt_notes),
                coupon_meta: row?.coupon_meta && typeof row.coupon_meta === 'string'
                    ? (() => {
                        try { return JSON.parse(row.coupon_meta); } catch { return null; }
                    })()
                    : row.coupon_meta || null,
                items: String(row?.entity_type || '').toLowerCase() === 'attempt'
                    ? (attemptItemMap[Number(row.attempt_id)] || [])
                    : [],
                events: []
            };
            if (row.entity_type === 'attempt') {
                const attemptNotes = base.attempt_notes && typeof base.attempt_notes === 'object'
                    ? base.attempt_notes
                    : {};
                const snapshot = attemptNotes?.attemptSnapshot && typeof attemptNotes.attemptSnapshot === 'object'
                    ? attemptNotes.attemptSnapshot
                    : null;
                const snapshotItems = Array.isArray(snapshot?.items) ? snapshot.items : [];
                const mappedSnapshotItems = snapshotItems.map((item, index) => {
                    const quantity = Math.max(0, Number(item?.quantity || 0));
                    const unitPrice = Math.max(0, Number(item?.unitPrice ?? item?.price ?? 0));
                    const lineTotal = Number(
                        item?.lineTotal != null
                            ? item.lineTotal
                            : (unitPrice * quantity)
                    );
                    return {
                        id: item?.id || `snap_${base.attempt_id}_${index + 1}`,
                        product_id: item?.productId || null,
                        variant_id: item?.variantId || '',
                        title: item?.title || 'Product',
                        variant_title: item?.variantTitle || '',
                        quantity,
                        price: unitPrice,
                        line_total: Number.isFinite(lineTotal) ? lineTotal : 0,
                        image_url: item?.imageUrl || '',
                        sku: item?.sku || null,
                        item_snapshot: item && typeof item === 'object' ? item : null
                    };
                });
                const pricing = snapshot?.pricing && typeof snapshot.pricing === 'object'
                    ? snapshot.pricing
                    : null;
                const loyalty = snapshot?.loyalty && typeof snapshot.loyalty === 'object'
                    ? snapshot.loyalty
                    : null;
                const coupon = snapshot?.coupon && typeof snapshot.coupon === 'object'
                    ? snapshot.coupon
                    : null;
                return {
                    ...base,
                    loyalty_tier: String(
                        loyalty?.tier
                        || base.loyalty_tier
                        || 'regular'
                    ).toLowerCase(),
                    loyalty_discount_total: Number(
                        pricing?.loyaltyDiscountTotal
                        ?? base.loyalty_discount_total
                        ?? 0
                    ),
                    loyalty_shipping_discount_total: Number(
                        pricing?.loyaltyShippingDiscountTotal
                        ?? base.loyalty_shipping_discount_total
                        ?? 0
                    ),
                    loyalty_meta: loyalty?.meta || base.loyalty_meta || null,
                    coupon_code: coupon?.code || base.coupon_code || null,
                    coupon_type: coupon?.type || base.coupon_type || null,
                    coupon_discount_value: Number(
                        pricing?.couponDiscountTotal
                        ?? base.coupon_discount_value
                        ?? 0
                    ),
                    subtotal: Number(pricing?.subtotal ?? base.subtotal ?? 0),
                    shipping_fee: Number(pricing?.shippingFee ?? base.shipping_fee ?? 0),
                    discount_total: Number(pricing?.discountTotal ?? base.discount_total ?? 0),
                    total: Number(pricing?.total ?? base.total ?? 0),
                    items: mappedSnapshotItems.length
                        ? mappedSnapshotItems
                        : (attemptItemMap[Number(base.attempt_id)] || [])
                };
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
            refund_notes: parseJsonSafe(order.refund_notes),
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
        const result = await Order.getByUserPaginated({ userId, page: 1, limit: 500, duration: String(MAX_FETCH_RANGE_DAYS) });
        return result.orders;
    }

    static async getByUserPaginated({ userId, page = 1, limit = 10, duration = String(MAX_FETCH_RANGE_DAYS) }) {
        const safeLimit = Math.max(1, Number(limit) || 10);
        const safePage = Math.max(1, Number(page) || 1);
        const offset = (safePage - 1) * safeLimit;
        let latestLimit = null;
        let where = 'WHERE o.user_id = ?';
        const params = [userId];

        if (duration === 'latest_10') {
            where += ` AND o.created_at >= DATE_SUB(NOW(), INTERVAL ${MAX_FETCH_RANGE_DAYS} DAY)`;
            latestLimit = 10;
        } else if (duration) {
            const days = Number(duration);
            if (Number.isFinite(days) && days > 0) {
                const safeDays = Math.min(MAX_FETCH_RANGE_DAYS, Math.max(1, Math.round(days)));
                where += ' AND o.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)';
                params.push(safeDays);
            } else {
                where += ` AND o.created_at >= DATE_SUB(NOW(), INTERVAL ${MAX_FETCH_RANGE_DAYS} DAY)`;
            }
        } else {
            where += ` AND o.created_at >= DATE_SUB(NOW(), INTERVAL ${MAX_FETCH_RANGE_DAYS} DAY)`;
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
            refund_notes: parseJsonSafe(order.refund_notes),
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

    static async getMetrics({ status = 'all', search = '', startDate = '', endDate = '', quickRange = 'last_90_days', sourceChannel = 'all' } = {}) {
        const { where, params, latestLimit } = buildAdminOrderFilters({ status, search, startDate, endDate, quickRange, sourceChannel });
        let summaryRows = [];
        if (latestLimit) {
            [summaryRows] = await db.execute(
                `SELECT
                    COUNT(*) as total_orders,
                    SUM(CASE WHEN scoped.status <> 'cancelled' THEN scoped.total ELSE 0 END) as total_revenue,
                    SUM(CASE WHEN scoped.status = 'pending' OR (scoped.status = 'confirmed' AND TIMESTAMPDIFF(HOUR, scoped.created_at, UTC_TIMESTAMP()) >= 24) THEN 1 ELSE 0 END) as pending_orders,
                    SUM(CASE WHEN scoped.status = 'confirmed' AND TIMESTAMPDIFF(HOUR, scoped.created_at, UTC_TIMESTAMP()) < 24 THEN 1 ELSE 0 END) as confirmed_orders,
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
                    SUM(CASE WHEN o.status = 'pending' OR (o.status = 'confirmed' AND TIMESTAMPDIFF(HOUR, o.created_at, UTC_TIMESTAMP()) >= 24) THEN 1 ELSE 0 END) as pending_orders,
                    SUM(CASE WHEN o.status = 'confirmed' AND TIMESTAMPDIFF(HOUR, o.created_at, UTC_TIMESTAMP()) < 24 THEN 1 ELSE 0 END) as confirmed_orders,
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

    static async updateStatus(orderId, status, options = {}) {
        const allowed = ['pending', 'confirmed', 'shipped', 'completed', 'cancelled'];
        if (!allowed.includes(status)) {
            throw new Error('Invalid status');
        }
        const {
            courierPartner = null,
            awbNumber = null,
            paymentStatus = null,
            refundReference = null,
            refundAmount = null,
            refundStatus = null,
            refundMode = null,
            refundMethod = null,
            manualRefundRef = null,
            manualRefundUtr = null,
            refundCouponCode = null,
            refundNotes = null,
            actorUserId = null
        } = options || {};
        const normalizedCourier = String(courierPartner || '').trim();
        const normalizedAwb = String(awbNumber || '').trim();
        const normalizedPaymentStatus = String(paymentStatus || '').trim().toLowerCase();
        const paymentStatusValue = normalizedPaymentStatus || null;
        const normalizedRefundMode = String(refundMode || '').trim().toLowerCase();
        const normalizedRefundMethod = String(refundMethod || '').trim();
        const normalizedManualRefundRef = String(manualRefundRef || '').trim();
        const normalizedManualRefundUtr = String(manualRefundUtr || '').trim();
        const normalizedRefundCouponCode = String(refundCouponCode || '').trim().toUpperCase();
        const normalizedRefundReference = String(refundReference || '').trim();
        const setShippedAt = status === 'shipped';
        const setCompletedAt = status === 'completed';

        await db.execute(
            `UPDATE orders
             SET status = ?,
                 payment_status = COALESCE(?, payment_status),
                 refund_reference = COALESCE(?, refund_reference),
                 refund_amount = COALESCE(?, refund_amount),
                 refund_status = COALESCE(?, refund_status),
                 courier_partner = COALESCE(?, courier_partner),
                 awb_number = COALESCE(?, awb_number),
                 refund_mode = COALESCE(?, refund_mode),
                 refund_method = COALESCE(?, refund_method),
                 manual_refund_ref = COALESCE(?, manual_refund_ref),
                 manual_refund_utr = COALESCE(?, manual_refund_utr),
                 refund_coupon_code = COALESCE(?, refund_coupon_code),
                 refund_notes = COALESCE(?, refund_notes),
                 shipped_at = CASE
                    WHEN ? THEN COALESCE(shipped_at, NOW())
                    ELSE shipped_at
                 END,
                 completed_at = CASE
                    WHEN ? THEN COALESCE(completed_at, NOW())
                    ELSE completed_at
                 END
             WHERE id = ?`,
            [
                status,
                paymentStatusValue,
                normalizedRefundReference || null,
                refundAmount != null ? Number(refundAmount) : null,
                String(refundStatus || '').trim() || null,
                normalizedCourier || null,
                normalizedAwb || null,
                normalizedRefundMode || null,
                normalizedRefundMethod || null,
                normalizedManualRefundRef || null,
                normalizedManualRefundUtr || null,
                normalizedRefundCouponCode || null,
                refundNotes ? JSON.stringify(refundNotes) : null,
                setShippedAt ? 1 : 0,
                setCompletedAt ? 1 : 0,
                orderId
            ]
        );
        await db.execute(
            'INSERT INTO order_status_events (order_id, status, actor_user_id) VALUES (?, ?, ?)',
            [orderId, status, actorUserId || null]
        );
        return true;
    }

    static async markDeliveryConfirmationReminderSent(orderId) {
        const id = Number(orderId);
        if (!Number.isFinite(id) || id <= 0) return false;
        await db.execute(
            `UPDATE orders
             SET delivery_confirmation_requested_at = NOW(),
                 delivery_confirmation_request_count = COALESCE(delivery_confirmation_request_count, 0) + 1
             WHERE id = ?`,
            [id]
        );
        return true;
    }

    static async getShippedOrdersForCustomerConfirmation({ afterDays = 7, limit = 200 } = {}) {
        const safeDays = Math.max(1, Number(afterDays) || 7);
        const safeLimit = Math.max(1, Math.min(500, Number(limit) || 200));
        const [rows] = await db.execute(
            `SELECT o.*, u.name as customer_name, u.mobile as customer_mobile, u.email as customer_email
             FROM orders o
             LEFT JOIN users u ON u.id = o.user_id
             WHERE o.status = 'shipped'
               AND o.user_id IS NOT NULL
               AND u.email IS NOT NULL
               AND (o.delivery_confirmation_requested_at IS NULL)
               AND COALESCE(o.shipped_at, o.updated_at, o.created_at) <= DATE_SUB(NOW(), INTERVAL ? DAY)
             ORDER BY COALESCE(o.shipped_at, o.updated_at, o.created_at) ASC
             LIMIT ?`,
            [safeDays, safeLimit]
        );
        return (rows || []).map((row) => applyDefaultPending({
            ...row,
            billing_address: normalizeAddress(row.billing_address),
            shipping_address: normalizeAddress(row.shipping_address),
            company_snapshot: parseJsonSafe(row.company_snapshot),
            settlement_snapshot: parseJsonSafe(row.settlement_snapshot),
            refund_notes: parseJsonSafe(row.refund_notes),
            loyalty_meta: parseJsonSafe(row.loyalty_meta),
            coupon_meta: row?.coupon_meta && typeof row.coupon_meta === 'string'
                ? (() => {
                    try { return JSON.parse(row.coupon_meta); } catch { return null; }
                })()
                : row.coupon_meta || null
        }));
    }

    static async getOverdueShippedSummary({ afterDays = 30, limit = 5 } = {}) {
        const safeDays = Math.max(1, Number(afterDays) || 30);
        const safeLimit = Math.max(1, Math.min(20, Number(limit) || 5));
        const [countRows] = await db.execute(
            `SELECT COUNT(*) AS total
             FROM orders o
             WHERE o.status = 'shipped'
               AND COALESCE(o.shipped_at, o.updated_at, o.created_at) <= DATE_SUB(NOW(), INTERVAL ? DAY)`,
            [safeDays]
        );
        const total = Number(countRows?.[0]?.total || 0);
        if (total <= 0) return { total: 0, cases: [] };

        const [rows] = await db.execute(
            `SELECT o.id, o.order_ref, o.total, o.courier_partner, o.awb_number, o.shipped_at, o.created_at,
                    u.name AS customer_name, u.mobile AS customer_mobile
             FROM orders o
             LEFT JOIN users u ON u.id = o.user_id
             WHERE o.status = 'shipped'
               AND COALESCE(o.shipped_at, o.updated_at, o.created_at) <= DATE_SUB(NOW(), INTERVAL ? DAY)
             ORDER BY COALESCE(o.shipped_at, o.updated_at, o.created_at) ASC
             LIMIT ?`,
            [safeDays, safeLimit]
        );
        return { total, cases: rows || [] };
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
