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
    const { name, email, mobile, password } = data;
    const errors = [];

    // Name: Letters and spaces only, 3-50 chars
    if (!/^[a-zA-Z\s]{3,50}$/.test(name)) errors.push("Name must contain only alphabets and be 3+ characters.");

    // Email: Standard regex
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Invalid email format.");

    // Mobile: 10 digits only
    if (!/^[0-9]{10}$/.test(mobile)) errors.push("Mobile must be 10 digits.");

    // Password: Min 6 chars
    if (!password || password.length < 6) errors.push("Password too short (min 6 chars).");

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
            address: req.body.address 
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
            address: safeData.address 
        });

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