const db = require('../config/db');

const normalizeDate = (value) => {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toBool = (value) => Number(value) === 1;

const parseJson = (value, fallback = null) => {
    if (!value) return fallback;
    if (typeof value === 'object') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const normalizeRow = (row = {}) => ({
    id: Number(row.id || 1),
    isActive: toBool(row.is_active),
    title: String(row.title || ''),
    summary: String(row.summary || ''),
    content: String(row.content || ''),
    encouragement: String(row.encouragement || ''),
    imageUrl: String(row.image_url || ''),
    audioUrl: String(row.audio_url || ''),
    buttonLabel: String(row.button_label || 'Shop Now'),
    buttonLink: String(row.button_link || '/shop'),
    discountType: row.discount_type || null,
    discountValue: row.discount_value != null ? Number(row.discount_value || 0) : null,
    couponCode: row.coupon_code || null,
    startsAt: normalizeDate(row.starts_at),
    endsAt: normalizeDate(row.ends_at),
    metadata: parseJson(row.metadata_json, {}),
    updatedAt: normalizeDate(row.updated_at)
});

class LoyaltyPopupConfig {
    static async purgeExpired() {
        await db.execute(
            `DELETE FROM loyalty_popup_config
             WHERE id = 1
               AND ends_at IS NOT NULL
               AND ends_at < NOW()`
        );
    }

    static async getAdminConfig() {
        await LoyaltyPopupConfig.purgeExpired();
        const [rows] = await db.execute('SELECT * FROM loyalty_popup_config WHERE id = 1 LIMIT 1');
        if (!rows.length) return normalizeRow({});
        return normalizeRow(rows[0]);
    }

    static async updateAdminConfig(payload = {}) {
        const next = {
            isActive: Boolean(payload.isActive),
            title: String(payload.title || '').trim(),
            summary: String(payload.summary || '').trim(),
            content: String(payload.content || '').trim(),
            encouragement: String(payload.encouragement || '').trim(),
            imageUrl: String(payload.imageUrl || '').trim(),
            audioUrl: String(payload.audioUrl || '').trim(),
            buttonLabel: String(payload.buttonLabel || 'Shop Now').trim() || 'Shop Now',
            buttonLink: String(payload.buttonLink || '/shop').trim() || '/shop',
            couponCode: payload.couponCode ? String(payload.couponCode).trim().toUpperCase() : null,
            endsAt: payload.endsAt ? new Date(payload.endsAt) : null,
            metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}
        };
        if (next.couponCode) {
            const [couponRows] = await db.execute(
                `SELECT code, scope_type, is_active
                 FROM coupons
                 WHERE code = ?
                 LIMIT 1`,
                [next.couponCode]
            );
            if (!couponRows.length || Number(couponRows[0].is_active || 0) !== 1) {
                throw new Error('Selected coupon is not active');
            }
            const scope = String(couponRows[0].scope_type || 'generic').toLowerCase();
            if (scope === 'tier' || scope === 'customer') {
                throw new Error('Tier and customer specific coupons cannot be used in popup');
            }
        }
        await db.execute(
            `INSERT INTO loyalty_popup_config
                (id, is_active, title, summary, content, encouragement, image_url, audio_url, button_label, button_link, discount_type, discount_value, coupon_code, starts_at, ends_at, metadata_json)
             VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                is_active = VALUES(is_active),
                title = VALUES(title),
                summary = VALUES(summary),
                content = VALUES(content),
                encouragement = VALUES(encouragement),
                image_url = VALUES(image_url),
                audio_url = VALUES(audio_url),
                button_label = VALUES(button_label),
                button_link = VALUES(button_link),
                discount_type = VALUES(discount_type),
                discount_value = VALUES(discount_value),
                coupon_code = VALUES(coupon_code),
                starts_at = VALUES(starts_at),
                ends_at = VALUES(ends_at),
                metadata_json = VALUES(metadata_json),
                updated_at = CURRENT_TIMESTAMP`,
            [
                next.isActive ? 1 : 0,
                next.title,
                next.summary,
                next.content,
                next.encouragement,
                next.imageUrl || null,
                next.audioUrl || null,
                next.buttonLabel,
                next.buttonLink,
                null,
                null,
                next.couponCode,
                null,
                next.endsAt ? next.endsAt.toISOString().slice(0, 19).replace('T', ' ') : null,
                JSON.stringify(next.metadata || {})
            ]
        );
        return LoyaltyPopupConfig.getAdminConfig();
    }

    static async getClientActivePopup() {
        await LoyaltyPopupConfig.purgeExpired();
        const [rows] = await db.execute('SELECT * FROM loyalty_popup_config WHERE id = 1 AND is_active = 1 LIMIT 1');
        if (!rows.length) return null;
        const row = normalizeRow(rows[0]);
        const now = Date.now();
        const startsAt = row.startsAt ? new Date(row.startsAt).getTime() : null;
        const endsAt = row.endsAt ? new Date(row.endsAt).getTime() : null;
        if (startsAt && startsAt > now) return null;
        if (endsAt && endsAt < now) return null;
        if (row.couponCode) {
            const [couponRows] = await db.execute(
                `SELECT is_active, starts_at, expires_at
                 FROM coupons
                 WHERE code = ?
                 LIMIT 1`,
                [String(row.couponCode || '').trim().toUpperCase()]
            );
            const coupon = couponRows?.[0] || null;
            const couponActive = Boolean(coupon && Number(coupon.is_active || 0) === 1);
            const couponStartsAt = coupon?.starts_at ? new Date(coupon.starts_at).getTime() : null;
            const couponExpiresAt = coupon?.expires_at ? new Date(coupon.expires_at).getTime() : null;
            const couponInWindow = couponActive
                && (!couponStartsAt || couponStartsAt <= now)
                && (!couponExpiresAt || couponExpiresAt >= now);
            if (!couponInWindow) {
                await db.execute(
                    `UPDATE loyalty_popup_config
                     SET is_active = 0,
                         updated_at = CURRENT_TIMESTAMP
                     WHERE id = 1`
                );
                return null;
            }
        }
        return row;
    }
}

module.exports = LoyaltyPopupConfig;
