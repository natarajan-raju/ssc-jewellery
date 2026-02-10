const db = require('../config/db');

const parseMedia = (media) => {
    try {
        const raw = typeof media === 'string' ? JSON.parse(media) : media;
        if (!Array.isArray(raw)) return [];
        return raw.map(m => (m && typeof m === 'object' && m.url) ? m.url : m).filter(Boolean);
    } catch {
        return [];
    }
};

const normalizeVariantId = (variantId) => (variantId ? String(variantId) : '');

class Cart {
    static async getByUser(userId) {
        const [rows] = await db.execute(
            `SELECT 
                ci.user_id, ci.product_id, ci.variant_id, ci.quantity,
                p.title, p.media, p.mrp, p.discount_price, p.status, p.weight_kg as product_weight_kg,
                pv.variant_title, pv.price as variant_price, pv.discount_price as variant_discount_price, pv.image_url as variant_image_url, pv.weight_kg as variant_weight_kg
             FROM cart_items ci
             JOIN products p ON p.id = ci.product_id
             LEFT JOIN product_variants pv ON pv.id = ci.variant_id
             WHERE ci.user_id = ?
             ORDER BY ci.updated_at DESC`,
            [userId]
        );

        return rows.map(r => {
            const media = parseMedia(r.media);
            const imageUrl = r.variant_image_url || media[0] || null;
            const price = r.variant_discount_price || r.variant_price || r.discount_price || r.mrp || 0;
            return {
                productId: r.product_id,
                variantId: r.variant_id || '',
                quantity: r.quantity,
                title: r.title,
                status: r.status,
                imageUrl,
                price: Number(price),
                compareAt: Number(r.variant_price || r.mrp || 0),
                variantTitle: r.variant_title || null,
                weightKg: Number(r.variant_weight_kg || r.product_weight_kg || 0)
            };
        });
    }

    static async addItem(userId, productId, variantId, quantity = 1) {
        const vid = normalizeVariantId(variantId);
        const qty = Math.max(1, Number(quantity) || 1);
        await db.execute(
            `INSERT INTO cart_items (user_id, product_id, variant_id, quantity)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`
            , [userId, productId, vid, qty]
        );
    }

    static async setItemQuantity(userId, productId, variantId, quantity) {
        const vid = normalizeVariantId(variantId);
        const qty = Math.max(0, Number(quantity) || 0);
        if (qty <= 0) {
            await Cart.removeItem(userId, productId, vid);
            return;
        }
        await db.execute(
            'UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ? AND variant_id = ?',
            [qty, userId, productId, vid]
        );
    }

    static async removeItem(userId, productId, variantId) {
        const vid = normalizeVariantId(variantId);
        await db.execute(
            'DELETE FROM cart_items WHERE user_id = ? AND product_id = ? AND variant_id = ?',
            [userId, productId, vid]
        );
    }

    static async clearUser(userId) {
        await db.execute('DELETE FROM cart_items WHERE user_id = ?', [userId]);
    }

    static async bulkAdd(userId, items = []) {
        if (!Array.isArray(items) || items.length === 0) return;
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            for (const item of items) {
                if (!item || !item.productId) continue;
                const vid = normalizeVariantId(item.variantId);
                const qty = Math.max(1, Number(item.quantity) || 1);
                await connection.execute(
                    `INSERT INTO cart_items (user_id, product_id, variant_id, quantity)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`
                    , [userId, item.productId, vid, qty]
                );
            }
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = Cart;
