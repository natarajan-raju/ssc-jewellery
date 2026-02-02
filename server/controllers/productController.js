const Product = require('../models/Product');
const fs = require('fs');
const path = require('path');

// --- Helper to parse JSON safely ---
const safeParse = (data, fallback = []) => {
    try {
        return typeof data === 'string' ? JSON.parse(data) : (data || fallback);
    } catch {
        return fallback;
    }
};

// Helper to emit event
const notifyClients = (req, event = 'refresh:categories', payload = {}) => {
    const io = req.app.get('io');
    console.log(`Event: ${event}`, payload.id ? `for ID: ${payload.id}` : '');
    io.emit(event, payload); // Broadcast to everyone
};
// --- 1. LIST PRODUCTS ---
const getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const category = req.query.category || 'all';
        
        // Staff sees only Active? (Optional requirement, usually Staff sees all too)
        const status = req.query.status || 'all'; 
        const sort = req.query.sort || 'newest';

        const result = await Product.getPaginated(page, limit, category, status, sort);
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// --- 2. CREATE PRODUCT ---
const createProduct = async (req, res) => {
    try {
        const media = [];
        if (req.files) {
            req.files.forEach(file => media.push({ type: 'image', url: `/uploads/products/${file.filename}` }));
        }
        if (req.body.youtubeLinks) {
            safeParse(req.body.youtubeLinks).forEach(link => media.push({ type: 'youtube', url: link }));
        }

        const productData = {
            ...req.body,
            track_quantity: req.body.track_quantity === 'true' || req.body.track_quantity === true ? 1 : 0,
            quantity: req.body.quantity || 0,
            track_low_stock: req.body.track_low_stock === 'true' || req.body.track_low_stock === true ? 1 : 0,
            low_stock_threshold: req.body.low_stock_threshold || 0,
            media: media,
            categories: safeParse(req.body.categories),
            related_products: safeParse(req.body.related_products),
            additional_info: safeParse(req.body.additional_info),
            options: safeParse(req.body.options), // [NEW]
            variants: safeParse(req.body.variants) // [NEW]
        };

        const newProduct = await Product.create(productData);
        notifyClients(req, 'product:create',newProduct); // [NEW] Notify Sync
        res.status(201).json(newProduct);
    } catch (error) {
        console.error("Create Error:", error);
        res.status(500).json({ message: 'Create Failed', error: error.message });
    }
};
// --- 3. DELETE PRODUCT ---
const deleteProduct = async (req, res) => {
    try {
        await Product.delete(req.params.id);
        notifyClients(req, 'product:delete', { id: req.params.id }); // [NEW] Notify Sync
        res.json({ message: 'Product deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Delete Failed' });
    }
};

// --- 4. UPDATE PRODUCT ---
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Media Logic
        const newImages = [];
        if (req.files) {
            req.files.forEach(file => newImages.push({ type: 'image', url: `/uploads/products/${file.filename}` }));
        }
        const newYoutube = safeParse(req.body.youtubeLinks).map(link => ({ type: 'youtube', url: link }));
        const existingMedia = safeParse(req.body.existingMedia);
        const finalMedia = [...existingMedia, ...newImages, ...newYoutube];

        const productData = {
            title: req.body.title,
            subtitle: req.body.subtitle || null,
            description: req.body.description || null,
            mrp: req.body.mrp,
            discount_price: req.body.discount_price || null,
            ribbon_tag: req.body.ribbon_tag || null,
            sku: req.body.sku || null,
            weight_kg: req.body.weight_kg || null,
            status: req.body.status || 'active',
            
            track_quantity: req.body.track_quantity === 'true' || req.body.track_quantity === true ? 1 : 0,
            quantity: req.body.quantity || 0,
            track_low_stock: req.body.track_low_stock === 'true' || req.body.track_low_stock === true ? 1 : 0,
            low_stock_threshold: req.body.low_stock_threshold || 0,

            media: finalMedia,
            categories: safeParse(req.body.categories),
            related_products: safeParse(req.body.related_products),
            additional_info: safeParse(req.body.additional_info),
            options: safeParse(req.body.options), // [NEW]
            variants: safeParse(req.body.variants) // [NEW]
        };

        await Product.update(id, productData);
        notifyClients(req, 'product:update', {id, ...productData}); // [NEW] Notify Sync
        res.json({ message: 'Product updated successfully' });
    } catch (error) {
        console.error("Update Error:", error);
        res.status(500).json({ message: 'Update Failed', error: error.message });
    }


};

    // --- 5. GET CATEGORY LIST ---
const getCategories = async (req, res) => {
    try {
        const categories = await Product.getAllCategories();
        res.json(categories);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch categories' });
    }
}

// --- 6. CATEGORY MANAGEMENT ENDPOINTS ---

const getCategoryStats = async (req, res) => {
    try {
        const stats = await Product.getCategoriesWithStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching category stats' });
    }
};

const getCategoryDetails = async (req, res) => {
    try {
        const data = await Product.getCategoryDetails(req.params.id);
        if (!data) return res.status(404).json({ message: 'Category not found' });
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching category details' });
    }
};

const updateCategory = async (req, res) => {
    try {
        const { name } = req.body;
        const imageUrl = req.file ? `/uploads/categories/${req.file.filename}` : null;
        await Product.updateCategory(req.params.id, name, imageUrl);
        notifyClients(req, 'refresh:categories',{ action: 'update', id: req.params.id }); // [NEW] Notify Sync
        res.json({ message: 'Category updated' });
    } catch (error) {
        res.status(500).json({ message: 'Update failed' });
    }
};

const reorderCategory = async (req, res) => {
    try {
        const { productIds } = req.body; // Array of IDs in new order
        await Product.reorderCategoryProducts(req.params.id, productIds);
        notifyClients(req, 'refresh:categories', { action: 'reorder', categoryId: req.params.id });
        res.json({ message: 'Order updated' });
    } catch (error) {
        res.status(500).json({ message: 'Reorder failed' });
    }
};

const manageCategoryProduct = async (req, res) => {
    try {
        const { productId, action } = req.body; // action: 'add' or 'remove'
        await Product.manageCategoryProduct(req.params.id, productId, action);
        notifyClients(req, 'product:category_change', {
            id: productId,
            categoryId: req.params.id,
            action,
        }); // [NEW] Notify Sync
        // 2. To update category stats (Jumbotron counts)
        notifyClients(req, 'refresh:categories', { 
            action: 'count_update', 
            categoryId: req.params.id 
        });
        res.json({ message: 'Success' });
    } catch (error) {
        res.status(500).json({ message: 'Action failed' });
    }
};

const createCategory = async (req, res) => {
    try {
        const { name } = req.body;
        const imageUrl = req.file ? `/uploads/categories/${req.file.filename}` : null;
        if (!name) return res.status(400).json({ message: 'Name is required' });
        
        await Product.createCategory(name, imageUrl);
        notifyClients(req, 'refresh:categories', {action: 'create'}); // [NEW] Notify Sync
        res.status(201).json({ message: 'Category created' });
    } catch (error) {
        res.status(500).json({ message: error.message || 'Create failed' });
    }
};

const deleteCategory = async (req, res) => {
    try {
        await Product.deleteCategory(req.params.id);
        notifyClients(req, 'refresh:categories',{ action: 'delete', id: req.params.id }); // [NEW] Notify Sync
        res.json({ message: 'Category deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Delete failed' });
    }
};

module.exports = { getProducts, createProduct, deleteProduct, updateProduct, getCategories,
    getCategoryStats, getCategoryDetails, updateCategory, reorderCategory, manageCategoryProduct,
    createCategory, deleteCategory
 };