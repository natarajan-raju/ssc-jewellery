const db = require('../config/db');
const AbandonedCart = require('./AbandonedCart');

const toSubunits = (amount) => Math.round(Number(amount || 0) * 100);
const fromSubunits = (subunits) => Number(subunits || 0) / 100;

const nowInSql = () => new Date();

const normalizeCode = (value = '') => String(value || '').trim().toUpperCase();

const randomSegment = (length = 4) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    for (let i = 0; i < length; i += 1) {
        out += chars[Math.floor(Math.random() * chars.length)];
    }
    return out;
};

const generateCouponCode = (prefix = 'SSC') => {
    const p = String(prefix || 'SSC').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6) || 'SSC';
    return `${p}-${randomSegment(4)}-${randomSegment(4)}`;
};

const parseJson = (value, fallback = null) => {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const isWithinDateWindow = (row) => {
    const now = new Date();
    const startsAt = row?.starts_at ? new Date(row.starts_at) : null;
    const expiresAt = row?.expires_at ? new Date(row.expires_at) : null;
    if (startsAt && !Number.isNaN(startsAt.getTime()) && now < startsAt) return false;
    if (expiresAt && !Number.isNaN(expiresAt.getTime()) && now > expiresAt) return false;
    return true;
};

class Coupon {
    static async generateUniqueCode({ connection = db, prefix = 'SSC' } = {}) {
        for (let i = 0; i < 10; i += 1) {
            const code = generateCouponCode(prefix);
            const [rows] = await connection.execute('SELECT id FROM coupons WHERE code = ? LIMIT 1', [code]);
            if (!rows.length) return code;
        }
        return `${String(prefix || 'SSC').toUpperCase()}-${Date.now().toString(36).toUpperCase().slice(-4)}-${randomSegment(4)}`;
    }

    static async createCoupon(payload = {}, { connection = db, createdBy = null } = {}) {
        const code = normalizeCode(payload.code || await Coupon.generateUniqueCode({ connection, prefix: payload.prefix || 'SSC' }));
        const customerTargets = Array.isArray(payload.customerTargets) ? [...new Set(payload.customerTargets.map((id) => String(id || '').trim()).filter(Boolean))] : [];
        const categoryIds = Array.isArray(payload.categoryIds) ? [...new Set(payload.categoryIds.map((id) => Number(id)).filter((n) => Number.isFinite(n) && n > 0))] : [];
        const scopeType = String(payload.scopeType || 'generic').toLowerCase();
        const sourceType = String(payload.sourceType || 'admin').toLowerCase();
        const discountType = String(payload.discountType || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent';
        const discountValue = Number(payload.discountValue || 0);
        if (!Number.isFinite(discountValue) || discountValue <= 0) {
            throw new Error('discountValue must be greater than 0');
        }
        if (!['generic', 'category', 'customer', 'tier'].includes(scopeType)) {
            throw new Error('Invalid scopeType');
        }
        const [existing] = await connection.execute('SELECT id FROM coupons WHERE code = ? LIMIT 1', [code]);
        if (existing.length) throw new Error('Coupon code already exists');

        const [result] = await connection.execute(
            `INSERT INTO coupons
                (code, name, description, source_type, scope_type, discount_type, discount_value, max_discount_subunits, min_cart_subunits, tier_scope, category_scope_json, starts_at, expires_at, usage_limit_total, usage_limit_per_user, metadata_json, is_active, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                code,
                String(payload.name || code).slice(0, 120),
                payload.description ? String(payload.description).slice(0, 255) : null,
                sourceType,
                scopeType,
                discountType,
                discountValue,
                payload.maxDiscount != null ? toSubunits(payload.maxDiscount) : null,
                payload.minCartValue != null ? toSubunits(payload.minCartValue) : 0,
                payload.tierScope ? String(payload.tierScope).toLowerCase() : null,
                categoryIds.length ? JSON.stringify(categoryIds) : null,
                payload.startsAt || null,
                payload.expiresAt || null,
                payload.usageLimitTotal != null ? Number(payload.usageLimitTotal) : null,
                Math.max(1, Number(payload.usageLimitPerUser || 1)),
                payload.metadata ? JSON.stringify(payload.metadata) : null,
                payload.isActive === false ? 0 : 1,
                createdBy || null
            ]
        );
        const couponId = Number(result.insertId);
        if (customerTargets.length) {
            for (const userId of customerTargets) {
                await connection.execute(
                    'INSERT IGNORE INTO coupon_user_targets (coupon_id, user_id) VALUES (?, ?)',
                    [couponId, userId]
                );
            }
        }
        return Coupon.getById(couponId, { connection });
    }

    static async getById(couponId, { connection = db } = {}) {
        const [rows] = await connection.execute('SELECT * FROM coupons WHERE id = ? LIMIT 1', [couponId]);
        if (!rows.length) return null;
        const coupon = rows[0];
        const [targets] = await connection.execute('SELECT user_id FROM coupon_user_targets WHERE coupon_id = ?', [couponId]);
        return {
            ...coupon,
            category_scope_json: parseJson(coupon.category_scope_json, []),
            metadata_json: parseJson(coupon.metadata_json, null),
            customerTargets: targets.map((row) => row.user_id)
        };
    }

    static async deactivateCoupon(couponId, { connection = db } = {}) {
        const id = Number(couponId || 0);
        if (!Number.isFinite(id) || id <= 0) return 0;
        const [result] = await connection.execute(
            `UPDATE coupons
             SET is_active = 0,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?
               AND is_active = 1`,
            [id]
        );
        return Number(result?.affectedRows || 0);
    }

    static async listCoupons({ page = 1, limit = 20, search = '', sourceType = 'all' } = {}, { connection = db } = {}) {
        const safePage = Math.max(1, Number(page || 1));
        const safeLimit = Math.max(1, Math.min(100, Number(limit || 20)));
        const offset = (safePage - 1) * safeLimit;
        const params = [];
        let where = 'WHERE 1=1';
        if (search) {
            where += ' AND (c.code LIKE ? OR c.name LIKE ?)';
            const term = `%${search}%`;
            params.push(term, term);
        }
        if (sourceType && sourceType !== 'all') {
            where += ' AND c.source_type = ?';
            params.push(String(sourceType).toLowerCase());
        }
        const [countRows] = await connection.execute(
            `SELECT COUNT(*) as total FROM coupons c ${where}`,
            params
        );
        const total = Number(countRows[0]?.total || 0);
        const [rows] = await connection.execute(
            `SELECT c.*,
                    (SELECT COUNT(*) FROM coupon_redemptions cr WHERE cr.coupon_id = c.id) as used_count
             FROM coupons c
             ${where}
             ORDER BY c.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, safeLimit, offset]
        );
        return {
            coupons: rows.map((row) => ({
                ...row,
                category_scope_json: parseJson(row.category_scope_json, []),
                metadata_json: parseJson(row.metadata_json, null),
                used_count: Number(row.used_count || 0)
            })),
            total,
            totalPages: Math.ceil(total / safeLimit)
        };
    }

    static async resolveRedeemableCoupon({
        code,
        userId,
        cartTotalSubunits = 0,
        loyaltyTier = 'regular',
        cartProductIds = [],
        connection = db
    } = {}) {
        const normalized = normalizeCode(code);
        if (!normalized) return null;

        const [rows] = await connection.execute(
            `SELECT c.*
             FROM coupons c
             WHERE c.code = ?
               AND c.is_active = 1
             LIMIT 1`,
            [normalized]
        );
        if (rows.length) {
            const coupon = rows[0];
            if (!isWithinDateWindow(coupon)) return null;
            const minCart = Number(coupon.min_cart_subunits || 0);
            if (Number(cartTotalSubunits || 0) < minCart) return null;

            const [totalUsageRows] = await connection.execute(
                'SELECT COUNT(*) as count FROM coupon_redemptions WHERE coupon_id = ?',
                [coupon.id]
            );
            const totalUsed = Number(totalUsageRows[0]?.count || 0);
            if (coupon.usage_limit_total != null && totalUsed >= Number(coupon.usage_limit_total || 0)) return null;

            const [userUsageRows] = await connection.execute(
                'SELECT COUNT(*) as count FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?',
                [coupon.id, userId]
            );
            const userUsed = Number(userUsageRows[0]?.count || 0);
            if (userUsed >= Math.max(1, Number(coupon.usage_limit_per_user || 1))) return null;

            const scope = String(coupon.scope_type || 'generic').toLowerCase();
            if (scope === 'customer') {
                const [targetRows] = await connection.execute(
                    'SELECT 1 FROM coupon_user_targets WHERE coupon_id = ? AND user_id = ? LIMIT 1',
                    [coupon.id, userId]
                );
                if (!targetRows.length) return null;
            }
            if (scope === 'tier') {
                const tierScope = String(coupon.tier_scope || '').toLowerCase();
                if (tierScope && tierScope !== String(loyaltyTier || 'regular').toLowerCase()) return null;
            }
            if (scope === 'category') {
                const categoryIds = parseJson(coupon.category_scope_json, []);
                if (!Array.isArray(categoryIds) || !categoryIds.length) return null;
                const products = Array.isArray(cartProductIds) ? [...new Set(cartProductIds.map((id) => String(id || '').trim()).filter(Boolean))] : [];
                if (!products.length) return null;
                const placeholders = products.map(() => '?').join(',');
                const categoryPlaceholders = categoryIds.map(() => '?').join(',');
                const [matchRows] = await connection.execute(
                    `SELECT 1
                     FROM product_categories
                     WHERE product_id IN (${placeholders})
                       AND category_id IN (${categoryPlaceholders})
                     LIMIT 1`,
                    [...products, ...categoryIds]
                );
                if (!matchRows.length) return null;
            }

            const discountType = String(coupon.discount_type || 'percent').toLowerCase() === 'fixed' ? 'fixed' : 'percent';
            let discountSubunits = 0;
            if (discountType === 'fixed') {
                discountSubunits = toSubunits(coupon.discount_value);
            } else {
                discountSubunits = Math.round(Number(cartTotalSubunits || 0) * (Number(coupon.discount_value || 0) / 100));
            }
            if (coupon.max_discount_subunits != null) {
                discountSubunits = Math.min(discountSubunits, Number(coupon.max_discount_subunits || 0));
            }
            discountSubunits = Math.max(0, Math.min(discountSubunits, Number(cartTotalSubunits || 0)));
            if (discountSubunits <= 0) return null;

            return {
                source: 'coupon',
                id: coupon.id,
                code: coupon.code,
                type: discountType,
                percent: discountType === 'percent' ? Number(coupon.discount_value || 0) : 0,
                fixedAmount: discountType === 'fixed' ? Number(coupon.discount_value || 0) : 0,
                discountSubunits,
                journeyId: null,
                couponRow: coupon
            };
        }

        const recovery = await AbandonedCart.getRedeemableDiscount({
            code: normalized,
            userId,
            cartTotalSubunits,
            connection
        });
        if (!recovery) return null;
        return {
            source: 'abandoned',
            id: recovery.id,
            code: recovery.code,
            type: recovery.discount_type || 'percent',
            percent: Number(recovery.discount_percent || 0),
            fixedAmount: 0,
            discountSubunits: Number(recovery.discountSubunits || 0),
            journeyId: recovery.journey_id || null
        };
    }

    static async markRedeemed({ source = 'coupon', id, orderId = null, userId = null, connection = db } = {}) {
        if (!id) return 0;
        if (source === 'abandoned') {
            await AbandonedCart.markDiscountRedeemed({
                discountId: id,
                orderId,
                connection
            });
            return 1;
        }
        await connection.execute(
            `INSERT INTO coupon_redemptions (coupon_id, user_id, order_id, year_key)
             VALUES (?, ?, ?, ?)`,
            [id, userId, orderId || null, new Date().getFullYear()]
        );
        return 1;
    }

    static async getAvailableCouponsForUser({
        userId,
        loyaltyTier = 'regular',
        cartTotalSubunits = 0,
        cartProductIds = []
    } = {}) {
        if (!userId) return [];
        const [rows] = await db.execute(
            `SELECT c.*,
                    (SELECT COUNT(*) FROM coupon_redemptions cr WHERE cr.coupon_id = c.id) as used_count,
                    (SELECT COUNT(*) FROM coupon_redemptions cr WHERE cr.coupon_id = c.id AND cr.user_id = ?) as used_by_user,
                    EXISTS(SELECT 1 FROM coupon_user_targets cut WHERE cut.coupon_id = c.id AND cut.user_id = ?) as is_user_target
             FROM coupons c
             WHERE c.is_active = 1
             ORDER BY c.created_at DESC
             LIMIT 100`,
            [userId, userId]
        );
        const out = [];
        for (const row of rows) {
            const scope = String(row.scope_type || 'generic').toLowerCase();
            if (!isWithinDateWindow(row)) continue;
            if (row.usage_limit_total != null && Number(row.used_count || 0) >= Number(row.usage_limit_total || 0)) continue;
            if (Number(row.used_by_user || 0) >= Math.max(1, Number(row.usage_limit_per_user || 1))) continue;
            if (Number(cartTotalSubunits || 0) < Number(row.min_cart_subunits || 0)) continue;
            if (scope === 'customer' && Number(row.is_user_target || 0) !== 1) continue;
            if (scope === 'tier') {
                const tierScope = String(row.tier_scope || '').toLowerCase();
                if (tierScope && tierScope !== String(loyaltyTier || 'regular').toLowerCase()) continue;
            }
            if (scope === 'category') {
                const categoryIds = parseJson(row.category_scope_json, []);
                if (!Array.isArray(categoryIds) || !categoryIds.length) continue;
                const products = [...new Set((cartProductIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
                if (!products.length) continue;
                const placeholders = products.map(() => '?').join(',');
                const categoryPlaceholders = categoryIds.map(() => '?').join(',');
                const [matchRows] = await db.execute(
                    `SELECT 1 FROM product_categories
                     WHERE product_id IN (${placeholders})
                       AND category_id IN (${categoryPlaceholders})
                     LIMIT 1`,
                    [...products, ...categoryIds]
                );
                if (!matchRows.length) continue;
            }
            out.push({
                id: row.id,
                code: row.code,
                name: row.name,
                sourceType: row.source_type,
                scopeType: row.scope_type,
                discountType: row.discount_type,
                discountValue: Number(row.discount_value || 0),
                minCartValue: fromSubunits(row.min_cart_subunits || 0),
                expiresAt: row.expires_at || null
            });
        }
        const [recoveryRows] = await db.execute(
            `SELECT code, discount_type, discount_percent, max_discount_subunits, min_cart_subunits, expires_at
             FROM abandoned_cart_discounts
             WHERE user_id = ?
               AND status = 'active'
               AND (expires_at IS NULL OR expires_at > NOW())
             ORDER BY id DESC
             LIMIT 30`,
            [userId]
        );
        for (const row of recoveryRows) {
            if (Number(cartTotalSubunits || 0) < Number(row.min_cart_subunits || 0)) continue;
            out.push({
                id: `abandoned:${row.code}`,
                code: row.code,
                name: 'Recovery Offer',
                sourceType: 'abandoned',
                scopeType: 'customer',
                discountType: row.discount_type || 'percent',
                discountValue: Number(row.discount_percent || 0),
                minCartValue: fromSubunits(row.min_cart_subunits || 0),
                expiresAt: row.expires_at || null
            });
        }
        return out;
    }

    static async getActiveCouponsByUser({
        userId,
        loyaltyTier = 'regular'
    } = {}) {
        if (!userId) return [];
        const [rows] = await db.execute(
            `SELECT c.*,
                    EXISTS(SELECT 1 FROM coupon_user_targets cut WHERE cut.coupon_id = c.id AND cut.user_id = ?) as is_user_target
             FROM coupons c
             WHERE c.is_active = 1
               AND (c.starts_at IS NULL OR c.starts_at <= NOW())
               AND (c.expires_at IS NULL OR c.expires_at >= NOW())
             ORDER BY c.created_at DESC
             LIMIT 100`,
            [userId]
        );
        const out = [];
        for (const row of rows) {
            const scope = String(row.scope_type || 'generic').toLowerCase();
            if (scope === 'customer' && Number(row.is_user_target || 0) !== 1) continue;
            if (scope === 'tier') {
                const tierScope = String(row.tier_scope || '').toLowerCase();
                if (tierScope && tierScope !== String(loyaltyTier || 'regular').toLowerCase()) continue;
            }
            if (!['generic', 'customer', 'tier', 'category'].includes(scope)) continue;
            out.push({
                id: row.id,
                code: row.code,
                name: row.name,
                scopeType: row.scope_type,
                discountType: row.discount_type,
                discountValue: Number(row.discount_value || 0),
                usageLimitPerUser: Number(row.usage_limit_per_user || 1),
                expiresAt: row.expires_at || null
            });
        }
        return out;
    }
}

module.exports = Coupon;
