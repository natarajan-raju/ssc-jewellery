const fs = require('fs');
const path = require('path');
const multer = require('multer');

const createDiskStorage = (subdir) => {
    return multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadPath = path.join(__dirname, '../../client/public/uploads', subdir);
            if (!fs.existsSync(uploadPath)) {
                fs.mkdirSync(uploadPath, { recursive: true });
            }
            cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
            const safeName = file.originalname.replace(/\s+/g, '-').replace(/[^\w.-]/g, '');
            cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeName}`);
        }
    });
};

const createUploader = (subdir) => multer({ storage: createDiskStorage(subdir) });

module.exports = { createUploader };
