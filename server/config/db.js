const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- AUTOMATIC TABLE CREATION ---
const initDB = async () => {
    // --- THE FIX: Skip DB connection if we are Local ---
    if (process.env.NODE_ENV !== 'production') {
        console.log("⚠️  Local Mode Detected: Skipping MySQL Connection. Using JSON files.");
        return; 
    }
    let connection;
    try {
        connection = await pool.getConnection();
        console.log("✅ DB Connected! Checking tables...");

        // 1. Create OTP Table (If not exists)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS otps (
                id INT AUTO_INCREMENT PRIMARY KEY,
                mobile VARCHAR(15) NOT NULL,
                otp VARCHAR(10) NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. Create Users Table (If not exists)
        // (I added standard fields based on your authController)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100),
                email VARCHAR(100) UNIQUE,
                mobile VARCHAR(15) UNIQUE NOT NULL,
                password VARCHAR(255),
                address TEXT,
                role VARCHAR(20) DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 3. PRODUCTS TABLE (New!)
        await connection.query(`
            CREATE TABLE IF NOT EXISTS products (
                id BIGINT PRIMARY KEY, 
                title VARCHAR(255) NOT NULL,
                subtitle VARCHAR(255),
                description TEXT,
                ribbon_tag VARCHAR(15), -- Max 15 chars as requested
                media JSON, -- Stores images/videos as JSON array
                mrp DECIMAL(10, 2) NOT NULL,
                discount_price DECIMAL(10, 2),
                sku VARCHAR(50),
                weight_kg DECIMAL(6, 3),
                track_quantity TINYINT(1) DEFAULT 0, -- Checkbox logic
                quantity INT DEFAULT 0,
                track_low_stock TINYINT(1) DEFAULT 0, -- Checkbox logic
                low_stock_threshold INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);

        console.log("✅ Tables verified/created successfully!");
        connection.release();
    } catch (error) {
        console.error("❌ Database Initialization Failed:", error.message);
    } 
};

// Run the check immediately when server starts
initDB();

module.exports = pool;