const mysql = require('mysql2/promise');
require('dotenv').config();

// Create a connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Test the connection
pool.getConnection()
    .then(connection => {
        console.log('✅ Connected to Hostinger MySQL Database');
        connection.release();
    })
    .catch(err => {
        if (process.env.NODE_ENV === 'production') {
            console.error('❌ Database Connection Failed:', err.message);
        } else {
            console.log('ℹ️ Running in Local/JSON Mode (No DB Connection)');
        }
    });

module.exports = pool;