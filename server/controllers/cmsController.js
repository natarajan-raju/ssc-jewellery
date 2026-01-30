const db = require('../config/db');
const fs = require('fs');
const path = require('path');

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

        res.status(201).json({ message: 'Slide added', id: result.insertId, imageUrl });
    } catch (error) {
        res.status(500).json({ message: 'Failed to create slide' });
    }
};

// 3. DELETE SLIDE
const deleteSlide = async (req, res) => {
    try {
        await db.execute('DELETE FROM hero_slides WHERE id = ?', [req.params.id]);
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
        res.json({ message: 'Slide updated' });
    } catch (error) {
        res.status(500).json({ message: 'Update failed' });
    }
};

module.exports = { getSlides, createSlide, deleteSlide, reorderSlides, updateSlide };