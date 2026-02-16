const db = require('../config/db');

const DEFAULT_COMPANY_PROFILE = {
    displayName: 'SSC Jewellery',
    contactNumber: '',
    supportEmail: '',
    address: '',
    instagramUrl: '',
    youtubeUrl: '',
    facebookUrl: '',
    whatsappNumber: ''
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
        instagramUrl: row.instagram_url || '',
        youtubeUrl: row.youtube_url || '',
        facebookUrl: row.facebook_url || '',
        whatsappNumber: row.whatsapp_number || '',
        updatedAt: row.updated_at || null
    };
};

class CompanyProfile {
    static async ensureSeed() {
        await db.execute(
            `INSERT INTO company_profile
             (id, display_name, contact_number, support_email, address, instagram_url, youtube_url, facebook_url, whatsapp_number)
             VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE id = id`,
            [
                DEFAULT_COMPANY_PROFILE.displayName,
                DEFAULT_COMPANY_PROFILE.contactNumber,
                DEFAULT_COMPANY_PROFILE.supportEmail,
                DEFAULT_COMPANY_PROFILE.address,
                DEFAULT_COMPANY_PROFILE.instagramUrl,
                DEFAULT_COMPANY_PROFILE.youtubeUrl,
                DEFAULT_COMPANY_PROFILE.facebookUrl,
                DEFAULT_COMPANY_PROFILE.whatsappNumber
            ]
        );
    }

    static async get() {
        await CompanyProfile.ensureSeed();
        const [rows] = await db.execute('SELECT * FROM company_profile WHERE id = 1 LIMIT 1');
        return normalizeRow(rows[0] || null);
    }

    static async update(payload = {}) {
        const next = {
            displayName: String(payload.displayName || '').trim() || DEFAULT_COMPANY_PROFILE.displayName,
            contactNumber: String(payload.contactNumber || '').trim(),
            supportEmail: String(payload.supportEmail || '').trim(),
            address: String(payload.address || '').trim(),
            instagramUrl: String(payload.instagramUrl || '').trim(),
            youtubeUrl: String(payload.youtubeUrl || '').trim(),
            facebookUrl: String(payload.facebookUrl || '').trim(),
            whatsappNumber: String(payload.whatsappNumber || '').trim()
        };

        await db.execute(
            `INSERT INTO company_profile
             (id, display_name, contact_number, support_email, address, instagram_url, youtube_url, facebook_url, whatsapp_number)
             VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                display_name = VALUES(display_name),
                contact_number = VALUES(contact_number),
                support_email = VALUES(support_email),
                address = VALUES(address),
                instagram_url = VALUES(instagram_url),
                youtube_url = VALUES(youtube_url),
                facebook_url = VALUES(facebook_url),
                whatsapp_number = VALUES(whatsapp_number),
                updated_at = CURRENT_TIMESTAMP`,
            [
                next.displayName,
                next.contactNumber,
                next.supportEmail,
                next.address,
                next.instagramUrl,
                next.youtubeUrl,
                next.facebookUrl,
                next.whatsappNumber
            ]
        );

        return CompanyProfile.get();
    }

    static sanitizeForSnapshot(profile = null) {
        const source = profile || {};
        return {
            displayName: String(source.displayName || DEFAULT_COMPANY_PROFILE.displayName),
            contactNumber: String(source.contactNumber || ''),
            supportEmail: String(source.supportEmail || ''),
            address: String(source.address || ''),
            instagramUrl: String(source.instagramUrl || ''),
            youtubeUrl: String(source.youtubeUrl || ''),
            facebookUrl: String(source.facebookUrl || ''),
            whatsappNumber: String(source.whatsappNumber || ''),
            capturedAt: new Date().toISOString()
        };
    }
}

module.exports = CompanyProfile;
