const db = require('../config/db');

class Wishlist {
    static async getByUser(userId) {
        const [rows] = await db.execute(
            `SELECT product_id, variant_id
             FROM wishlist_items
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );
        return rows.map((row) => ({
            productId: String(row.product_id || ''),
            variantId: String(row.variant_id || '')
        }));
    }

    static async addItem(userId, productId, variantId = '') {
        await db.execute(
            `INSERT INTO wishlist_items (user_id, product_id, variant_id)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP`,
            [userId, productId, String(variantId || '').trim()]
        );
    }

    static async removeItem(userId, productId, variantId = '', { removeAllVariants = false } = {}) {
        const normalizedVariantId = String(variantId || '').trim();
        if (removeAllVariants) {
            await db.execute(
                'DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?',
                [userId, productId]
            );
            return;
        }
        await db.execute(
            'DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ? AND variant_id = ?',
            [userId, productId, normalizedVariantId]
        );
    }

    static async removeForCartAdd(userId, productId, variantId = '') {
        const normalizedVariantId = String(variantId || '').trim();
        const [result] = await db.execute(
            `DELETE FROM wishlist_items
             WHERE user_id = ?
               AND product_id = ?
               AND (variant_id = '' OR variant_id = ?)`,
            [userId, productId, normalizedVariantId]
        );
        return Number(result?.affectedRows || 0);
    }

    static async clearUser(userId) {
        await db.execute(
            'DELETE FROM wishlist_items WHERE user_id = ?',
            [userId]
        );
    }
}

module.exports = Wishlist;
