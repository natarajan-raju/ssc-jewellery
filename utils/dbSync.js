const db = require('../config/db');
const fs = require('fs');
const path = require('path');

const syncDatabase = async () => {
    // Only run this in production
    if (process.env.NODE_ENV !== 'production') return;

    try {
        console.log('🔄 Checking Database Schema & Data...');

        // 1. Create Table if not exists
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(255) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                mobile VARCHAR(20) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role VARCHAR(50) DEFAULT 'customer',
                address JSON,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `;
        await db.execute(createTableQuery);

        // 2. Read Local JSON Data
        const jsonPath = path.join(__dirname, '../data/users.json');
        if (!fs.existsSync(jsonPath)) return;
        
        const localUsers = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

        // 3. Sync Data (Insert if missing)
        let count = 0;
        for (const user of localUsers) {
            // Check if user exists in MySQL
            const [rows] = await db.execute('SELECT id FROM users WHERE email = ? OR mobile = ?', [user.email, user.mobile]);
            
            if (rows.length === 0) {
                // Insert User
                const insertQuery = `
                    INSERT INTO users (id, name, email, mobile, password, role, address, createdAt)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `;
                
                // Convert address object to string for JSON column (or null)
                const addressData = user.address ? JSON.stringify(user.address) : null;
                const createdAt = user.createdAt ? new Date(user.createdAt) : new Date();

                await db.execute(insertQuery, [
                    user.id, 
                    user.name, 
                    user.email, 
                    user.mobile, 
                    user.password, 
                    user.role || 'customer',
                    addressData,
                    createdAt
                ]);
                count++;
            }
        }

        if (count > 0) console.log(`✅ Synced ${count} new users from Local JSON to MySQL`);
        else console.log('✅ Database is up to date with Local JSON');

    } catch (error) {
        console.error('❌ Sync Error:', error);
    }
};

module.exports = syncDatabase;