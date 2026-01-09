const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Define the 4 main authentication endpoints
router.post('/send-otp', authController.sendOtp);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/reset-password', authController.resetPassword);

module.exports = router;