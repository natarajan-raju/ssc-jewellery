const db = require('../config/db');

class Product {
    // --- 1. GET PAGINATED (With Category Filter) ---
    static async getPaginated(page = 1, limit = 10, category = null, status = null) {
        const offset = (page - 1) * limit;
        const params = [];
        
        let query = 'SELECT * FROM products';
        let countQuery = 'SELECT COUNT(*) as total FROM products';

        // Filters
        const conditions = [];
        
        if (category && category !== 'all') {
            // JSON_CONTAINS checks if the category exists in the JSON array
            conditions.push('JSON_CONTAINS(categories, ?)');
            params.push(JSON.stringify(category));
        }

        if (status && status !== 'all') {
            conditions.push('status = ?');
            params.push(status);
        }

        if (conditions.length > 0) {
            const whereClause = ' WHERE ' + conditions.join(' AND ');
            query += whereClause;
            countQuery += whereClause;
        }

        // Sorting & Pagination
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        // Execute Query
        const [rows] = await db.execute(query, params);
        
        // --- FIX: Ensure JSON fields are actually Arrays ---
        const products = rows.map(p => ({
            ...p,
            media: typeof p.media === 'string' ? JSON.parse(p.media) : (p.media || []),
            categories: typeof p.categories === 'string' ? JSON.parse(p.categories) : (p.categories || [])
        }));
        // ---------------------------------------------------
        
        // Count total for pagination (reuse params excluding limit/offset)
        const countParams = params.slice(0, params.length - 2);
        const [countResult] = await db.execute(countQuery, countParams);

        return {
            products,
            total: countResult[0].total,
            totalPages: Math.ceil(countResult[0].total / limit)
        };
    }

    // --- 2. CREATE PRODUCT ---
    static async create(data) {
        // Generate Custom ID (Same logic as User)
        const timePart = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 6);
        const uniqueId = `prod_${timePart}${randomPart}`;

        const query = `
            INSERT INTO products 
            (id, title, subtitle, description, ribbon_tag, media, categories, mrp, discount_price, sku, weight_kg, track_quantity, quantity, track_low_stock, low_stock_threshold, status) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        await db.execute(query, [
            uniqueId, 
            data.title, 
            data.subtitle || null,       // Fix: undefined -> null
            data.description || null,    // Fix: undefined -> null
            data.ribbon_tag || null,     // Fix: undefined -> null
            JSON.stringify(data.media || []), 
            JSON.stringify(data.categories || []), 
            data.mrp, 
            data.discount_price || null, // Fix: undefined -> null
            data.sku || null,            // Fix: undefined -> null
            data.weight_kg || null,      // Fix: undefined -> null
            data.track_quantity ? 1 : 0, 
            data.quantity || 0, 
            data.track_low_stock ? 1 : 0, 
            data.low_stock_threshold || 0,
            data.status || 'active'
        ]);

        return { id: uniqueId, ...data };
    }

    // --- 3. DELETE PRODUCT ---
    static async delete(id) {
        await db.execute('DELETE FROM products WHERE id = ?', [id]);
        return true;
    }

    // --- 4. UPDATE PRODUCT ---
    static async update(id, data) {
        // Dynamic Update Query
        const fields = [];
        const values = [];

        Object.keys(data).forEach(key => {
            fields.push(`${key} = ?`);
            // Stringify JSON fields
            if (key === 'media' || key === 'categories') {
                values.push(JSON.stringify(data[key]));
            } else {
                values.push(data[key]);
            }
        });

        values.push(id); // For WHERE clause

        const query = `UPDATE products SET ${fields.join(', ')} WHERE id = ?`;
        await db.execute(query, values);
        return true;
    }
}

module.exports = Product;