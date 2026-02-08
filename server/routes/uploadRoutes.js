const express = require('express');
const { protect } = require('../middleware/authMiddleware');
const { createUploader } = require('../utils/upload');

const router = express.Router();
const uploadProfile = createUploader('profile');

router.post('/profile-image', protect, uploadProfile.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ message: 'No image uploaded' });
    }
    const url = `/uploads/profile/${req.file.filename}`;
    res.json({ url });
});

module.exports = router;
