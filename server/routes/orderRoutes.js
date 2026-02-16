const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { createOrderFromCheckout, createRazorpayOrder, retryRazorpayPayment, verifyRazorpayPayment, handleRazorpayWebhook, getAdminOrders, getAdminOrderById, getMyOrders, getMyOrderByPaymentRef, updateOrderStatus, fetchAdminPaymentStatus, fetchMyPaymentStatus, deleteAdminOrder, deleteAdminPaymentAttempt, validateRecoveryCoupon, downloadMyInvoicePdf, downloadAdminInvoicePdf } = require('../controllers/orderController');

router.post('/checkout', protect, createOrderFromCheckout);
router.post('/razorpay/order', protect, createRazorpayOrder);
router.post('/coupon/validate', protect, validateRecoveryCoupon);
router.post('/razorpay/retry', protect, retryRazorpayPayment);
router.post('/razorpay/verify', protect, verifyRazorpayPayment);
router.post('/razorpay/webhook', handleRazorpayWebhook);
router.get('/admin', protect, authorize('admin', 'staff'), getAdminOrders);
router.get('/admin/:id', protect, authorize('admin', 'staff'), getAdminOrderById);
router.put('/admin/:id/status', protect, authorize('admin', 'staff'), updateOrderStatus);
router.delete('/admin/:id', protect, authorize('admin', 'staff'), deleteAdminOrder);
router.delete('/admin/attempt/:id', protect, authorize('admin', 'staff'), deleteAdminPaymentAttempt);
router.post('/admin/payment/fetch-status', protect, authorize('admin', 'staff'), fetchAdminPaymentStatus);
router.get('/admin/:id/invoice', protect, authorize('admin', 'staff'), downloadAdminInvoicePdf);
router.get('/my', protect, getMyOrders);
router.get('/my/payment/:paymentId', protect, getMyOrderByPaymentRef);
router.post('/my/payment/fetch-status', protect, fetchMyPaymentStatus);
router.get('/my/:id/invoice', protect, downloadMyInvoicePdf);

module.exports = router;
