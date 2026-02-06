const db = require('../config/db'); 

class User {
    
    // --- 1. GET ALL (Ordered by Role & Date) ---
    static async getAll() {
        const [rows] = await db.execute(`
            SELECT * FROM users 
            ORDER BY 
                CASE 
                WHEN role = 'admin' THEN 3
                WHEN role = 'staff' THEN 2
                ELSE 1
                END DESC, 
                createdAt DESC
        `);
        return rows;
    }

    // --- 2. PAGINATION (Pure SQL) ---
    static async getPaginated(page = 1, limit = 10, roleFilter = null) {
        const offset = (page - 1) * limit;
        
        let query = `SELECT u.*,
            (SELECT COUNT(*) FROM cart_items ci WHERE ci.user_id = u.id) as cart_count
            FROM users u`;
        let countQuery = 'SELECT COUNT(*) as total FROM users';
        const params = [];
        
        // Filter Logic
        if (roleFilter && roleFilter !== 'all') {
            query += ' WHERE u.role = ?';
            countQuery += ' WHERE role = ?';
            params.push(roleFilter);
        }

        // Sort Logic (Admin > Staff > Customer)
        query += ` 
            ORDER BY 
                CASE 
                WHEN u.role = 'admin' THEN 3
                WHEN u.role = 'staff' THEN 2
                ELSE 1
                END DESC, 
                u.createdAt DESC
            LIMIT ? OFFSET ?`;
        
        params.push(parseInt(limit), parseInt(offset));

        const [users] = await db.execute(query, params);
        const [countResult] = await db.execute(countQuery, roleFilter && roleFilter !== 'all' ? [roleFilter] : []);
        
        return {
            users,
            total: countResult[0].total,
            totalPages: Math.ceil(countResult[0].total / limit)
        };
    }

    // --- 3. FIND HELPERS ---
    static async findByEmail(email) {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0];
    }

    static async findByMobile(mobile) {
        const [rows] = await db.execute('SELECT * FROM users WHERE mobile = ?', [mobile]);
        return rows[0];
    }

    static async findById(id) {
        const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
        return rows[0];
    }

    // --- 4. CREATE USER ---
    static async create(userData) {
        const baseData = {
            ...userData,
            role: userData.role || 'customer',
            createdAt: new Date()
        };

        // Generate ID: Timestamp + Random (8-12 chars)
        const timePart = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 6);
        const uniqueId = `${timePart}${randomPart}`;

        const query = `INSERT INTO users (id, name, email, mobile, password, role, address, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const addressJson = baseData.address ? JSON.stringify(baseData.address) : null;
        
        await db.execute(query, [
            uniqueId, baseData.name, baseData.email, baseData.mobile, 
            baseData.password, baseData.role, addressJson, baseData.createdAt
        ]);
        
        return { id: uniqueId, ...baseData };
    }

    // --- 5. DELETE USER (Transaction Safe) ---
    static async delete(id) {
        let connection;
        try {
            connection = await db.getConnection();
            await connection.beginTransaction();

            // 1. Find mobile to clean up OTPs
            const [userRows] = await connection.query('SELECT mobile FROM users WHERE id = ?', [id]);
            if (userRows.length > 0) {
                await connection.query('DELETE FROM otps WHERE mobile = ?', [userRows[0].mobile]);
            }

            // 2. Delete User
            await connection.query('DELETE FROM users WHERE id = ?', [id]);

            await connection.commit();
            return true;
        } catch (error) {
            if (connection) await connection.rollback();
            throw error;
        } finally {
            if (connection) connection.release();
        }
    }

    // --- 6. UPDATE PASSWORD ---
    static async updatePasswordById(id, hashedPassword) {
        await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
        return true;
    }
    
    // Legacy support if needed
    static async updatePassword(mobile, hashedPassword) {
        await db.execute('UPDATE users SET password = ? WHERE mobile = ?', [hashedPassword, mobile]);
        return true;
    }

    static async updateProfile(id, data) {
        const updates = [];
        const values = [];

        if (data.mobile) {
            updates.push('mobile = ?');
            values.push(data.mobile);
        }
        if (data.password) {
            updates.push('password = ?');
            values.push(data.password);
        }

        if (updates.length === 0) return;

        values.push(id);
        const query = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
        await db.execute(query, values);
    }
}

module.exports = User;
