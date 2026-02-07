const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, admin } = require('../middleware/authMiddleware');
const { getSlides, getBanner, createSlide, updateBanner, deleteSlide, reorderSlides, updateSlide } = require('../controllers/cmsController');

// --- MULTER STORAGE FOR HERO IMAGES ---
const storage = multer.diskStorage({
    destination(req, file, cb) {
        const uploadPath = path.join(__dirname, '../../client/public/uploads/hero');
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename(req, file, cb) {
        cb(null, `hero-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage });

const bannerStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = path.join(__dirname, '../../client/public/uploads/banner');
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        cb(null, `banner-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const uploadBanner = multer({ storage: bannerStorage });

// --- ROUTES ---

// Public: Get Slides
router.get('/hero', getSlides);
router.get('/banner', getBanner);

// Admin: Manage Slides
router.post('/hero', protect, admin, upload.single('image'), createSlide);
router.put('/banner', protect, admin, uploadBanner.single('image'), updateBanner);
router.put('/hero/reorder', protect, admin, reorderSlides);
router.put('/hero/:id', protect, admin, updateSlide);
router.delete('/hero/:id', protect, admin, deleteSlide);

module.exports = router;
