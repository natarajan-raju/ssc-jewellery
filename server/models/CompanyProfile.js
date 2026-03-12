const db = require('../config/db');

const DEFAULT_COMPANY_PROFILE = {
    displayName: 'SSC Jewellery',
    contactNumber: '',
    supportEmail: '',
    address: '',
    gstNumber: '',
    taxEnabled: false,
    instagramUrl: '',
    youtubeUrl: '',
    facebookUrl: '',
    whatsappNumber: '',
    contactJumbotronImageUrl: '/assets/contact.jpg',
    emailChannelEnabled: true,
    whatsappChannelEnabled: true,
    razorpayKeyId: '',
    razorpayEmiMinAmount: 3000,
    razorpayStartingTenureMonths: 12
};

const maskSecret = (value = '') => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.length <= 6) return `${raw.slice(0, 1)}***${raw.slice(-1)}`;
    return `${raw.slice(0, 3)}${'*'.repeat(Math.max(3, raw.length - 6))}${raw.slice(-3)}`;
};

const normalizeRow = (row) => {
    if (!row) {
        return { ...DEFAULT_COMPANY_PROFILE };
    }
    return {
        displayName: row.display_name || DEFAULT_COMPANY_PROFILE.displayName,
        contactNumber: row.contact_number || '',
        supportEmail: row.support_email || '',
        address: row.address || '',
        gstNumber: row.gst_number || '',
        taxEnabled: Number(row.tax_enabled || 0) === 1,
        instagramUrl: row.instagram_url || '',
        youtubeUrl: row.youtube_url || '',
        facebookUrl: row.facebook_url || '',
        whatsappNumber: row.whatsapp_number || '',
        contactJumbotronImageUrl: row.contact_jumbotron_image_url || DEFAULT_COMPANY_PROFILE.contactJumbotronImageUrl,
        emailChannelEnabled: Number(row.email_channel_enabled ?? 1) === 1,
        whatsappChannelEnabled: Number(row.whatsapp_channel_enabled ?? 1) === 1,
        razorpayKeyId: row.razorpay_key_id || '',
        razorpayEmiMinAmount: Math.max(1, Number(row.razorpay_emi_min_amount || DEFAULT_COMPANY_PROFILE.razorpayEmiMinAmount)),
        razorpayStartingTenureMonths: Math.max(1, Number(row.razorpay_starting_tenure_months || DEFAULT_COMPANY_PROFILE.razorpayStartingTenureMonths)),
        hasRazorpayKeySecret: Boolean(String(row.razorpay_key_secret || '').trim()),
        hasRazorpayWebhookSecret: Boolean(String(row.razorpay_webhook_secret || '').trim()),
        razorpayKeySecretMask: maskSecret(row.razorpay_key_secret || ''),
        razorpayWebhookSecretMask: maskSecret(row.razorpay_webhook_secret || ''),
        updatedAt: row.updated_at || null
    };
};

class CompanyProfile {
    static async ensureSeed() {
        await db.execute(
            `INSERT INTO company_profile
             (id, display_name, contact_number, support_email, address, gst_number, tax_enabled, instagram_url, youtube_url, facebook_url, whatsapp_number, contact_jumbotron_image_url, email_channel_enabled, whatsapp_channel_enabled, razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret, razorpay_emi_min_amount, razorpay_starting_tenure_months)
             VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE id = id`,
            [
                DEFAULT_COMPANY_PROFILE.displayName,
                DEFAULT_COMPANY_PROFILE.contactNumber,
                DEFAULT_COMPANY_PROFILE.supportEmail,
                DEFAULT_COMPANY_PROFILE.address,
                DEFAULT_COMPANY_PROFILE.gstNumber,
                DEFAULT_COMPANY_PROFILE.taxEnabled ? 1 : 0,
                DEFAULT_COMPANY_PROFILE.instagramUrl,
                DEFAULT_COMPANY_PROFILE.youtubeUrl,
                DEFAULT_COMPANY_PROFILE.facebookUrl,
                DEFAULT_COMPANY_PROFILE.whatsappNumber,
                DEFAULT_COMPANY_PROFILE.contactJumbotronImageUrl,
                DEFAULT_COMPANY_PROFILE.emailChannelEnabled ? 1 : 0,
                DEFAULT_COMPANY_PROFILE.whatsappChannelEnabled ? 1 : 0,
                DEFAULT_COMPANY_PROFILE.razorpayKeyId,
                '',
                '',
                DEFAULT_COMPANY_PROFILE.razorpayEmiMinAmount,
                DEFAULT_COMPANY_PROFILE.razorpayStartingTenureMonths
            ]
        );
    }

    static async get() {
        await CompanyProfile.ensureSeed();
        const [rows] = await db.execute('SELECT * FROM company_profile WHERE id = 1 LIMIT 1');
        return normalizeRow(rows[0] || null);
    }

    static async update(payload = {}) {
        const [existingRows] = await db.execute('SELECT * FROM company_profile WHERE id = 1 LIMIT 1');
        const existing = existingRows[0] || null;
        const existingRawKeySecret = String(existing?.razorpay_key_secret || '').trim();
        const existingRawWebhookSecret = String(existing?.razorpay_webhook_secret || '').trim();

        const incomingKeySecret = typeof payload.razorpayKeySecret === 'string'
            ? String(payload.razorpayKeySecret || '').trim()
            : null;
        const incomingWebhookSecret = typeof payload.razorpayWebhookSecret === 'string'
            ? String(payload.razorpayWebhookSecret || '').trim()
            : null;

        const next = {
            displayName: String(payload.displayName || '').trim() || DEFAULT_COMPANY_PROFILE.displayName,
            contactNumber: String(payload.contactNumber || '').trim(),
            supportEmail: String(payload.supportEmail || '').trim(),
            address: String(payload.address || '').trim(),
            gstNumber: String(payload.gstNumber || '').trim(),
            taxEnabled: payload.taxEnabled === true || payload.taxEnabled === 1 || String(payload.taxEnabled || '').toLowerCase() === 'true',
            instagramUrl: String(payload.instagramUrl || '').trim(),
            youtubeUrl: String(payload.youtubeUrl || '').trim(),
            facebookUrl: String(payload.facebookUrl || '').trim(),
            whatsappNumber: String(payload.whatsappNumber || '').trim(),
            contactJumbotronImageUrl: String(payload.contactJumbotronImageUrl || '').trim() || DEFAULT_COMPANY_PROFILE.contactJumbotronImageUrl,
            emailChannelEnabled: true,
            whatsappChannelEnabled: payload.whatsappChannelEnabled !== false,
            razorpayKeyId: String(payload.razorpayKeyId || '').trim(),
            razorpayKeySecret: incomingKeySecret !== null ? incomingKeySecret : existingRawKeySecret,
            razorpayWebhookSecret: incomingWebhookSecret !== null ? incomingWebhookSecret : existingRawWebhookSecret,
            razorpayEmiMinAmount: Math.max(1, Number(payload.razorpayEmiMinAmount || DEFAULT_COMPANY_PROFILE.razorpayEmiMinAmount)),
            razorpayStartingTenureMonths: Math.max(1, Number(payload.razorpayStartingTenureMonths || DEFAULT_COMPANY_PROFILE.razorpayStartingTenureMonths))
        };

        await db.execute(
            `INSERT INTO company_profile
             (id, display_name, contact_number, support_email, address, gst_number, tax_enabled, instagram_url, youtube_url, facebook_url, whatsapp_number, contact_jumbotron_image_url, email_channel_enabled, whatsapp_channel_enabled, razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret, razorpay_emi_min_amount, razorpay_starting_tenure_months)
             VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                display_name = VALUES(display_name),
                contact_number = VALUES(contact_number),
                support_email = VALUES(support_email),
                address = VALUES(address),
                gst_number = VALUES(gst_number),
                tax_enabled = VALUES(tax_enabled),
                instagram_url = VALUES(instagram_url),
                youtube_url = VALUES(youtube_url),
                facebook_url = VALUES(facebook_url),
                whatsapp_number = VALUES(whatsapp_number),
                contact_jumbotron_image_url = VALUES(contact_jumbotron_image_url),
                email_channel_enabled = VALUES(email_channel_enabled),
                whatsapp_channel_enabled = VALUES(whatsapp_channel_enabled),
                razorpay_key_id = VALUES(razorpay_key_id),
                razorpay_key_secret = VALUES(razorpay_key_secret),
                razorpay_webhook_secret = VALUES(razorpay_webhook_secret),
                razorpay_emi_min_amount = VALUES(razorpay_emi_min_amount),
                razorpay_starting_tenure_months = VALUES(razorpay_starting_tenure_months),
                updated_at = CURRENT_TIMESTAMP`,
            [
                next.displayName,
                next.contactNumber,
                next.supportEmail,
                next.address,
                next.gstNumber,
                next.taxEnabled ? 1 : 0,
                next.instagramUrl,
                next.youtubeUrl,
                next.facebookUrl,
                next.whatsappNumber,
                next.contactJumbotronImageUrl,
                next.emailChannelEnabled ? 1 : 0,
                next.whatsappChannelEnabled ? 1 : 0,
                next.razorpayKeyId,
                next.razorpayKeySecret,
                next.razorpayWebhookSecret,
                next.razorpayEmiMinAmount,
                next.razorpayStartingTenureMonths
            ]
        );

        return CompanyProfile.get();
    }

    static async getRazorpayConfig() {
        await CompanyProfile.ensureSeed();
        const [rows] = await db.execute(
            `SELECT razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret, razorpay_emi_min_amount, razorpay_starting_tenure_months
             FROM company_profile
             WHERE id = 1
             LIMIT 1`
        );
        const row = rows[0] || {};
        return {
            keyId: String(row.razorpay_key_id || '').trim() || String(process.env.RAZORPAY_KEY_ID || '').trim(),
            keySecret: String(row.razorpay_key_secret || '').trim() || String(process.env.RAZORPAY_KEY_SECRET || '').trim(),
            webhookSecret: String(row.razorpay_webhook_secret || '').trim() || String(process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(),
            emiMinAmount: Math.max(
                1,
                Number(row.razorpay_emi_min_amount || process.env.RAZORPAY_EMI_MIN_AMOUNT || DEFAULT_COMPANY_PROFILE.razorpayEmiMinAmount)
            ),
            startingTenureMonths: Math.max(
                1,
                Number(row.razorpay_starting_tenure_months || process.env.RAZORPAY_STARTING_TENURE_MONTHS || DEFAULT_COMPANY_PROFILE.razorpayStartingTenureMonths)
            )
        };
    }

    static sanitizeForSnapshot(profile = null) {
        const source = profile || {};
        return {
            displayName: String(source.displayName || DEFAULT_COMPANY_PROFILE.displayName),
            contactNumber: String(source.contactNumber || ''),
            supportEmail: String(source.supportEmail || ''),
            address: String(source.address || ''),
            gstNumber: String(source.gstNumber || ''),
            taxEnabled: source.taxEnabled === true || source.taxEnabled === 1,
            instagramUrl: String(source.instagramUrl || ''),
            youtubeUrl: String(source.youtubeUrl || ''),
            facebookUrl: String(source.facebookUrl || ''),
            whatsappNumber: String(source.whatsappNumber || ''),
            contactJumbotronImageUrl: String(source.contactJumbotronImageUrl || DEFAULT_COMPANY_PROFILE.contactJumbotronImageUrl),
            emailChannelEnabled: true,
            whatsappChannelEnabled: source.whatsappChannelEnabled !== false,
            razorpayKeyId: String(source.razorpayKeyId || ''),
            razorpayEmiMinAmount: Math.max(1, Number(source.razorpayEmiMinAmount || DEFAULT_COMPANY_PROFILE.razorpayEmiMinAmount)),
            razorpayStartingTenureMonths: Math.max(1, Number(source.razorpayStartingTenureMonths || DEFAULT_COMPANY_PROFILE.razorpayStartingTenureMonths)),
            capturedAt: new Date().toISOString()
        };
    }
}

module.exports = CompanyProfile;
