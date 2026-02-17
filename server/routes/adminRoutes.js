const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { getUsers, createUser, deleteUser, resetUserPassword, getUserCart, verifyEmailChannel, sendTestEmail, getCompanyInfo, updateCompanyInfo, getLoyaltyConfig, updateLoyaltyConfig, listCoupons, createCoupon, issueCouponToUser, getUserActiveCoupons } = require('../controllers/adminController');
const { getZones, createZone, updateZone, deleteZone } = require('../controllers/shippingController');
const {
    getAbandonedCartCampaign,
    updateAbandonedCartCampaign,
    processAbandonedCartRecoveriesNow,
    listAbandonedCartJourneys,
    getAbandonedCartJourneyTimeline,
    getAbandonedCartInsights
} = require('../controllers/communicationsController');

// All routes here require login (protect) and must be either Admin or Staff
router.use(protect);
router.use(authorize('admin', 'staff'));

router.get('/users', getUsers);
router.post('/users', createUser);
router.delete('/users/:id', deleteUser);
router.get('/users/:id/cart', getUserCart);
router.get('/users/:id/coupons/active', getUserActiveCoupons);
router.post('/users/:id/coupons', issueCouponToUser);

// ✅ REVERTED TO ORIGINAL PATH:
router.put('/users/:id/reset-password', resetUserPassword);

router.get('/shipping/zones', getZones);
router.post('/shipping/zones', createZone);
router.put('/shipping/zones/:id', updateZone);
router.delete('/shipping/zones/:id', deleteZone);

// Communications (Email now, WhatsApp later)
router.get('/communications/email/verify', verifyEmailChannel);
router.post('/communications/email/test', sendTestEmail);
router.get('/communications/abandoned-carts/campaign', getAbandonedCartCampaign);
router.put('/communications/abandoned-carts/campaign', updateAbandonedCartCampaign);
router.post('/communications/abandoned-carts/process', processAbandonedCartRecoveriesNow);
router.get('/communications/abandoned-carts/insights', getAbandonedCartInsights);
router.get('/communications/abandoned-carts/journeys', listAbandonedCartJourneys);
router.get('/communications/abandoned-carts/journeys/:id/timeline', getAbandonedCartJourneyTimeline);
router.get('/company-info', getCompanyInfo);
router.put('/company-info', updateCompanyInfo);
router.get('/loyalty/config', getLoyaltyConfig);
router.put('/loyalty/config', updateLoyaltyConfig);
router.get('/loyalty/coupons', listCoupons);
router.post('/loyalty/coupons', createCoupon);

module.exports = router;
