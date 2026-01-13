const fs = require('fs');
const path = require('path');
const db = require('../config/db'); // MySQL Connection

const filePath = path.join(__dirname, '../data/users.json');

// Helper for JSON Mode (Local)
const getLocalUsers = () => {
    try {
        if (!fs.existsSync(filePath)) return [];
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) { return []; }
};

class User {
    // --- FIND BY EMAIL ---
    static async findByEmail(email) {
        if (process.env.NODE_ENV === 'production') {
            // MySQL Mode
            const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
            return rows[0];
        } else {
            // JSON Mode
            return getLocalUsers().find(u => u.email === email);
        }
    }

    // --- FIND BY MOBILE ---
    static async findByMobile(mobile) {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute('SELECT * FROM users WHERE mobile = ?', [mobile]);
            return rows[0];
        } else {
            return getLocalUsers().find(u => u.mobile === mobile);
        }
    }
    
    // --- FIND BY ID ---
    static async findById(id) {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
            return rows[0];
        } else {
            return getLocalUsers().find(u => u.id === id);
        }
    }
    
    // --- GET ALL (Admin) ---
    static async getAll() {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute('SELECT * FROM users');
            return rows;
        } else {
            return getLocalUsers();
        }
    }

    // --- CREATE USER ---
    static async create(userData) {
        const newUser = {
            id: Date.now().toString(),
            ...userData,
            role: 'customer',
            createdAt: new Date().toISOString()
        };

        if (process.env.NODE_ENV === 'production') {
            // MySQL Insert
            const query = `INSERT INTO users (id, name, email, mobile, password, role, address, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            const addressJson = newUser.address ? JSON.stringify(newUser.address) : null;
            
            await db.execute(query, [
                newUser.id, newUser.name, newUser.email, newUser.mobile, newUser.password, 
                newUser.role, addressJson, new Date(newUser.createdAt)
            ]);
            return newUser;
        } else {
            // JSON Write
            const users = getLocalUsers();
            users.push(newUser);
            fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
            return newUser;
        }
    }

    // --- UPDATE PASSWORD ---
    static async updatePassword(mobile, hashedPassword) {
        if (process.env.NODE_ENV === 'production') {
            await db.execute('UPDATE users SET password = ? WHERE mobile = ?', [hashedPassword, mobile]);
            return true;
        } else {
            const users = getLocalUsers();
            const index = users.findIndex(u => u.mobile === mobile);
            if (index === -1) return null;
            users[index].password = hashedPassword;
            fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
            return users[index];
        }
    }
}

module.exports = User;