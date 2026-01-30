const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { protect, admin, staff } = require('../middleware/authMiddleware');
const { getProducts, createProduct, deleteProduct, updateProduct, getCategories, getCategoryStats, getCategoryDetails, updateCategory, reorderCategory, manageCategoryProduct, createCategory, deleteCategory } = require('../controllers/productController');

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

const categoryStorage = multer.diskStorage({
    destination(req, file, cb) {
        // Save to a specific categories folder
        const uploadPath = path.join(__dirname, '../../client/public/uploads/categories');
        if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename(req, file, cb) {
        cb(null, `cat-${Date.now()}${path.extname(file.originalname)}`);
    }
});

const upload = multer({ 
    storage,
    limits: { fileSize: 8 * 1024 * 1024 } // 5MB Limit per file
});

const uploadCategoryImage = multer({ 
    storage: categoryStorage,
    limits: { fileSize: 8 * 1024 * 1024 } // 5MB Limit per file
});

// --- ROUTES ---

// 1. Get Products (Public/Protected depending on need - usually Protected)
router.get('/', protect, getProducts);

// 2. Create Product (Admin Only, supports max 10 images at once)
router.post('/', protect, admin, upload.array('images', 10), createProduct);

// --- CATEGORY MANAGEMENT ROUTES (NEW) ---
// 1. Get Stats (List with counts)
router.get('/categories/stats', protect, getCategoryStats);

// 2. Get Single Category Details (with ordered products)
router.get('/categories/:id', protect, getCategoryDetails);

// 3. Update Category Name
router.put('/categories/:id', protect, admin, uploadCategoryImage.single('image'), updateCategory);

// 4. Reorder Products in Category
router.put('/categories/:id/reorder', protect, admin, reorderCategory);

// 5. Add/Remove Product from Category
router.post('/categories/:id/products', protect, admin, manageCategoryProduct);

// 3. Delete Product (Admin Only)
router.delete('/:id', protect, admin, deleteProduct);

//4. Update Product (Admin Only) - Can be added similarly
router.put('/:id', protect, admin, upload.array('images', 10), updateProduct);

router.get('/categories', protect, getCategories);
// 6. Create Category
router.post('/categories', protect, admin, uploadCategoryImage.single('image'), createCategory);

// 7. Delete Category
router.delete('/categories/:id', protect, admin, deleteCategory);

module.exports = router;