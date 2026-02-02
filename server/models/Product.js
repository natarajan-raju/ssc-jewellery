const db = require('../config/db');

class Product {
    // --- 1. GET PAGINATED (Fetches Variants & Options) ---
    static async getPaginated(page = 1, limit = 10, category = null, status = null, sort = 'newest') {
        const offset = (page - 1) * limit;
        const params = [];
        
        // We use a subquery to fetch variants as a JSON array for each product
        let query = `
            SELECT p.*,
            (
                SELECT JSON_ARRAYAGG(c.name)
                FROM product_categories pc
                JOIN categories c ON pc.category_id = c.id
                WHERE pc.product_id = p.id
            ) as categories_list, 
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
        let countQuery = 'SELECT COUNT(*) as total FROM products p';

        // Filters
        const conditions = [];
        if (category && category !== 'all') {
            conditions.push('EXISTS (SELECT 1 FROM product_categories pc JOIN categories c ON pc.category_id = c.id WHERE pc.product_id = p.id AND c.name = ?)');
            params.push(category);
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

        // --- DYNAMIC SORTING LOGIC ---
        let orderByClause = 'ORDER BY p.created_at DESC'; // Default (Newest)

        if (sort === 'low' || sort === 'high') {
            // "Effective Price" Logic:
            // 1. Check if variants exist. If so, find the CHEAPEST variant price (discounted or regular).
            // 2. If no variants, use the Main Product's discount_price (if set) or MRP.
            // 3. NULLIF(..., 0) ensures we don't accidentally treat a 0.00 placeholder as "Free".
            const effectivePrice = `
                COALESCE(
                    (
                        SELECT MIN(COALESCE(NULLIF(pv.discount_price, 0), pv.price)) 
                        FROM product_variants pv 
                        WHERE pv.product_id = p.id
                    ),
                    NULLIF(p.discount_price, 0),
                    p.mrp
                )
            `;
            
            orderByClause = `ORDER BY ${effectivePrice} ${sort === 'low' ? 'ASC' : 'DESC'}`;
        }

        query += ` ${orderByClause} LIMIT ? OFFSET ?`;
        params.push(parseInt(limit), parseInt(offset));

        const [rows] = await db.execute(query, params);
        
        // Parse JSON fields
        const products = rows.map(p => ({
            ...p,
            media: typeof p.media === 'string' ? JSON.parse(p.media) : (p.media || []),
            categories: typeof p.categories_list === 'string' ? JSON.parse(p.categories_list) : (p.categories_list || []),
            related_products: typeof p.related_products === 'string' ? JSON.parse(p.related_products) : (p.related_products || {}),
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

    // --- [NEW] Find Single Product by ID (with Variants) ---
    static async findById(id) {
        // 1. Fetch the Product
        const [productRows] = await db.execute(
            'SELECT * FROM products WHERE id = ?', 
            [id]
        );

        if (productRows.length === 0) {
            return null; // Product not found
        }

        const product = productRows[0];

        // 2. Fetch Variants (if any)
        // [FIX] Changed table to 'product_variants'. 
        // Removed 'ORDER BY created_at' to be safe since it wasn't in your schema snippet.
        const [variantRows] = await db.execute(
            'SELECT * FROM product_variants WHERE product_id = ?', 
            [id]
        );

        // 3. Attach variants to the product object
        product.variants = variantRows;

        return product;
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
                (id, title, subtitle, description, ribbon_tag, media, categories,related_products, additional_info, options, mrp, discount_price, sku, weight_kg, track_quantity, quantity, track_low_stock, low_stock_threshold, status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            await connection.execute(query, [
                uniqueId, data.title, data.subtitle || null, data.description || null, data.ribbon_tag || null,
                JSON.stringify(data.media || []), 
                JSON.stringify(data.categories || []), 
                JSON.stringify(data.related_products || {}),
                JSON.stringify(data.additional_info || []),
                JSON.stringify(data.options || []), // [NEW]
                data.mrp, data.discount_price || null, data.sku || null, data.weight_kg || null,
                data.track_quantity ? 1 : 0, data.quantity || 0, data.track_low_stock ? 1 : 0, data.low_stock_threshold || 0,
                data.status || 'active'
            ]);
            // [NEW] Sync Relational Categories
            await Product.syncCategories(connection, uniqueId, data.categories);

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
                if(key === 'categories') return; // Handle separately
                fields.push(`${key} = ?`);
                if (['media','categories','related_products','additional_info','options'].includes(key)) {
                    values.push(JSON.stringify(data[key]));
                } else {
                    values.push(data[key]);
                }
            });
            values.push(id);
            await connection.execute(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`, values);
            // [NEW] Sync Relational Categories
            if (data.categories) {
                await Product.syncCategories(connection, id, data.categories);
            }
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

    // --- HELPER: SECURE CATEGORY SYNC ---
    static async syncCategories(connection, productId, categoryNames) {
        // 1. Clear existing links for this product (Clean slate approach)
        await connection.execute('DELETE FROM product_categories WHERE product_id = ?', [productId]);

        if (!categoryNames || !Array.isArray(categoryNames) || categoryNames.length === 0) return;

        const categoryIds = [];
        for (const name of categoryNames) {
            const trimmed = name.trim();
            if (!trimmed) continue;

            // Check if category exists
            const [rows] = await connection.execute('SELECT id FROM categories WHERE name = ?', [trimmed]);
            
            if (rows.length > 0) {
                categoryIds.push(rows[0].id);
            } else {
                // If not exists, CREATE it dynamically (Tagging style)
                const [result] = await connection.execute('INSERT INTO categories (name) VALUES (?)', [trimmed]);
                categoryIds.push(result.insertId);
            }
        }

        // 2. Insert new links
        if (categoryIds.length > 0) {
            const placeholders = categoryIds.map(() => '(?, ?)').join(', ');
            const values = categoryIds.flatMap(catId => [productId, catId]);
            await connection.execute(`INSERT INTO product_categories (product_id, category_id) VALUES ${placeholders}`, values);
        }
    }

    // --- HELPER: GET ALL CATEGORIES ---
    static async getAllCategories() {
        const [rows] = await db.execute('SELECT name FROM categories ORDER BY name ASC');
        return rows.map(r => r.name);
    }

    // --- 5. CATEGORY MANAGEMENT ---
    
    // A. Get All Categories with Product Counts
    static async getCategoriesWithStats() {
        // [FIX] Added c.image_url to the SELECT list
        const query = `
            SELECT c.id, c.name, c.image_url, COUNT(pc.product_id) as product_count 
            FROM categories c 
            LEFT JOIN product_categories pc ON c.id = pc.category_id 
            GROUP BY c.id 
            ORDER BY c.name ASC
        `;
        const [rows] = await db.execute(query);
        return rows;
    }

    // B. Get Single Category with Ordered Products
    static async getCategoryDetails(categoryId) {
        // 1. Get Category Info
        const [catRows] = await db.execute('SELECT * FROM categories WHERE id = ?', [categoryId]);
        if (catRows.length === 0) return null;

        // 2. Get Products in this Category (Ordered by display_order)
        const productQuery = `
            SELECT p.id, p.title, p.sku, p.status, p.media, p.quantity, pc.display_order
            FROM products p
            JOIN product_categories pc ON p.id = pc.product_id
            WHERE pc.category_id = ?
            ORDER BY pc.display_order ASC, p.created_at DESC
        `;
        const [productRows] = await db.execute(productQuery, [categoryId]);

        // Parse media for the frontend
        const products = productRows.map(p => ({
            ...p,
            media: typeof p.media === 'string' ? JSON.parse(p.media) : (p.media || [])
        }));

        return { ...catRows[0], products };
    }

    // C. Update Category Name
    static async updateCategory(id, name, imageUrl) {
        if(imageUrl) {
            await db.execute('UPDATE categories SET name = ?, image_url = ? WHERE id = ?', [name, imageUrl, id]);
          } else {
              await db.execute('UPDATE categories SET name = ? WHERE id = ?', [name, id]);
          }
        return true;
    }

    // D. Reorder Products in Category
    static async reorderCategoryProducts(categoryId, orderedProductIds) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();
            
            // Update display_order for each product in the list
            for (let i = 0; i < orderedProductIds.length; i++) {
                await connection.execute(
                    'UPDATE product_categories SET display_order = ? WHERE category_id = ? AND product_id = ?',
                    [i, categoryId, orderedProductIds[i]]
                );
            }
            
            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

   // E. Add/Remove Product from Category (With Sync)
    static async manageCategoryProduct(categoryId, productId, action) {
        const connection = await db.getConnection();
        try {
            await connection.beginTransaction();

            // 1. Perform the Action on Link Table
            if (action === 'add') {
                const [exists] = await connection.execute(
                    'SELECT 1 FROM product_categories WHERE category_id = ? AND product_id = ?', 
                    [categoryId, productId]
                );
                if (exists.length === 0) {
                    await connection.execute(
                        'INSERT INTO product_categories (category_id, product_id) VALUES (?, ?)', 
                        [categoryId, productId]
                    );
                }
            } else if (action === 'remove') {
                await connection.execute(
                    'DELETE FROM product_categories WHERE category_id = ? AND product_id = ?', 
                    [categoryId, productId]
                );
            }

            // 2. [NEW] SYNC: Fetch all current categories for this product
            const [rows] = await connection.execute(`
                SELECT c.name 
                FROM categories c
                JOIN product_categories pc ON c.id = pc.category_id
                WHERE pc.product_id = ?
            `, [productId]);

            const categoryNames = rows.map(r => r.name);

            // 3. [NEW] SYNC: Update the main product table's JSON column
            await connection.execute(
                'UPDATE products SET categories = ? WHERE id = ?',
                [JSON.stringify(categoryNames), productId]
            );

            await connection.commit();
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // F. Create New Category
    static async createCategory(name, imageUrl) {
        // Handle Duplicate Name Error at DB level
        try {
            const [result] = await db.execute('INSERT INTO categories (name, image_url) VALUES (?, ?)', [name, imageUrl]);
            return result.insertId;
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('Category already exists');
            }
            throw error;
        }
    }

    // G. Delete Category
    static async deleteCategory(id) {
        // ON DELETE CASCADE in 'product_categories' will automatically untag products.
        // The products themselves will NOT be deleted, which is safe.
        await db.execute('DELETE FROM categories WHERE id = ?', [id]);
        return true;
    }
}

module.exports = Product;