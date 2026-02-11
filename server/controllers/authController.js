const admin = require('../config/firebase'); // Import the admin SDK
const crypto = require('crypto'); // Built-in Node module for random passwords
const User = require('../models/User');
const OtpService = require('../services/otpService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const generateToken = (user) => {
    return jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET || 'secret', { expiresIn: '7d' });
};

// --- SECURITY HELPER FUNCTIONS ---

// 1. Sanitize String (Basic HTML/SQL escape)
const sanitize = (str) => {
    if (typeof str !== 'string') return '';
    // Removes characters often used in SQL injection or XSS
    return str.replace(/['";=<>]/g, '').trim();
};

// 2. Validate Input Format
const validateRegistration = (data) => {
    const { name, email, mobile, password, dob } = data;
    const errors = [];

    // Name: Letters and spaces only, 3-50 chars
    if (!/^[a-zA-Z\s]{3,50}$/.test(name)) errors.push("Name must contain only alphabets and be 3+ characters.");

    // Email: Standard regex
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Invalid email format.");

    // Mobile: 10 digits only
    if (!/^[0-9]{10}$/.test(mobile)) errors.push("Mobile must be 10 digits.");

    // Password: Min 6 chars
    if (!password || password.length < 6) errors.push("Password too short (min 6 chars).");
    // DOB: Optional, must be YYYY-MM-DD if provided
    if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) errors.push("DOB must be in YYYY-MM-DD format.");

    return errors;
};

// --- CONTROLLERS ---

exports.sendOtp = async (req, res) => {
    try {
        const mobile = sanitize(req.body.mobile);
        if (!/^[0-9]{10,12}$/.test(mobile)) {
            return res.status(400).json({ message: "Invalid mobile number." });
        }

        // 1. Generate OTP Here
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // 2. Save using our new Hybrid Service
        // - Local: Saves to RAM
        // - Prod: Saves to DB (Tests connection!)
        await OtpService.saveOtp(mobile, otp);

        // 3. Send OTP to Frontend
        res.json({ 
            message: 'OTP generated', 
            debug_otp: otp  // <--- This is how you retrieve it in Prod!
        });

    } catch (error) {
        console.error("❌ OTP Error:", error);
        // Returns the specific DB error if in Prod
        res.status(500).json({ 
            message: "Error: " + error.message 
        });
    }
};
exports.register = async (req, res) => {
    try {
        // ... sanitize logic ...
        const safeData = {
            name: sanitize(req.body.name),
            email: sanitize(req.body.email).toLowerCase(),
            mobile: sanitize(req.body.mobile),
            password: req.body.password,
            otp: sanitize(req.body.otp),
            address: req.body.address,
            billingAddress: req.body.billingAddress,
            dob: req.body.dob || null
        };

        // ... validation logic ...
        const validationErrors = validateRegistration(safeData);
        if (validationErrors.length > 0) {
            return res.status(400).json({ message: validationErrors[0] });
        }

        // Check user existence
       
        const existingEmail = await User.findByEmail(safeData.email);
        const existingMobile = await User.findByMobile(safeData.mobile);

        if (existingEmail || existingMobile) {
            return res.status(409).json({ message: 'User already exists' });
        }

        // Verify OTP (Consume/Delete it here using 'true')
        const isValidOtp = await OtpService.verifyOtp(safeData.mobile, safeData.otp, true);
        if (!isValidOtp) return res.status(400).json({ message: 'Invalid or Expired OTP' });

        // Hash & Create
        const hashedPassword = await bcrypt.hash(safeData.password, 10);
        const user = await User.create({ 
            name: safeData.name, 
            email: safeData.email, 
            mobile: safeData.mobile, 
            password: hashedPassword, 
            address: safeData.address,
            billingAddress: safeData.billingAddress,
            dob: safeData.dob
        });

        const io = req.app.get('io');
        if (io) {
            io.emit('user:create', user);
        }
        const token = generateToken(user);
        res.status(201).json({ message: 'Registered successfully', token, user });

    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
exports.login = async (req, res) => {
    try {
        const { type, identifier, password, mobile, otp } = req.body;
        
        // Sanitize inputs
        const safeIdentifier = sanitize(identifier);
        const safeMobile = sanitize(mobile);

        let user;

        if (type === 'password') {
            const userByEmail = await User.findByEmail(identifier);
            const userByMobile = await User.findByMobile(identifier);
            user = userByEmail || userByMobile;
            if (!user) return res.status(400).json({ message: 'User not found' });

            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(400).json({ message: 'Invalid credentials' });
        } 
        else if (type === 'otp') {
            user = await User.findByMobile(safeMobile);
            if (!user) return res.status(400).json({ message: 'Mobile not registered' });

            const isValidOtp = await OtpService.verifyOtp(safeMobile, sanitize(otp));
            if (!isValidOtp) return res.status(400).json({ message: 'Invalid OTP' });
        }

        const token = generateToken(user);
        res.json({ message: 'Login successful', token, user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.googleLogin = async (req, res) => {
    try {
        const { idToken } = req.body;
        
        // 1. Verify Token
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { email, name, picture } = decodedToken;

        // 2. Find or Create User
        let user = await User.findByEmail(email);
        let isNewUser = false;

        if (!user) {
            isNewUser = true;
            const randomPassword = crypto.randomBytes(16).toString('hex');
            const hashedPassword = await bcrypt.hash(randomPassword, 10);
            const dummyMobile = null; // Or use a dummy number if your DB requires it

            // Create returns insertId usually, so we must construct the object manually
            const result = await User.create({
                name: name || 'Google User',
                email: email,
                mobile: dummyMobile,
                password: hashedPassword,
                address: null,
                role: 'customer'
            });

            // MANUALLY CONSTRUCT THE USER OBJECT FOR NEW USERS
            user = {
                id: result.insertId || result, // Handle various return types
                name: name || 'Google User',
                email: email,
                role: 'customer',
                picture: picture
            };
        }

        // 3. Generate Token
        const token = generateToken(user);
        
        // 4. Send Response
        res.json({ 
            message: 'Google Login successful', 
            token, 
            user: { ...user, picture } // Ensure 'role' is present in this object
        });

    } catch (error) {
        console.error("Google Auth Error:", error);
        error: error.message,
        res.status(401).json({ message: 'Invalid Google Token' });
    }
};

exports.getProfile = async (req, res) => {
    try {
        // `protect` middleware already resolves the latest user from DB.
        const user = req.user;
        if (!user) {
            return res.status(401).json({ message: 'Not authorized' });
        }
        delete user.password;
        res.json({ user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id; // From the JWT token
        const { name, email, mobile, password, address, billingAddress, profileImage, dob, birthdayOfferClaimedYear } = req.body;
        const safeName = sanitize(name);
        const safeEmail = email ? sanitize(email).toLowerCase() : '';

        // 1. Check if mobile is already taken by ANOTHER user
        if (mobile) {
            const existingUser = await User.findByMobile(mobile);
            if (existingUser && existingUser.id !== userId) {
                return res.status(400).json({ message: 'Mobile number already in use' });
            }
        }
        if (safeEmail) {
            const existingEmail = await User.findByEmail(safeEmail);
            if (existingEmail && existingEmail.id !== userId) {
                return res.status(400).json({ message: 'Email already in use' });
            }
        }

        if (dob && !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
            return res.status(400).json({ message: 'DOB must be in YYYY-MM-DD format' });
        }

        const existingUser = await User.findById(userId);
        if (!existingUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        let dobLockedUpdate;
        if (dob !== undefined) {
            const incomingDob = dob === '' ? null : dob;
            const currentDob = existingUser.dob || null;
            const hasDobChanged = incomingDob !== currentDob;
            if (hasDobChanged && existingUser.dobLocked) {
                return res.status(400).json({ message: 'DOB can only be changed once after registration' });
            }
            if (hasDobChanged) {
                dobLockedUpdate = true;
            }
        }

        if (birthdayOfferClaimedYear !== undefined) {
            const yearNow = new Date().getFullYear();
            if (Number(birthdayOfferClaimedYear) !== yearNow) {
                return res.status(400).json({ message: 'Invalid birthday claim year' });
            }
            if (existingUser.birthdayOfferClaimedYear === yearNow) {
                return res.status(409).json({ message: 'Birthday offer already claimed this year' });
            }
            const dobValue = existingUser.dob;
            const [_, month, day] = String(dobValue || '').split('T')[0].split('-');
            const now = new Date();
            const isBirthdayToday = !!month && !!day && Number(month) === now.getMonth() + 1 && Number(day) === now.getDate();
            if (!isBirthdayToday) {
                return res.status(400).json({ message: 'Birthday offer can only be claimed on your birthday' });
            }
        }

        // 2. Hash Password if provided
        let hashedPassword = null;
        if (password) {
            hashedPassword = await bcrypt.hash(password, 10);
        }

        // 3. Update Database (You need to add this method to your User model)
        await User.updateProfile(userId, {
            name: safeName || undefined,
            email: safeEmail || undefined,
            mobile,
            address,
            billingAddress,
            profileImage,
            dob: dob === '' ? null : dob,
            dobLocked: dobLockedUpdate,
            birthdayOfferClaimedYear: birthdayOfferClaimedYear === undefined ? undefined : birthdayOfferClaimedYear,
            password: hashedPassword
        });

        const updatedUser = await User.findById(userId);
        const io = req.app.get('io');
        if (io) {
            io.emit('user:update', updatedUser);
        }

        res.json({ message: 'Profile updated successfully', user: updatedUser });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// ... resetPassword logic (similar sanitization should apply) ...
exports.resetPassword = async (req, res) => {
    try {
        const mobile = sanitize(req.body.mobile);
        const otp = sanitize(req.body.otp);
        const newPassword = req.body.newPassword;

        const user = User.findByMobile(mobile);
        if (!user) return res.status(400).json({ message: 'User not found' });

        const isValidOtp = await OtpService.verifyOtp(mobile, otp);
        if (!isValidOtp) return res.status(400).json({ message: 'Invalid OTP' });

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        User.updatePassword(mobile, hashedPassword);

        res.json({ message: 'Password reset successful' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


exports.verifyOtpOnly = async (req, res) => {
    try {
        const { mobile, otp } = req.body;
        // Pass 'false' to NOT delete the OTP yet
        const isValid = await OtpService.verifyOtp(mobile, otp, false);
        
        if (isValid) {
            res.json({ message: "OTP Verified", valid: true });
        } else {
            res.status(400).json({ message: "Invalid OTP", valid: false });
        }
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};
