const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, admin } = require('../middleware/authMiddleware');
const { getSlides, getHeroTexts, getBanner, getSecondaryBanner, getFeaturedCategory, createSlide, updateBanner, updateSecondaryBanner, updateFeaturedCategory, createHeroText, updateHeroText, deleteHeroText, reorderHeroTexts, deleteSlide, reorderSlides, updateSlide } = require('../controllers/cmsController');

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
router.get('/hero-texts', getHeroTexts);
router.get('/banner', getBanner);
router.get('/banner-secondary', getSecondaryBanner);
router.get('/featured-category', getFeaturedCategory);

// Admin: Manage Slides
router.post('/hero', protect, admin, upload.single('image'), createSlide);
router.post('/hero-texts', protect, admin, createHeroText);
router.put('/hero-texts/reorder', protect, admin, reorderHeroTexts);
router.put('/hero-texts/:id', protect, admin, updateHeroText);
router.delete('/hero-texts/:id', protect, admin, deleteHeroText);
router.put('/banner', protect, admin, uploadBanner.single('image'), updateBanner);
router.put('/banner-secondary', protect, admin, uploadBanner.single('image'), updateSecondaryBanner);
router.put('/featured-category', protect, admin, updateFeaturedCategory);
router.put('/hero/reorder', protect, admin, reorderSlides);
router.put('/hero/:id', protect, admin, updateSlide);
router.delete('/hero/:id', protect, admin, deleteSlide);

module.exports = router;
