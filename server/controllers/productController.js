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
// --- 1. LIST PRODUCTS ---
const getProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const category = req.query.category || 'all';
        
        // Staff sees only Active? (Optional requirement, usually Staff sees all too)
        const status = req.query.status || 'all'; 

        const result = await Product.getPaginated(page, limit, category, status);
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
            additional_info: safeParse(req.body.additional_info),
            options: safeParse(req.body.options), // [NEW]
            variants: safeParse(req.body.variants) // [NEW]
        };

        const newProduct = await Product.create(productData);
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
            additional_info: safeParse(req.body.additional_info),
            options: safeParse(req.body.options), // [NEW]
            variants: safeParse(req.body.variants) // [NEW]
        };

        await Product.update(id, productData);
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

module.exports = { getProducts, createProduct, deleteProduct, updateProduct, getCategories };