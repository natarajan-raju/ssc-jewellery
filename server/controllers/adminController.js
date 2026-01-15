const User = require('../models/User');
const bcrypt = require('bcryptjs');

// --- 1. GET ALL USERS ---
const getUsers = async (req, res) => {
    try {
        const users = await User.getAll();
        res.json(users);
    } catch (error) {
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
        let roleToAssign = 'customer'; // Default

        // Only Admin can assign 'staff' or 'admin' roles
        if (req.user.role === 'admin' && role) {
            roleToAssign = role; 
        } 
        // Staff force-assigned to create customers only
        else if (req.user.role === 'staff') {
            roleToAssign = 'customer';
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            name,
            email,
            mobile,
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

// --- 3. DELETE USER (Strict Security) ---
const deleteUser = async (req, res) => {
    try {
        const userToDelete = await User.findById(req.params.id);
        
        if (!userToDelete) return res.status(404).json({ message: 'User not found' });

        // RULE 1: PROTECT ADMINS
        // Nobody (not even other Admins) can delete an Admin account via this panel.
        // This prevents accidental lockouts or malicious deletions.
        if (userToDelete.role === 'admin') {
            return res.status(403).json({ 
                message: 'Action Denied: System Admins cannot be deleted.' 
            });
        }

        // RULE 2: STAFF LIMITATIONS
        // Staff can only delete Customers.
        if (req.user.role === 'staff') {
            if (userToDelete.role !== 'customer') {
                return res.status(403).json({ 
                    message: 'Access Denied: Staff can only delete customers.' 
                });
            }
        }

        await User.delete(req.params.id);
        res.json({ message: 'User removed' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

// --- 4. RESET PASSWORD (Strict Security) ---
const resetUserPassword = async (req, res) => {
    const { password } = req.body;
    try {
        const userToUpdate = await User.findById(req.params.id);
        if (!userToUpdate) return res.status(404).json({ message: 'User not found' });

        // RULE 1: CUSTOMER PRIVACY
        // Nobody (Admin or Staff) can manually reset a Customer's password.
        if (userToUpdate.role === 'customer') {
            return res.status(403).json({ 
                message: 'Action Denied: Customer passwords are private. Please ask them to use "Forgot Password".' 
            });
        }

        // RULE 2: STAFF LIMITATIONS
        if (req.user.role === 'staff') {
            // Staff can ONLY reset their OWN password.
            // We compare IDs as strings to ensure matching works correctly.
            if (String(req.user.id) !== String(req.params.id)) {
                return res.status(403).json({ 
                    message: 'Access Denied: You can only reset your own password.' 
                });
            }
        }

        // (Implicit Rule: Admins can reset Staff or other Admins because they pass Rule 1 and skip Rule 2)

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await User.updatePassword(req.params.id, hashedPassword);
        res.json({ message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server Error' });
    }
};

module.exports = { getUsers, createUser, deleteUser, resetUserPassword };