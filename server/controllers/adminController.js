const User = require('../models/User');
const bcrypt = require('bcryptjs');

// --- 1. GET ALL USERS (PAGINATED) ---
const getUsers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const role = req.query.role || 'all';

        const result = await User.getPaginated(page, limit, role);
        
        res.json({
            users: result.users,
            pagination: {
                currentPage: page,
                totalPages: result.totalPages,
                totalUsers: result.total
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// --- 2. CREATE USER ---
const createUser = async (req, res) => {
    const { name, email, mobile, password, address, role } = req.body;

    try {
        const userExists = await User.findByMobile(mobile);
        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // SECURITY: Role Assignment
        let roleToAssign = 'customer'; 
        if (req.user.role === 'admin' && role) {
            roleToAssign = role; 
        } else if (req.user.role === 'staff') {
            roleToAssign = 'customer';
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            name, email, mobile,
            password: hashedPassword,
            role: roleToAssign,
            address
        });

        res.status(201).json({ message: 'User created successfully', user: newUser });

    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server Error' });
    }
};

// --- 3. DELETE USER ---
const deleteUser = async (req, res) => {
    try {
        const userToDelete = await User.findById(req.params.id);
        
        if (!userToDelete) return res.status(404).json({ message: 'User not found' });

        // RULE: Cannot delete Admins
        if (userToDelete.role === 'admin') {
            return res.status(403).json({ message: 'Action Denied: System Admins cannot be deleted.' });
        }

        // RULE: Staff can only delete Customers
        if (req.user.role === 'staff' && userToDelete.role !== 'customer') {
            return res.status(403).json({ message: 'Access Denied: Staff can only delete customers.' });
        }

        await User.delete(req.params.id);
        res.json({ message: 'User removed' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

// --- 4. RESET PASSWORD (With Privacy Rule Kept) ---
const resetUserPassword = async (req, res) => {
    const { password } = req.body;

    // VALIDATION: Prevent server crash if password is empty
    if (!password || password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    try {
        const userToUpdate = await User.findById(req.params.id);
        if (!userToUpdate) return res.status(404).json({ message: 'User not found' });

        // --- PRIVACY RULE: KEPT AS REQUESTED ---
        // Prevents Admin from manually resetting Customer passwords
        if (userToUpdate.role === 'customer') {
            return res.status(403).json({ 
                message: 'Action Denied: Customer passwords are private. Ask them to use "Forgot Password".' 
            });
        }
        // ----------------------------------------

        // Staff Check
        if (req.user.role === 'staff') {
            if (String(req.user.id) !== String(req.params.id)) {
                return res.status(403).json({ message: 'Access Denied: You can only reset your own password.' });
            }
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await User.updatePasswordById(req.params.id, hashedPassword);
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        console.error("Reset Password Error:", error);
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { getUsers, createUser, deleteUser, resetUserPassword };