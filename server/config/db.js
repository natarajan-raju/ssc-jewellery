const mysql = require('mysql2/promise');

// 1. REMOVED dotenv config (It is handled in server/index.js now)

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, // 2. FIXED: Changed DB_PASSWORD to DB_PASS
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- AUTOMATIC TABLE CREATION ---
const initDB = async () => {
    // 3. REMOVED "Skip if Local" block. 
    // We want this to run on Remote SQL (Dev) and Production alike.

    let connection;
    try {
        connection = await pool.getConnection();
        console.log(`✅ Connected to DB: ${process.env.DB_NAME} on ${process.env.DB_HOST}`);

        // 1. Create OTP Table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS otps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mobile VARCHAR(15) NOT NULL,
                otp VARCHAR(10) NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Create Users Table (UPDATED SCHEMA)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY, -- 4. FIXED: Changed INT to VARCHAR for "lr6x2z..." IDs
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE,
                mobile VARCHAR(15) UNIQUE NOT NULL,
                password VARCHAR(255),
                address TEXT,
                role VARCHAR(20) DEFAULT 'customer', -- Updated default to match logic
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. PRODUCTS TABLE (Added 'options' column)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS products (
                id VARCHAR(50) PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                subtitle VARCHAR(255),
                description TEXT,
                ribbon_tag VARCHAR(50), 
                media JSON,
                categories JSON,
                additional_info JSON,
                options JSON,          -- [NEW] Stores definitions e.g. [{name: 'Size', values: ['S', 'M']}]
                mrp DECIMAL(10, 2) NOT NULL,
                discount_price DECIMAL(10, 2),
                sku VARCHAR(50),
                weight_kg DECIMAL(6, 3),
                track_quantity TINYINT(1) DEFAULT 0,
                quantity INT DEFAULT 0,
                track_low_stock TINYINT(1) DEFAULT 0,
                low_stock_threshold INT DEFAULT 0,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        // 4. [NEW] PRODUCT VARIANTS TABLE
        await connection.query(`
            CREATE TABLE IF NOT EXISTS product_variants (
                id VARCHAR(50) PRIMARY KEY,
                product_id VARCHAR(50) NOT NULL,
                variant_title VARCHAR(255), -- e.g. "Small / Red"
                variant_options JSON,       -- e.g. {"Size": "Small", "Color": "Red"}
                price DECIMAL(10, 2) NOT NULL,
                discount_price DECIMAL(10, 2),
                sku VARCHAR(50),
                weight_kg DECIMAL(6, 3),
                quantity INT DEFAULT 0,
                track_quantity TINYINT(1) DEFAULT 0,
                track_low_stock TINYINT(1) DEFAULT 0,
                low_stock_threshold INT DEFAULT 0,
                image_url TEXT,             -- Specific image for this variant
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            )
        `);
        

        console.log("✅ Tables verified/created successfully!");
        connection.release();
    } catch (error) {
        console.error("❌ Database Initialization Failed:", error.message);
    } 
};

// Run check on startup
initDB();

module.exports = pool;