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

// 1.1 GET HOME BANNER (Public & Admin)
const getBanner = async (req, res) => {
    try {
        const [rows] = await db.execute('SELECT * FROM home_banner WHERE id = 1 LIMIT 1');
        res.json(rows[0] || null);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch banner' });
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

module.exports = { getSlides, getBanner, createSlide, updateBanner, deleteSlide, reorderSlides, updateSlide };
