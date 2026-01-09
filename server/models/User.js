const fs = require('fs');
const path = require('path');

// Points to server/data/users.json
const filePath = path.join(__dirname, '../data/users.json');

// Ensure the data folder and file exist automatically
if (!fs.existsSync(path.dirname(filePath))) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, '[]');
}

class User {
    static getAll() {
        try {
            const data = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(data) || [];
        } catch (error) {
            return [];
        }
    }

    static findByEmail(email) {
        return this.getAll().find(u => u.email === email);
    }

    static findByMobile(mobile) {
        return this.getAll().find(u => u.mobile === mobile);
    }

    static create(userData) {
        const users = this.getAll();
        const newUser = { 
            id: Date.now().toString(), 
            ...userData, 
            role: 'customer', 
            createdAt: new Date().toISOString() 
        };
        users.push(newUser);
        fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
        return newUser;
    }

    static updatePassword(mobile, hashedPassword) {
        const users = this.getAll();
        const index = users.findIndex(u => u.mobile === mobile);
        if (index === -1) return null;
        
        users[index].password = hashedPassword;
        fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
        return users[index];
    }
}

module.exports = User;