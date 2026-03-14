const fs = require('fs');
const path = require('path');

const DEFAULT_UPLOADS_ROOT = path.resolve(__dirname, '../../client/public/uploads');

const getUploadsRoot = () => {
    const configuredRoot = String(process.env.UPLOADS_ROOT || '').trim();
    return configuredRoot ? path.resolve(configuredRoot) : DEFAULT_UPLOADS_ROOT;
};

const ensureUploadsSubdir = (subdir = '') => {
    const targetDir = path.join(getUploadsRoot(), String(subdir || '').trim());
    if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
    }
    return targetDir;
};

const resolveUploadedAssetPath = (assetUrl = '') => {
    const raw = String(assetUrl || '').trim();
    if (!raw.startsWith('/uploads/')) return null;

    const uploadsRoot = getUploadsRoot();
    const absolutePath = path.join(uploadsRoot, raw.replace(/^\/uploads\/+/, ''));
    if (!absolutePath.startsWith(uploadsRoot)) return null;
    return absolutePath;
};

module.exports = {
    getUploadsRoot,
    ensureUploadsSubdir,
    resolveUploadedAssetPath,
    DEFAULT_UPLOADS_ROOT
};
