const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, admin, staff } = require('../middleware/authMiddleware');
const { getProducts, createProduct, deleteProduct, updateProduct } = require('../controllers/productController');

// --- MULTER CONFIGURATION (Image Uploads) ---
const storage = multer.diskStorage({
    destination(req, file, cb) {
        // Save directly to Frontend Public folder for easy serving
        const uploadPath = path.join(__dirname, '../../client/public/uploads/products');
        
        // Ensure folder exists
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename(req, file, cb) {
        // Unique filename: product-timestamp.ext
        cb(null, `prod-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB Limit per file
});

// --- ROUTES ---

// 1. Get Products (Public/Protected depending on need - usually Protected)
router.get('/', protect, getProducts);

// 2. Create Product (Admin Only, supports max 10 images at once)
router.post('/', protect, admin, upload.array('images', 10), createProduct);

// 3. Delete Product (Admin Only)
router.delete('/:id', protect, admin, deleteProduct);

//4. Update Product (Admin Only) - Can be added similarly
router.put('/:id', protect, admin, upload.array('images', 10), updateProduct);

module.exports = router;