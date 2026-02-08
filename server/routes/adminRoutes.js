const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { getUsers, createUser, deleteUser, resetUserPassword, getUserCart } = require('../controllers/adminController');
const { getZones, createZone, updateZone, deleteZone } = require('../controllers/shippingController');

// All routes here require login (protect) and must be either Admin or Staff
router.use(protect);
router.use(authorize('admin', 'staff'));

router.get('/users', getUsers);
router.post('/users', createUser);
router.delete('/users/:id', deleteUser);
router.get('/users/:id/cart', getUserCart);

// ✅ REVERTED TO ORIGINAL PATH:
router.put('/users/:id/reset-password', resetUserPassword);

router.get('/shipping/zones', getZones);
router.post('/shipping/zones', createZone);
router.put('/shipping/zones/:id', updateZone);
router.delete('/shipping/zones/:id', deleteZone);

module.exports = router;
