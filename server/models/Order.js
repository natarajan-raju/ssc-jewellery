const db = require('../config/db');

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
    const state = String(shippingAddress.state || '').trim().toLowerCase();

    const zone = zones.find((z) => {
        if (!z.states) return false;
        try {
            const states = JSON.parse(z.states || '[]');
            return states.some((s) => String(s).trim().toLowerCase() === state);
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

class Order {
    static async createFromCart(userId, { billingAddress, shippingAddress }) {
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
                const lineTotal = price * quantity;
                const itemWeight = Number(row.variant_weight_kg || row.product_weight_kg || 0);
                totalWeightKg += itemWeight * quantity;

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
            const discountTotal = 0;
            const total = subtotal + shippingFee - discountTotal;
            const orderRef = buildOrderRef();

            const [orderResult] = await connection.execute(
                `INSERT INTO orders 
                (order_ref, user_id, status, payment_status, subtotal, shipping_fee, discount_total, total, currency, billing_address, shipping_address)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    orderRef,
                    userId,
                    'confirmed',
                    'paid',
                    subtotal,
                    shippingFee,
                    discountTotal,
                    total,
                    'INR',
                    JSON.stringify(billingAddress || null),
                    JSON.stringify(shippingAddress || null)
                ]
            );

            const orderId = orderResult.insertId;
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
                subtotal,
                shippingFee,
                discountTotal,
                total,
                currency: 'INR',
                billingAddress: normalizeAddress(billingAddress),
                shippingAddress: normalizeAddress(shippingAddress),
                items: orderItems
            };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    static async getPaginated({ page = 1, limit = 20, status = 'all', search = '', startDate = '', endDate = '' }) {
        const offset = (page - 1) * limit;
        const params = [];
        let where = 'WHERE 1=1';

        if (status && status !== 'all') {
            where += ' AND o.status = ?';
            params.push(status);
        }
        if (search) {
            where += ' AND (o.order_ref LIKE ? OR u.name LIKE ? OR u.mobile LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term, term);
        }
        if (startDate) {
            where += ' AND DATE(o.created_at) >= ?';
            params.push(startDate);
        }
        if (endDate) {
            where += ' AND DATE(o.created_at) <= ?';
            params.push(endDate);
        }

        const [rows] = await db.execute(
            `SELECT o.*, u.name as customer_name, u.mobile as customer_mobile
             FROM orders o
             LEFT JOIN users u ON u.id = o.user_id
             ${where}
             ORDER BY o.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, Number(limit), Number(offset)]
        );

        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total FROM orders o
             LEFT JOIN users u ON u.id = o.user_id
             ${where}`,
            params
        );

        const normalized = rows.map(applyDefaultPending);
        return {
            orders: normalized,
            total: countRows[0]?.total || 0,
            totalPages: Math.ceil((countRows[0]?.total || 0) / limit)
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
            items: normalizedItems,
            events
        });
    }

    static async getByUser(userId) {
        const result = await Order.getByUserPaginated({ userId, page: 1, limit: 500, duration: 'all' });
        return result.orders;
    }

    static async getByUserPaginated({ userId, page = 1, limit = 10, duration = 'all' }) {
        const offset = (Number(page) - 1) * Number(limit);
        let where = 'WHERE o.user_id = ?';
        const params = [userId];

        if (duration && duration !== 'all') {
            const days = Number(duration);
            if (Number.isFinite(days) && days > 0) {
                where += ' AND o.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)';
                params.push(days);
            }
        }

        const [orders] = await db.execute(
            `SELECT o.*
             FROM orders o
             ${where}
             ORDER BY o.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, Number(limit), Number(offset)]
        );

        const [countRows] = await db.execute(
            `SELECT COUNT(*) as total
             FROM orders o
             ${where}`,
            params
        );

        const total = Number(countRows[0]?.total || 0);
        if (!orders.length) {
            return {
                orders: [],
                total,
                totalPages: Math.ceil(total / Number(limit || 1))
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
            items: itemsByOrder[order.id] || [],
            events: eventsByOrder[order.id] || []
        }));

        return {
            orders: normalizedOrders,
            total,
            totalPages: Math.ceil(total / Number(limit || 1))
        };
    }

    static async getMetrics() {
        const [totals] = await db.execute(
            `SELECT 
                COUNT(*) as total_orders,
                SUM(total) as total_revenue,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
                SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_orders
             FROM orders`
        );

        const [today] = await db.execute(
            `SELECT 
                COUNT(*) as today_orders,
                SUM(total) as today_revenue
             FROM orders
             WHERE DATE(created_at) = CURDATE()`
        );

        return {
            totalOrders: totals[0]?.total_orders || 0,
            totalRevenue: Number(totals[0]?.total_revenue || 0),
            pendingOrders: totals[0]?.pending_orders || 0,
            confirmedOrders: totals[0]?.confirmed_orders || 0,
            todayOrders: today[0]?.today_orders || 0,
            todayRevenue: Number(today[0]?.today_revenue || 0)
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
            return { updated: ids.length };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = Order;
