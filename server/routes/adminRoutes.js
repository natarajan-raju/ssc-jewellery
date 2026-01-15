const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/authMiddleware');
const { getUsers, createUser, deleteUser, resetUserPassword } = require('../controllers/adminController');

// All routes here require login (protect) and must be either Admin or Staff
router.use(protect);
router.use(authorize('admin', 'staff'));

router.get('/users', getUsers);
router.post('/users', createUser);
router.delete('/users/:id', deleteUser);

// ✅ REVERTED TO ORIGINAL PATH:
router.put('/users/:id/reset-password', resetUserPassword);

module.exports = router;