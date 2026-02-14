const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { createOrderFromCheckout, createRazorpayOrder, retryRazorpayPayment, verifyRazorpayPayment, handleRazorpayWebhook, getAdminOrders, getAdminOrderById, getMyOrders, updateOrderStatus } = require('../controllers/orderController');

router.post('/checkout', protect, createOrderFromCheckout);
router.post('/razorpay/order', protect, createRazorpayOrder);
router.post('/razorpay/retry', protect, retryRazorpayPayment);
router.post('/razorpay/verify', protect, verifyRazorpayPayment);
router.post('/razorpay/webhook', handleRazorpayWebhook);
router.get('/admin', protect, authorize('admin', 'staff'), getAdminOrders);
router.get('/admin/:id', protect, authorize('admin', 'staff'), getAdminOrderById);
router.put('/admin/:id/status', protect, authorize('admin', 'staff'), updateOrderStatus);
router.get('/my', protect, getMyOrders);

module.exports = router;
