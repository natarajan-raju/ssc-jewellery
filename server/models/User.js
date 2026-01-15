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
    
    // --- 1. GET ALL (Admin > Staff > Customer) ---
    static async getAll() {
        if (process.env.NODE_ENV === 'production') {
            // SQL Sort: 3=Admin, 2=Staff, 1=Customer
            const [rows] = await db.execute(`
                SELECT * FROM users 
                ORDER BY 
                 CASE 
                    WHEN role = 'admin' THEN 3
                    WHEN role = 'staff' THEN 2
                    ELSE 1
                 END DESC, 
                 createdAt DESC
            `);
            return rows;
        } else {
            // Local JSON Sort
            const users = getLocalUsers();
            return users.sort((a, b) => {
                const getPriority = (role) => {
                    if (role === 'admin') return 3;
                    if (role === 'staff') return 2;
                    return 1;
                };
                const diff = getPriority(b.role) - getPriority(a.role);
                if (diff !== 0) return diff;
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
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
    // --- 4. DELETE USER (Leak-Proof Version) ---
    static async delete(id) {
        if (process.env.NODE_ENV === 'production') {
            let connection; // Declare outside
            try {
                connection = await db.getConnection(); // Get connection
                await connection.beginTransaction();

                // 1. Get mobile to delete related OTPs (if any)
                const [userRows] = await connection.query('SELECT mobile FROM users WHERE id = ?', [id]);
                
                if (userRows.length > 0) {
                    const mobile = userRows[0].mobile;
                    // Delete OTPs first (clean up)
                    await connection.query('DELETE FROM otps WHERE mobile = ?', [mobile]);
                }

                // 2. Delete the User
                await connection.query('DELETE FROM users WHERE id = ?', [id]);

                await connection.commit();
                return true;

            } catch (error) {
                if (connection) await connection.rollback();
                throw error;
            } finally {
                // SAFETY CHECK: Only release if connection exists
                if (connection) connection.release(); 
            }
        } else {
            // Local JSON Logic (Keep as is)
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

    // --- 6. PAGINATION & FILTERING ---
    static async getPaginated(page = 1, limit = 10, roleFilter = null) {
        const offset = (page - 1) * limit;
        
        if (process.env.NODE_ENV === 'production') {
            let query = 'SELECT * FROM users';
            let countQuery = 'SELECT COUNT(*) as total FROM users';
            const params = [];
            
            // Apply Role Filter
            if (roleFilter && roleFilter !== 'all') {
                query += ' WHERE role = ?';
                countQuery += ' WHERE role = ?';
                params.push(roleFilter);
            }

            // Apply Sorting (Admin > Staff > Customer) & Pagination
            query += ` 
                ORDER BY 
                 CASE 
                    WHEN role = 'admin' THEN 3
                    WHEN role = 'staff' THEN 2
                    ELSE 1
                 END DESC, 
                 createdAt DESC
                LIMIT ? OFFSET ?`;
            
            // Add limit/offset to params
            // Note: MySQL require integers for LIMIT/OFFSET
            params.push(parseInt(limit), parseInt(offset));

            const [users] = await db.execute(query, params);
            const [countResult] = await db.execute(countQuery, roleFilter && roleFilter !== 'all' ? [roleFilter] : []);
            
            return {
                users,
                total: countResult[0].total,
                totalPages: Math.ceil(countResult[0].total / limit)
            };
        } else {
            // Local JSON Logic
            let users = getLocalUsers();
            if (roleFilter && roleFilter !== 'all') {
                users = users.filter(u => u.role === roleFilter);
            }
            // Sort
            // FIX: Add Priority Sorting
            users.sort((a, b) => {
                const getPriority = (role) => {
                    if (role === 'admin') return 3;
                    if (role === 'staff') return 2;
                    return 1;
                };
                const diff = getPriority(b.role || 'customer') - getPriority(a.role || 'customer');
                
                // If roles are same, sort by date (Newest first)
                if (diff !== 0) return diff;
                return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
            });
            
            const total = users.length;
            const paginatedUsers = users.slice(offset, offset + parseInt(limit));
            
            return {
                users: paginatedUsers,
                total,
                totalPages: Math.ceil(total / limit)
            };
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