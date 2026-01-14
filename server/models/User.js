const fs = require('fs');
const path = require('path');
const db = require('../config/db'); // MySQL Pool

// Path to your local JSON data
const filePath = path.join(__dirname, '../data/users.json');

// Helper: Get Users from JSON (Safe Read)
const getLocalUsers = () => {
    try {
        if (!fs.existsSync(filePath)) {
            // Create file if it doesn't exist
            if (!fs.existsSync(path.dirname(filePath))) {
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
            }
            fs.writeFileSync(filePath, '[]');
            return [];
        }
        const data = fs.readFileSync(filePath, 'utf8');
        return data ? JSON.parse(data) : [];
    } catch (err) {
        console.error("Error reading users.json:", err);
        return [];
    }
};

// Helper: Save Users to JSON
const saveLocalUsers = (users) => {
    try {
        fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
        return true;
    } catch (err) {
        console.error("Error writing users.json:", err);
        return false;
    }
};

class User {
    // --- 1. FIND BY EMAIL ---
    static async findByEmail(email) {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
            return rows[0];
        } else {
            return getLocalUsers().find(u => u.email === email);
        }
    }

    // --- 2. FIND BY MOBILE ---
    static async findByMobile(mobile) {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute('SELECT * FROM users WHERE mobile = ?', [mobile]);
            return rows[0];
        } else {
            return getLocalUsers().find(u => u.mobile === mobile);
        }
    }
    
    // --- 3. FIND BY ID ---
    static async findById(id) {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
            return rows[0];
        } else {
            // Note: JSON IDs are often strings, ensure comparison works
            return getLocalUsers().find(u => u.id == id);
        }
    }
    
    // --- 4. GET ALL USERS ---
    static async getAll() {
        if (process.env.NODE_ENV === 'production') {
            const [rows] = await db.execute('SELECT * FROM users ORDER BY created_at DESC');
            return rows;
        } else {
            return getLocalUsers();
        }
    }

    // --- 5. CREATE USER ---
    static async create(userData) {
        // Prepare User Object
        const newUser = {
            id: Date.now().toString(), // Temporary ID logic for JSON
            ...userData,
            role: userData.role || 'customer',
            created_at: new Date()
        };

        if (process.env.NODE_ENV === 'production') {
            // MySQL Insert
            const query = `INSERT INTO users (name, email, mobile, password, role, address, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`;
            const addressJson = newUser.address ? JSON.stringify(newUser.address) : null;
            
            const [result] = await db.execute(query, [
                newUser.name, newUser.email, newUser.mobile, newUser.password, 
                newUser.role, addressJson, newUser.created_at
            ]);
            
            // Return user with the real MySQL ID
            return { ...newUser, id: result.insertId };
        } else {
            // JSON Write
            const users = getLocalUsers();
            users.push(newUser);
            saveLocalUsers(users);
            return newUser;
        }
    }

    // --- 6. UPDATE PASSWORD (BY MOBILE) ---
    // Used by: Forgot Password
    static async updatePassword(mobile, hashedPassword) {
        if (process.env.NODE_ENV === 'production') {
            await db.execute('UPDATE users SET password = ? WHERE mobile = ?', [hashedPassword, mobile]);
            return true;
        } else {
            const users = getLocalUsers();
            const index = users.findIndex(u => u.mobile === mobile);
            if (index === -1) return null;
            
            users[index].password = hashedPassword;
            saveLocalUsers(users);
            return users[index];
        }
    }

    // --- 7. UPDATE PASSWORD (BY ID) ---
    // Used by: Admin Reset
    static async updatePasswordById(id, hashedPassword) {
        if (process.env.NODE_ENV === 'production') {
            await db.execute('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, id]);
            return true;
        } else {
            const users = getLocalUsers();
            const index = users.findIndex(u => u.id == id);
            if (index === -1) return null;
            
            users[index].password = hashedPassword;
            saveLocalUsers(users);
            return true;
        }
    }

    // --- 8. DELETE USER ---
    // Used by: Admin Delete
    static async delete(id) {
        if (process.env.NODE_ENV === 'production') {
            // Use a transaction to safely delete user and their OTPs
            const connection = await db.getConnection();
            try {
                await connection.beginTransaction();

                // 1. Get mobile to delete OTPs
                const [user] = await connection.query('SELECT mobile FROM users WHERE id = ?', [id]);
                if (user.length > 0) {
                    await connection.query('DELETE FROM otps WHERE mobile = ?', [user[0].mobile]);
                }

                // 2. Delete User
                const [result] = await connection.query('DELETE FROM users WHERE id = ?', [id]);
                
                await connection.commit();
                return result.affectedRows > 0;
            } catch (error) {
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
        } else {
            const users = getLocalUsers();
            const newUsers = users.filter(u => u.id != id);
            
            if (users.length === newUsers.length) return false; // Nothing deleted
            
            saveLocalUsers(newUsers);
            return true;
        }
    }
}

module.exports = User;