const db = require('../config/db');
const fs = require('fs');
const path = require('path');

const notifyClients = (req, event, payload = {}) => {
    const io = req.app.get('io');
    if (!io) return;
    io.emit(event, payload);
};

// 1. GET ALL SLIDES (Public & Admin)
const getSlides = async (req, res) => {
    try {
        const isAdmin = req.query.admin === 'true';
        let query = 'SELECT * FROM hero_slides';
        
        // If public, only show active
        if (!isAdmin) {
            query += " WHERE status = 'active'";
        }
        
        query += ' ORDER BY display_order ASC';
        
        const [slides] = await db.execute(query);
        res.json(slides);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch slides' });
    }
};

// 1.0 GET HERO TEXTS (Public & Admin)
const getHeroTexts = async (req, res) => {
    try {
        const isAdmin = req.query.admin === 'true';
        let query = 'SELECT * FROM hero_texts';
        if (!isAdmin) {
            query += " WHERE status = 'active'";
        }
        query += ' ORDER BY display_order ASC';
        const [rows] = await db.execute(query);
        res.json(rows);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch hero texts' });
    }
};

// 1.1 GET HOME BANNER (Public & Admin)
const getBanner = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM home_banner WHERE id = 1 LIMIT 1');
        res.json(rows[0] || null);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch banner' });
    }
};

const getSecondaryBanner = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM home_banner WHERE id = 2 LIMIT 1');
        res.json(rows[0] || null);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch banner' });
    }
};

const getFeaturedCategory = async (req, res) => {
    try {
        const [rows] = await db.execute(
            `SELECT h.id, h.category_id, h.title, h.subtitle, c.name AS category_name
             FROM home_featured_category h
             LEFT JOIN categories c ON c.id = h.category_id
             WHERE h.id = 1
             LIMIT 1`
        );
        let config = rows[0] || null;

        if (!config || !config.category_id || !config.category_name) {
            const [catRows] = await db.execute('SELECT id, name FROM categories ORDER BY name ASC LIMIT 1');
            if (catRows[0]) {
                config = {
                    id: 1,
                    category_id: catRows[0].id,
                    category_name: catRows[0].name,
                    title: config?.title || '',
                    subtitle: config?.subtitle || ''
                };
            }
        }

        res.json(config);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch featured category' });
    }
};

// 2. CREATE SLIDE
const createSlide = async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ message: 'Image is required' });
        
        const imageUrl = `/uploads/hero/${req.file.filename}`;
        const { title, subtitle, link } = req.body;

        // Get max order to append at end
        const [rows] = await db.execute('SELECT MAX(display_order) as maxOrder FROM hero_slides');
        const nextOrder = (rows[0].maxOrder || 0) + 1;

        const [result] = await db.execute(
            'INSERT INTO hero_slides (image_url, title, subtitle, link, display_order) VALUES (?, ?, ?, ?, ?)',
            [imageUrl, title || '', subtitle || '', link || '', nextOrder]
        );

        notifyClients(req, 'cms:hero_update', { action: 'create', id: result.insertId });
        res.status(201).json({ message: 'Slide added', id: result.insertId, imageUrl });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create slide' });
    }
};

// 2.1 UPDATE HOME BANNER (Image + Link)
const updateBanner = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM home_banner WHERE id = 1 LIMIT 1');
        const current = rows[0] || { image_url: '', link: '' };
        const imageUrl = req.file ? `/uploads/banner/${req.file.filename}` : current.image_url;
        const link = typeof req.body.link === 'string' ? req.body.link : current.link;

        await db.execute(
            'UPDATE home_banner SET image_url = ?, link = ? WHERE id = 1',
            [imageUrl, link]
        );
        notifyClients(req, 'cms:banner_update', { image_url: imageUrl, link });
        res.json({ message: 'Banner updated', image_url: imageUrl, link });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update banner' });
    }
};

const updateSecondaryBanner = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM home_banner WHERE id = 2 LIMIT 1');
        const current = rows[0] || { image_url: '', link: '' };
        const imageUrl = req.file ? `/uploads/banner/${req.file.filename}` : current.image_url;
        const link = typeof req.body.link === 'string' ? req.body.link : current.link;

        await db.execute(
            'UPDATE home_banner SET image_url = ?, link = ? WHERE id = 2',
            [imageUrl, link]
        );
        notifyClients(req, 'cms:banner_secondary_update', { image_url: imageUrl, link });
        res.json({ message: 'Banner updated', image_url: imageUrl, link });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update banner' });
    }
};

const updateFeaturedCategory = async (req, res) => {
    try {
        const { categoryId, title, subtitle } = req.body;
        await db.execute(
            'UPDATE home_featured_category SET category_id = ?, title = ?, subtitle = ? WHERE id = 1',
            [categoryId || null, title || '', subtitle || '']
        );
        const [rows] = await db.execute(
            `SELECT h.id, h.category_id, h.title, h.subtitle, c.name AS category_name
             FROM home_featured_category h
             LEFT JOIN categories c ON c.id = h.category_id
             WHERE h.id = 1
             LIMIT 1`
        );
        const payload = rows[0] || { category_id: categoryId || null, title: title || '', subtitle: subtitle || '' };
        notifyClients(req, 'cms:featured_category_update', payload);
        res.json({ message: 'Featured category updated', ...payload });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update featured category' });
    }
};

// HERO TEXTS: CREATE
const createHeroText = async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !String(text).trim()) {
            return res.status(400).json({ message: 'Text is required' });
        }
        const [rows] = await db.execute('SELECT MAX(display_order) as maxOrder FROM hero_texts');
        const nextOrder = (rows[0].maxOrder || 0) + 1;
        const [result] = await db.execute(
            'INSERT INTO hero_texts (text, display_order, status) VALUES (?, ?, ?)',
            [String(text).trim(), nextOrder, 'active']
        );
        notifyClients(req, 'cms:texts_update', { action: 'create', id: result.insertId });
        res.status(201).json({ message: 'Text added', id: result.insertId });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create hero text' });
    }
};

// HERO TEXTS: UPDATE
const updateHeroText = async (req, res) => {
    try {
        const { text, status } = req.body;
        await db.execute(
            'UPDATE hero_texts SET text = ?, status = ? WHERE id = ?',
            [text || '', status || 'active', req.params.id]
        );
        notifyClients(req, 'cms:texts_update', { action: 'update', id: req.params.id });
        res.json({ message: 'Text updated' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update hero text' });
    }
};

// HERO TEXTS: DELETE
const deleteHeroText = async (req, res) => {
    try {
        await db.execute('DELETE FROM hero_texts WHERE id = ?', [req.params.id]);
        notifyClients(req, 'cms:texts_update', { action: 'delete', id: req.params.id });
        res.json({ message: 'Text deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete hero text' });
    }
};

// HERO TEXTS: REORDER
const reorderHeroTexts = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { textIds } = req.body;
        await connection.beginTransaction();
        for (let i = 0; i < textIds.length; i++) {
            await connection.execute(
                'UPDATE hero_texts SET display_order = ? WHERE id = ?',
                [i, textIds[i]]
            );
        }
        await connection.commit();
        notifyClients(req, 'cms:texts_update', { action: 'reorder', textIds });
        res.json({ message: 'Order updated' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Reorder failed' });
    } finally {
        connection.release();
    }
};

// 3. DELETE SLIDE
const deleteSlide = async (req, res) => {
    try {
        await db.execute('DELETE FROM hero_slides WHERE id = ?', [req.params.id]);
        notifyClients(req, 'cms:hero_update', { action: 'delete', id: req.params.id });
        res.json({ message: 'Slide deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete slide' });
    }
};

// 4. REORDER SLIDES
const reorderSlides = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const { slideIds } = req.body; // Array of IDs in new order
        await connection.beginTransaction();

        for (let i = 0; i < slideIds.length; i++) {
            await connection.execute(
                'UPDATE hero_slides SET display_order = ? WHERE id = ?',
                [i, slideIds[i]]
            );
        }

        await connection.commit();
        notifyClients(req, 'cms:hero_update', { action: 'reorder', slideIds });
        res.json({ message: 'Order updated' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ message: 'Reorder failed' });
    } finally {
        connection.release();
    }
};

// 5. UPDATE SLIDE (Status/Text)
const updateSlide = async (req, res) => {
    try {
        const { title, subtitle, link, status } = req.body;
        await db.execute(
            'UPDATE hero_slides SET title = ?, subtitle = ?, link = ?, status = ? WHERE id = ?',
            [title, subtitle, link, status, req.params.id]
        );
        notifyClients(req, 'cms:hero_update', { action: 'update', id: req.params.id });
        res.json({ message: 'Slide updated' });
    } catch (error) {
        res.status(500).json({ message: 'Update failed' });
    }
};

module.exports = { getSlides, getHeroTexts, getBanner, getSecondaryBanner, getFeaturedCategory, createSlide, updateBanner, updateSecondaryBanner, updateFeaturedCategory, createHeroText, updateHeroText, deleteHeroText, reorderHeroTexts, deleteSlide, reorderSlides, updateSlide };
