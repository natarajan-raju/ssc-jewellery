const fs = require('fs');
const path = require('path');
const db = require('../config/db'); // MySQL Pool

const filePath = path.join(__dirname, '../data/users.json');

// --- HELPER FUNCTIONS (LOCAL JSON) ---
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
    // --- 1. GET ALL (Fixes the 500 Error) ---
    static async getAll() {
        if (process.env.NODE_ENV === 'production') {
            // FIX: Changed 'created_at' to 'createdAt' to match your table
            const [rows] = await db.execute('SELECT * FROM users ORDER BY createdAt DESC');
            return rows;
        } else {
            return getLocalUsers();
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

    // --- 5. CREATE USER ---
    static async create(userData) {
        const newUser = {
            id: Date.now().toString(),
            ...userData,
            role: 'customer',
            createdAt: new Date() // Local uses camelCase
        };

        if (process.env.NODE_ENV === 'production') {
            // FIX: Using 'createdAt' in SQL to match your table
            const query = `INSERT INTO users (name, email, mobile, password, role, address, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            const addressJson = newUser.address ? JSON.stringify(newUser.address) : null;
            
            const [result] = await db.execute(query, [
                newUser.name, newUser.email, newUser.mobile, newUser.password, 
                newUser.role, addressJson, newUser.createdAt
            ]);
            
            return { ...newUser, id: result.insertId };
        } else {
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
                
                // Get mobile first to delete OTPs
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

    // --- 7. UPDATE PASSWORD (ID) ---
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
}

module.exports = User;