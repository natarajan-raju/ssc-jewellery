const db = require('../config/db');

class Product {
    // --- 1. GET PAGINATED (Fetches Variants & Options) ---
    static async getPaginated(page = 1, limit = 10, category = null, status = null) {
        const offset = (page - 1) * limit;
        const params = [];
        
        // We use a subquery to fetch variants as a JSON array for each product
        let query = `
            SELECT p.*, 
            (
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', pv.id,
                        'variant_title', pv.variant_title,
                        'price', pv.price,
                        'discount_price', pv.discount_price,
                        'sku', pv.sku,
                        'weight_kg', pv.weight_kg,
                        'quantity', pv.quantity,
                        'track_quantity', pv.track_quantity,
                        'track_low_stock', pv.track_low_stock,
                        'low_stock_threshold', pv.low_stock_threshold,
                        'image_url', pv.image_url
                    )
                )
                FROM product_variants pv 
                WHERE pv.product_id = p.id
            ) as variants
            FROM products p
        `;
        let countQuery = 'SELECT COUNT(*) as total FROM products';

        // Filters
        const conditions = [];
        if (category && category !== 'all') {
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

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [rows] = await db.execute(query, params);
        
        // Parse JSON fields
        const products = rows.map(p => ({
            ...p,
            media: typeof p.media === 'string' ? JSON.parse(p.media) : (p.media || []),
            categories: typeof p.categories === 'string' ? JSON.parse(p.categories) : (p.categories || []),
            additional_info: typeof p.additional_info === 'string' ? JSON.parse(p.additional_info) : (p.additional_info || []),
            options: typeof p.options === 'string' ? JSON.parse(p.options) : (p.options || []),
            variants: typeof p.variants === 'string' ? JSON.parse(p.variants) : (p.variants || [])
        }));
        
        const countParams = params.slice(0, params.length - 2);
        const [countResult] = await db.execute(countQuery, countParams);

        return {
            products,
            total: countResult[0].total,
            totalPages: Math.ceil(countResult[0].total / limit)
        };
    }

    // --- 2. CREATE PRODUCT (With Variants) ---
    static async create(data) {
        const uniqueId = `prod_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 6)}`;
        
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Insert Main Product
            const query = `
                INSERT INTO products 
                (id, title, subtitle, description, ribbon_tag, media, categories, additional_info, options, mrp, discount_price, sku, weight_kg, track_quantity, quantity, track_low_stock, low_stock_threshold, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await connection.execute(query, [
                uniqueId, data.title, data.subtitle || null, data.description || null, data.ribbon_tag || null,
                JSON.stringify(data.media || []), 
                JSON.stringify(data.categories || []), 
                JSON.stringify(data.additional_info || []),
                JSON.stringify(data.options || []), // [NEW]
                data.mrp, data.discount_price || null, data.sku || null, data.weight_kg || null,
                data.track_quantity ? 1 : 0, data.quantity || 0, data.track_low_stock ? 1 : 0, data.low_stock_threshold || 0,
                data.status || 'active'
            ]);

            // 2. Insert Variants (if any)
            if (data.variants && data.variants.length > 0) {
                const variantQuery = `
                    INSERT INTO product_variants 
                    (id, product_id, variant_title, price, discount_price, sku, weight_kg, quantity, track_quantity, track_low_stock, low_stock_threshold, image_url)
                    VALUES ?
                `;
                const variantValues = data.variants.map(v => [
                    `var_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 5)}`, // ID
                    uniqueId,
                    v.title,
                    v.price,
                    v.discount_price || null,
                    v.sku || null,
                    v.weight_kg || null,
                    v.quantity || 0,
                    v.track_quantity ? 1 : 0,
                    v.track_low_stock ? 1 : 0,
                    v.low_stock_threshold || 0,
                    v.image_url || null
                ]);
                await connection.query(variantQuery, [variantValues]);
            }

            await connection.commit();
            return { id: uniqueId, ...data };
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // --- 3. DELETE PRODUCT ---
    static async delete(id) {
        // Variants delete automatically due to ON DELETE CASCADE
        await db.execute('DELETE FROM products WHERE id = ?', [id]);
        return true;
    }

    // --- 4. UPDATE PRODUCT ---
    static async update(id, data) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Update Main Product Fields
            const fields = [];
            const values = [];
            Object.keys(data).forEach(key => {
                if(key === 'variants') return; // Handle separately
                fields.push(`${key} = ?`);
                if (['media','categories','additional_info','options'].includes(key)) {
                    values.push(JSON.stringify(data[key]));
                } else {
                    values.push(data[key]);
                }
            });
            values.push(id);
            await connection.execute(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);

            // 2. Sync Variants (Delete Old -> Insert New)
            // Simplest strategy to ensure clean sync
            await connection.execute('DELETE FROM product_variants WHERE product_id = ?', [id]);

            if (data.variants && data.variants.length > 0) {
                const variantQuery = `
                    INSERT INTO product_variants 
                    (id, product_id, variant_title, price, discount_price, sku, weight_kg, quantity, track_quantity, track_low_stock, low_stock_threshold, image_url)
                    VALUES ?
                `;
                const variantValues = data.variants.map(v => [
                    `var_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 5)}_${Math.random().toString(36).substring(2, 5)}`,
                    id,
                    v.title,
                    v.price,
                    v.discount_price || null,
                    v.sku || null,
                    v.weight_kg || null,
                    v.quantity || 0,
                    v.track_quantity ? 1 : 0,
                    v.track_low_stock ? 1 : 0,
                    v.low_stock_threshold || 0,
                    v.image_url || null
                ]);
                await connection.query(variantQuery, [variantValues]);
            }

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
}

module.exports = Product;