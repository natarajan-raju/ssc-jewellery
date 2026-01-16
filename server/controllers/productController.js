const Product = require('../models/Product');
const fs = require('fs');
const path = require('path');

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
        // req.body contains text fields
        // req.files contains uploaded images
        
        const media = [];

        // 1. Process Uploaded Images
        if (req.files) {
            req.files.forEach(file => {
                media.push({
                    type: 'image',
                    url: `/uploads/products/${file.filename}`
                });
            });
        }

        // 2. Process YouTube Links (Sent as a JSON string or array in body)
        if (req.body.youtubeLinks) {
            const links = JSON.parse(req.body.youtubeLinks);
            links.forEach(link => {
                media.push({ type: 'youtube', url: link });
            });
        }

        // 3. Prepare Data
        const productData = {
            ...req.body,
            media: media, // Combined Media Array
            categories: req.body.categories ? JSON.parse(req.body.categories) : []
        };

        const newProduct = await Product.create(productData);
        res.status(201).json(newProduct);
    } catch (error) {
        console.error(error);
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
        console.log(`📝 Updating Product: ${id}`);

        // 1. Handle New Images (Uploaded via Multer)
        const newImages = [];
        if (req.files && req.files.length > 0) {
            req.files.forEach(file => {
                newImages.push({
                    type: 'image',
                    url: `/uploads/products/${file.filename}`
                });
            });
        }

        // 2. Handle New YouTube Links (Parsed from JSON)
        let newYoutube = [];
        if (req.body.youtubeLinks) {
            try {
                const links = JSON.parse(req.body.youtubeLinks);
                if (Array.isArray(links)) {
                    newYoutube = links.map(link => ({ type: 'youtube', url: link }));
                }
            } catch (e) {
                console.error("Error parsing youtubeLinks:", e);
            }
        }

        // 3. Handle Existing Media (Parsed from JSON)
        // This preserves images/videos that were NOT deleted by the user
        let existingMedia = [];
        if (req.body.existingMedia) {
            try {
                existingMedia = JSON.parse(req.body.existingMedia);
            } catch (e) {
                console.error("Error parsing existingMedia:", e);
            }
        }

        // 4. Combine All Media
        // Order: Existing Items + New Images + New YouTube
        const finalMedia = [...existingMedia, ...newImages, ...newYoutube];

        // 5. Prepare Update Data
        // We use || null to prevent 'undefined' errors in MySQL
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
            
            // Inventory Logic
            track_quantity: req.body.track_quantity === 'true' || req.body.track_quantity === true ? 1 : 0,
            quantity: req.body.quantity || 0,
            track_low_stock: req.body.track_low_stock === 'true' || req.body.track_low_stock === true ? 1 : 0,
            low_stock_threshold: req.body.low_stock_threshold || 0,

            // JSON Fields
            media: finalMedia,
            categories: req.body.categories ? JSON.parse(req.body.categories) : []
        };

        await Product.update(id, productData);
        res.json({ message: 'Product updated successfully', product: { id, ...productData } });

    } catch (error) {
        console.error("❌ Update Product Error:", error);
        res.status(500).json({ message: 'Update Failed', error: error.message });
    }
};

module.exports = { getProducts, createProduct, deleteProduct, updateProduct };