const express = require('express');
const { protect, authorize } = require('../middleware/authMiddleware');
const { createUploader } = require('../utils/upload');

const router = express.Router();
const uploadProfile = createUploader('profile');
const uploadPopup = createUploader('popup');
const uploadContact = createUploader('contact');

router.post('/profile-image', protect, uploadProfile.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No image uploaded' });
    }
    const url = `/uploads/profile/${req.file.filename}`;
    res.json({ url });
});

router.post('/popup-image', protect, uploadPopup.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No image uploaded' });
    }
    const url = `/uploads/popup/${req.file.filename}`;
    return res.json({ url });
});

router.post('/popup-audio', protect, uploadPopup.single('audio'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No audio uploaded' });
    }
    const url = `/uploads/popup/${req.file.filename}`;
    return res.json({ url });
});

router.post('/contact-jumbotron-image', protect, authorize('admin', 'staff'), uploadContact.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No image uploaded' });
    }
    const url = `/uploads/contact/${req.file.filename}`;
    return res.json({ url });
});

module.exports = router;
