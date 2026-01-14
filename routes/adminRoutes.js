const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');

// All routes here are protected and require admin role
router.get('/users', protect, admin, adminController.getUsers);
router.delete('/users/:id', protect, admin, adminController.deleteUser);
router.put('/users/:id/reset-password', protect, admin, adminController.adminResetPassword);
router.post('/users', protect, admin, adminController.createUser);
module.exports = router;