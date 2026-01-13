const bcrypt = require('bcryptjs'); // Ensure bcrypt is imported at top
const User = require('../models/User');

// Get all users (customers)
exports.getUsers = async (req, res) => {
    try {
        const users = await User.getAll();
        // Filter out sensitive data like passwords before sending
        const safeUsers = users.map(user => {
            const { password, ...rest } = user;
            return rest;
        });
        res.json(safeUsers);
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
};

// Delete a user
exports.deleteUser = (req, res) => {
    try {
        const users = User.getAll();
        const newUsers = users.filter(u => u.id !== req.params.id);
        
        // Save back to file (In a real DB, this is a delete query)
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, '../data/users.json');
        fs.writeFileSync(filePath, JSON.stringify(newUsers, null, 2));
        
        res.json({ message: "User removed" });
    } catch (error) {
        res.status(500).json({ message: "Server Error" });
    }
};

// Force Reset User Password (Admin Action)
exports.adminResetPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: "Password must be 6+ chars" });
        }

        const users = User.getAll();
        const userIndex = users.findIndex(u => u.id === id);
        
        if (userIndex === -1) return res.status(404).json({ message: "User not found" });

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        users[userIndex].password = await bcrypt.hash(newPassword, salt);

        // Save to file
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(__dirname, '../data/users.json');
        fs.writeFileSync(filePath, JSON.stringify(users, null, 2));

        res.json({ message: `Password updated for ${users[userIndex].name}` });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
};

// Create User (Admin Manual Add)
exports.createUser = async (req, res) => {
    try {
        const { name, email, mobile, password, address } = req.body;

        // Basic Validation
        if (!name || !email || !mobile || !password) {
            return res.status(400).json({ message: "Name, Email, Mobile and Password are required" });
        }

        // Check if user exists
        if (User.findByEmail(email) || User.findByMobile(mobile)) {
            return res.status(409).json({ message: "User with this Email or Mobile already exists" });
        }

        // Hash Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create User
        const newUser = User.create({
            name,
            email,
            mobile,
            password: hashedPassword,
            address: address || null
        });

        // Return user without password
        const { password: _, ...userWithoutPass } = newUser;
        res.status(201).json({ message: "Customer created successfully", user: userWithoutPass });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Server Error" });
    }
};