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
    // --- 1. GET ALL (Admin First, then Recent) ---
    static async getAll() {
        if (process.env.NODE_ENV === 'production') {
            // "ORDER BY (role = 'admin') DESC" puts Admin(1) before User(0)
            const [rows] = await db.execute(`
                SELECT * FROM users 
                ORDER BY (role = 'admin') DESC, createdAt DESC
            `);
            return rows;
        } else {
            const users = getLocalUsers();
            // Local Sort: Admin first, then date
            return users.sort((a, b) => {
                if (a.role === 'admin' && b.role !== 'admin') return -1;
                if (a.role !== 'admin' && b.role === 'admin') return 1;
                return new Date(b.createdAt) - new Date(a.createdAt);
            });
        }
    }

    // --- 2. FIND BY EMAIL ---
    static async findByEmail(email) {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
            return rows[0];
        } else {
            return getLocalUsers().find(u => u.email === email);
        }
    }

    // --- 3. FIND BY MOBILE ---
    static async findByMobile(mobile) {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute('SELECT * FROM users WHERE mobile = ?', [mobile]);
            return rows[0];
        } else {
            return getLocalUsers().find(u => u.mobile === mobile);
        }
    }

    // --- 4. FIND BY ID ---
    static async findById(id) {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
            return rows[0];
        } else {
            return getLocalUsers().find(u => u.id == id);
        }
    }

    // --- 5. CREATE USER (Fixed ID Crash) ---
    static async create(userData) {
        // Base object for Local/Logic
        const baseData = {
            ...userData,
            role: userData.role || 'customer',
            createdAt: new Date()
        };

        if (process.env.NODE_ENV === 'production') {
            // --- FIX 1: REMOVE 'id' FROM QUERY ---
            // Let MySQL Auto-Increment handle the ID.
            const query = `INSERT INTO users (name, email, mobile, password, role, address, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            
            // Ensure address is string or null
            const addressJson = baseData.address ? JSON.stringify(baseData.address) : null;
            
            const [result] = await db.execute(query, [
                baseData.name, baseData.email, baseData.mobile, baseData.password, 
                baseData.role, addressJson, baseData.createdAt
            ]);
            
            // Return with the REAL ID from MySQL
            return { id: result.insertId, ...baseData };

        } else {
            // Local Mode: We still need to fake an ID
            const newUser = { id: Date.now().toString(), ...baseData };
            const users = getLocalUsers();
            users.push(newUser);
            saveLocalUsers(users);
            return newUser;
        }
    }

    // --- 6. DELETE USER ---
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

    // --- 7. UPDATE PASSWORD ---
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
    
    // Legacy support for Forgot Password (by mobile)
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