const db = require('../config/db');

class Wishlist {
    static async getByUser(userId) {
        const [rows] = await db.execute(
            `SELECT product_id
             FROM wishlist_items
             WHERE user_id = ?
             ORDER BY created_at DESC`,
            [userId]
        );
        return rows.map((row) => String(row.product_id));
    }

    static async addItem(userId, productId) {
        await db.execute(
            `INSERT INTO wishlist_items (user_id, product_id)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE created_at = CURRENT_TIMESTAMP`,
            [userId, productId]
        );
    }

    static async removeItem(userId, productId) {
        await db.execute(
            'DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?',
            [userId, productId]
        );
    }

    static async clearUser(userId) {
        await db.execute(
            'DELETE FROM wishlist_items WHERE user_id = ?',
            [userId]
        );
    }
}

module.exports = Wishlist;
