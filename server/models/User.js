const fs = require('fs');
const path = require('path');
const db = require('../config/db'); // MySQL Pool

const filePath = path.join(__dirname, '../data/users.json');

// --- HELPER FUNCTIONS ---
const getLocalUsers = () => {
    try {
        if (!fs.existsSync(filePath)) {
            if (!fs.existsSync(path.dirname(filePath))) {
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
            }
            fs.writeFileSync(filePath, '[]');
            return [];
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return data ? JSON.parse(data) : [];
    } catch (err) { return []; }
};

const saveLocalUsers = (users) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
    } catch (err) { console.error("Write Error:", err); }
};

class User {
    // --- 1. GET ALL ---
    static async getAll() {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute(`
                SELECT * FROM users 
                ORDER BY (role = 'admin') DESC, createdAt DESC
            `);
            return rows;
        } else {
            return getLocalUsers().sort((a, b) => {
                if (a.role === 'admin') return -1;
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
        }
    }

    // --- 2. FIND HELPERS ---
    static async findByEmail(email) {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
            return rows[0];
        } else {
            return getLocalUsers().find(u => u.email === email);
        }
    }

    static async findByMobile(mobile) {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute('SELECT * FROM users WHERE mobile = ?', [mobile]);
            return rows[0];
        } else {
            return getLocalUsers().find(u => u.mobile === mobile);
        }
    }

    static async findById(id) {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
            return rows[0];
        } else {
            return getLocalUsers().find(u => u.id == id);
        }
    }

    // --- 3. CREATE USER (Base36 "Smart Shrink" ID) ---
    static async create(userData) {
        const baseData = {
            ...userData,
            role: userData.role || 'customer',
            createdAt: new Date()
        };

        // GENERATE ID: Base36 Timestamp + Random
        // 1. Timestamp (Base36): "170523..." becomes "lr6x2z..." (8 chars)
        const timePart = Date.now().toString(36);
        
        // 2. Random (Base36): 4 random chars to prevent collision in same millisecond
        const randomPart = Math.random().toString(36).substring(2, 6);
        
        // 3. Result: "lr6x2z-9b2a" (Approx 12 chars, fits in VARCHAR)
        const uniqueId = `${timePart}${randomPart}`;

        if (process.env.NODE_ENV === 'production') {
            // PRODUCTION: Insert with Generated ID
            const query = `INSERT INTO users (id, name, email, mobile, password, role, address, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            
            const addressJson = baseData.address ? JSON.stringify(baseData.address) : null;
            
            await db.execute(query, [
                uniqueId, 
                baseData.name, baseData.email, baseData.mobile, baseData.password, 
                baseData.role, addressJson, baseData.createdAt
            ]);
            
            return { id: uniqueId, ...baseData };

        } else {
            // LOCAL: Use same ID logic
            const newUser = { id: uniqueId, ...baseData };
            const users = getLocalUsers();
            users.push(newUser);
            saveLocalUsers(users);
            return newUser;
        }
    }

    // --- 4. DELETE USER ---
    static async delete(id) {
        if (process.env.NODE_ENV === 'production') {
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();
                const [user] = await connection.query('SELECT mobile FROM users WHERE id = ?', [id]);
                if (user.length > 0) {
                    await connection.query('DELETE FROM otps WHERE mobile = ?', [user[0].mobile]);
                }
                await connection.query('DELETE FROM users WHERE id = ?', [id]);
                await connection.commit();
                return true;
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        } else {
            let users = getLocalUsers();
            const initialLength = users.length;
            users = users.filter(u => u.id != id);
            saveLocalUsers(users);
            return users.length < initialLength;
        }
    }

    // --- 5. UPDATE PASSWORD ---
    static async updatePasswordById(id, hashedPassword) {
        if (process.env.NODE_ENV === 'production') {
            await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
            return true;
        } else {
            const users = getLocalUsers();
            const index = users.findIndex(u => u.id == id);
            if (index !== -1) {
                users[index].password = hashedPassword;
                saveLocalUsers(users);
                return true;
            }
            return false;
        }
    }

    static async updatePassword(mobile, hashedPassword) {
        if (process.env.NODE_ENV === 'production') {
            await db.execute('UPDATE users SET password = ? WHERE mobile = ?', [hashedPassword, mobile]);
            return true;
        } else {
            const users = getLocalUsers();
            const index = users.findIndex(u => u.mobile === mobile);
            if (index !== -1) {
                users[index].password = hashedPassword;
                saveLocalUsers(users);
                return true;
            }
            return false;
        }
    }
}

module.exports = User;