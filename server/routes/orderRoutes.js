const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { createOrderFromCheckout, getAdminOrders, getAdminOrderById, getMyOrders, updateOrderStatus } = require('../controllers/orderController');

router.post('/checkout', protect, createOrderFromCheckout);
router.get('/admin', protect, authorize('admin', 'staff'), getAdminOrders);
router.get('/admin/:id', protect, authorize('admin', 'staff'), getAdminOrderById);
router.put('/admin/:id/status', protect, authorize('admin', 'staff'), updateOrderStatus);
router.get('/my', protect, getMyOrders);

module.exports = router;
