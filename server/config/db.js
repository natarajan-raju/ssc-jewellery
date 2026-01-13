const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    user: process.env.DB_USER || 'u739288515_natarajanraju',
    password: process.env.DB_PASSWORD || 'Database@!1990',
    database: process.env.DB_NAME || 'u739288515_test1',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// --- AUTOMATIC TABLE CREATION ---
const initDB = async () => {
    try {
        const connection = await pool.getConnection();
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

        console.log("✅ Tables verified/created successfully!");
        connection.release();
    } catch (error) {
        console.error("❌ Database Initialization Failed:", error.message);
    }
};

// Run the check immediately when server starts
initDB();

module.exports = pool;