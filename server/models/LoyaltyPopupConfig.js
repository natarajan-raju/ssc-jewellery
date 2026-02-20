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
    static async getAdminConfig() {
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
            discountType: payload.discountType ? String(payload.discountType).trim().toLowerCase() : null,
            discountValue: payload.discountValue == null || payload.discountValue === '' ? null : Number(payload.discountValue || 0),
            couponCode: payload.couponCode ? String(payload.couponCode).trim().toUpperCase() : null,
            startsAt: payload.startsAt ? new Date(payload.startsAt) : null,
            endsAt: payload.endsAt ? new Date(payload.endsAt) : null,
            metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {}
        };
        if (next.endsAt && next.startsAt && next.endsAt.getTime() < next.startsAt.getTime()) {
            throw new Error('Popup end date must be on or after start date');
        }
        if (next.discountType && !['percent', 'fixed'].includes(next.discountType)) {
            throw new Error('Popup discount type must be percent or fixed');
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
                next.discountType,
                next.discountValue,
                next.couponCode,
                next.startsAt ? next.startsAt.toISOString().slice(0, 19).replace('T', ' ') : null,
                next.endsAt ? next.endsAt.toISOString().slice(0, 19).replace('T', ' ') : null,
                JSON.stringify(next.metadata || {})
            ]
        );
        return LoyaltyPopupConfig.getAdminConfig();
    }

    static async getClientActivePopup() {
        const [rows] = await db.execute('SELECT * FROM loyalty_popup_config WHERE id = 1 AND is_active = 1 LIMIT 1');
        if (!rows.length) return null;
        const row = normalizeRow(rows[0]);
        const now = Date.now();
        const startsAt = row.startsAt ? new Date(row.startsAt).getTime() : null;
        const endsAt = row.endsAt ? new Date(row.endsAt).getTime() : null;
        if (startsAt && startsAt > now) return null;
        if (endsAt && endsAt < now) return null;
        return row;
    }
}

module.exports = LoyaltyPopupConfig;
