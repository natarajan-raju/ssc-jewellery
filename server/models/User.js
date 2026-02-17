const db = require('../config/db'); 

class User {
    static normalizeRow(row) {
        if (!row) return row;
        const parseJson = (value) => {
            if (!value) return null;
            if (typeof value === 'object') return value;
            try {
                return JSON.parse(value);
            } catch {
                return null;
            }
        };
        return {
            ...row,
            address: parseJson(row.address),
            billingAddress: parseJson(row.billing_address),
            profileImage: row.profile_image || null,
            loyaltyTier: String(row.loyalty_tier || row.loyaltyTier || 'regular').toLowerCase(),
            totalOrders: Number(row.total_orders || row.totalOrders || 0),
            totalSpend: Number(row.total_spend || row.totalSpend || 0),
            avgOrderValue: Number(row.avg_order_value || row.avgOrderValue || 0),
            lastOrderAt: row.last_order_at || row.lastOrderAt || null,
            activeCouponCount: Number(row.active_coupon_count || row.activeCouponCount || 0),
            dob: row.dob
                ? (row.dob instanceof Date
                    ? `${row.dob.getFullYear()}-${String(row.dob.getMonth() + 1).padStart(2, '0')}-${String(row.dob.getDate()).padStart(2, '0')}`
                    : String(row.dob).slice(0, 10))
                : null,
            dobLocked: row.dob_locked === 1 || row.dob_locked === true,
            birthdayOfferClaimedYear: row.birthday_offer_claimed_year ?? null
        };
    }
    
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
        return rows.map(User.normalizeRow);
    }

    // --- 2. PAGINATION (Pure SQL) ---
    static async getPaginated(page = 1, limit = 10, roleFilter = null) {
        const offset = (page - 1) * limit;
        
        let query = `SELECT u.*,
            COALESCE(ul.tier, 'regular') as loyalty_tier,
            (SELECT COUNT(*) FROM cart_items ci WHERE ci.user_id = u.id) as cart_count,
            (SELECT COUNT(*) FROM orders o WHERE o.user_id = u.id AND LOWER(COALESCE(o.payment_status, '')) IN ('paid', 'captured') AND LOWER(COALESCE(o.status, '')) <> 'cancelled') as total_orders,
            (SELECT COALESCE(SUM(o.total), 0) FROM orders o WHERE o.user_id = u.id AND LOWER(COALESCE(o.payment_status, '')) IN ('paid', 'captured') AND LOWER(COALESCE(o.status, '')) <> 'cancelled') as total_spend,
            (SELECT COALESCE(AVG(o.total), 0) FROM orders o WHERE o.user_id = u.id AND LOWER(COALESCE(o.payment_status, '')) IN ('paid', 'captured') AND LOWER(COALESCE(o.status, '')) <> 'cancelled') as avg_order_value,
            (SELECT MAX(o.created_at) FROM orders o WHERE o.user_id = u.id AND LOWER(COALESCE(o.payment_status, '')) IN ('paid', 'captured') AND LOWER(COALESCE(o.status, '')) <> 'cancelled') as last_order_at,
            (
                SELECT COUNT(*)
                FROM coupons c
                LEFT JOIN coupon_user_targets cut ON cut.coupon_id = c.id AND cut.user_id = u.id
                WHERE c.is_active = 1
                  AND (c.starts_at IS NULL OR c.starts_at <= NOW())
                  AND (c.expires_at IS NULL OR c.expires_at >= NOW())
                  AND (
                    c.scope_type = 'generic'
                    OR (c.scope_type = 'customer' AND cut.user_id IS NOT NULL)
                    OR (c.scope_type = 'tier' AND LOWER(COALESCE(c.tier_scope, '')) = LOWER(COALESCE(ul.tier, 'regular')))
                  )
            ) as active_coupon_count
            FROM users u
            LEFT JOIN user_loyalty ul ON ul.user_id = u.id`;
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
            users: users.map(User.normalizeRow),
            total: countResult[0].total,
            totalPages: Math.ceil(countResult[0].total / limit)
        };
    }

    // --- 3. FIND HELPERS ---
    static async findByEmail(email) {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        return User.normalizeRow(rows[0]);
    }

    static async findByMobile(mobile) {
        const [rows] = await db.execute('SELECT * FROM users WHERE mobile = ?', [mobile]);
        return User.normalizeRow(rows[0]);
    }

    static async findById(id) {
        const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
        return User.normalizeRow(rows[0]);
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

        const query = `INSERT INTO users (id, name, email, mobile, password, role, dob, address, billing_address, profile_image, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const addressJson = baseData.address ? JSON.stringify(baseData.address) : null;
        const billingJson = baseData.billingAddress ? JSON.stringify(baseData.billingAddress) : null;
        
        await db.execute(query, [
            uniqueId, baseData.name, baseData.email, baseData.mobile, 
            baseData.password, baseData.role, baseData.dob || null, addressJson, billingJson, baseData.profileImage || null, baseData.createdAt
        ]);
        
        return { id: uniqueId, ...baseData, dobLocked: false, birthdayOfferClaimedYear: null };
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

        if (data.name) {
            updates.push('name = ?');
            values.push(data.name);
        }
        if (data.email) {
            updates.push('email = ?');
            values.push(data.email);
        }
        if (data.mobile) {
            updates.push('mobile = ?');
            values.push(data.mobile);
        }
        if (data.address !== undefined) {
            updates.push('address = ?');
            values.push(data.address ? JSON.stringify(data.address) : null);
        }
        if (data.billingAddress !== undefined) {
            updates.push('billing_address = ?');
            values.push(data.billingAddress ? JSON.stringify(data.billingAddress) : null);
        }
        if (data.profileImage !== undefined) {
            updates.push('profile_image = ?');
            values.push(data.profileImage || null);
        }
        if (data.dob !== undefined) {
            updates.push('dob = ?');
            values.push(data.dob || null);
        }
        if (data.dobLocked !== undefined) {
            updates.push('dob_locked = ?');
            values.push(data.dobLocked ? 1 : 0);
        }
        if (data.birthdayOfferClaimedYear !== undefined) {
            updates.push('birthday_offer_claimed_year = ?');
            values.push(data.birthdayOfferClaimedYear || null);
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
