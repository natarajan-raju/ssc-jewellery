const bcrypt = require('bcryptjs');
const User = require('../models/User'); // Import the hybrid model

// 1. GET ALL USERS
// 1. GET ALL USERS (Debug Mode)
exports.getUsers = async (req, res) => {
    try {
        console.log("Attempting to fetch users...");
        
        // Call the Model
        const users = await User.getAll();
        console.log("Users fetched from DB:", users.length); // See if we got data

        // Remove passwords
        const safeUsers = users.map(user => {
            const { password, ...rest } = user;
            return rest;
        });
        
        res.json(safeUsers);

    } catch (error) {
        console.error("❌ CRASH IN GET USERS:", error);
        
        // IMPORTANT: Send the ACTUAL error message to the browser
        res.status(500).json({ 
            message: "Server Crash", 
            error_details: error.message,
            error_stack: error.stack 
        });
    }
};

// 2. DELETE USER
exports.deleteUser = async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Call the Model (handles both JSON and MySQL logic)
        const success = await User.delete(userId);
        
        if (!success) {
            return res.status(404).json({ message: "User not found" });
        }
        
        res.json({ message: "User removed successfully" });
    } catch (error) {
        console.error("Delete User Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// 3. ADMIN RESET PASSWORD
exports.adminResetPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: "Password must be 6+ chars" });
        }

        // Check user existence
        const user = await User.findById(id);
        if (!user) return res.status(404).json({ message: "User not found" });

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update via Model
        await User.updatePasswordById(id, hashedPassword);

        res.json({ message: `Password updated successfully` });
    } catch (error) {
        console.error("Admin Reset Error:", error);
        res.status(500).json({ message: "Server Error" });
    }
};

// 4. CREATE USER (Manual Admin Add)
exports.createUser = async (req, res) => {
    try {
        const { name, email, mobile, password, address } = req.body;

        if (!name || !email || !mobile || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        // Check duplicates (MUST await these!)
        const existingEmail = await User.findByEmail(email);
        const existingMobile = await User.findByMobile(mobile);

        if (existingEmail || existingMobile) {
            return res.status(409).json({ message: "User already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create User (MUST await this!)
        const newUser = await User.create({
            name,
            email,
            mobile,
            password: hashedPassword,
            address: address || null,
            role: 'customer'
        });

        // Return without password
        const { password: _, ...userWithoutPass } = newUser;
        res.status(201).json({ message: "Customer created", user: userWithoutPass });

    } catch (error) {
        console.error("Create User Error:", error);
        res.status(500).json({ 
            message: "Server Error", 
            error_details: error.message,  // <--- The clue we need
            error_code: error.code         // <--- SQL Error Code
        });
    }
};