const admin = require('../config/firebase'); // Import the admin SDK
const crypto = require('crypto'); // Built-in Node module for random passwords
const User = require('../models/User');
const OtpService = require('../services/otpService');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getUserLoyaltyStatus, reassessUserTier, issueBirthdayCouponForUser } = require('../services/loyaltyService');
const { sendEmailCommunication, sendWhatsapp } = require('../services/communications/communicationService');

const JWT_SECRET = String(process.env.JWT_SECRET || '').trim();
if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is required for authController');
}

const generateToken = (user) => {
    return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
};

// --- SECURITY HELPER FUNCTIONS ---

// 1. Sanitize String (Basic HTML/SQL escape)
const sanitize = (str) => {
    if (typeof str !== 'string') return '';
    // Removes characters often used in SQL injection or XSS
    return str.replace(/['";=<>]/g, '').trim();
};

const isEmail = (value = '') => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
const maskEmail = (value = '') => {
    const email = String(value || '').trim();
    const [local, domain] = email.split('@');
    if (!local || !domain) return '';
    const safeLocal = local.length <= 2
        ? `${local[0] || ''}*`
        : `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 3))}${local.slice(-1)}`;
    return `${safeLocal}@${domain}`;
};
const maskMobile = (value = '') => {
    const mobile = String(value || '').replace(/\D/g, '');
    if (mobile.length < 4) return '';
    if (mobile.length <= 6) return `${mobile.slice(0, 2)}${'*'.repeat(Math.max(0, mobile.length - 2))}`;
    return `${mobile.slice(0, 2)}${'*'.repeat(mobile.length - 4)}${mobile.slice(-2)}`;
};

const pickBySeed = (variants = [], seed = '') => {
    const list = Array.isArray(variants) ? variants : [];
    if (!list.length) return '';
    let hash = 0;
    const str = String(seed || '');
    for (let i = 0; i < str.length; i += 1) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    const idx = Math.abs(hash) % list.length;
    return list[idx];
};

const buildLoginOtpEmailTemplate = ({ user = {}, otp = '', maskedWhatsapp = '' } = {}) => {
    const customerName = String(user?.name || 'Customer').trim() || 'Customer';
    const email = String(user?.email || '').trim().toLowerCase();
    const seed = `${email}|${otp}|login-otp`;

    const subjects = [
        'Your Secure Login OTP for SSC Jewellery',
        'SSC Jewellery Login Code: Action Required',
        'Confirm Your Sign-In: One-Time Passcode Inside',
        'Your OTP Is Ready: Complete Login Securely',
        'SSC Jewellery Security Check: Enter Your OTP',
        'Login Verification Code for Your SSC Account',
        'Finish Sign-In: Your One-Time OTP',
        'Account Access OTP from SSC Jewellery',
        'Your Time-Sensitive Login OTP (Valid 5 Minutes)',
        'Security Confirmation Needed: Use This OTP'
    ];
    const openings = [
        `Dear ${customerName},`,
        `Hello ${customerName},`,
        `Hi ${customerName},`,
        `Greetings ${customerName},`,
        `${customerName}, welcome back,`,
        `Dear Valued Customer ${customerName},`,
        `Hello and thank you for choosing SSC Jewellery, ${customerName},`,
        `Hi ${customerName}, this is your account verification mail,`,
        `Dear ${customerName}, your login request was received,`,
        `Hello ${customerName}, we are sharing your secure login passcode below.`
    ];
    const assurances = [
        'If this request was not made by you, please ignore this email. Our team will continue to protect your account.',
        'If you did not request this OTP, no action is required. The code expires automatically in 5 minutes.',
        'For your safety, this OTP is valid only once and only for a short period.',
        'Please do not share this code with anyone, including support staff.',
        'Our administration team monitors suspicious login attempts and safeguards your account continuously.',
        'If this was not you, we recommend resetting your password after this expires.',
        'Your account security remains our priority; unauthorized attempts are automatically restricted.',
        'This OTP can be used only for this login attempt and cannot be reused.',
        'No payment or profile change can be made with this OTP alone.',
        'You are receiving this because a login request was initiated for your account.'
    ];
    const closings = [
        'Regards,\nSSC Jewellery Support Team',
        'Warm regards,\nSSC Jewellery Administration',
        'Sincerely,\nSSC Jewellery Customer Care',
        'Best regards,\nSSC Jewellery Security Desk',
        'Thank you,\nSSC Jewellery Team',
        'Kind regards,\nSSC Jewellery Service Team',
        'Respectfully,\nSSC Jewellery Account Protection Team',
        'With care,\nSSC Jewellery Support',
        'Thank you for trusting SSC Jewellery,\nCustomer Experience Team',
        'Yours faithfully,\nSSC Jewellery Help Desk'
    ];

    const subject = pickBySeed(subjects, `${seed}|subject`);
    const opening = pickBySeed(openings, `${seed}|opening`);
    const assurance = pickBySeed(assurances, `${seed}|assurance`);
    const closing = pickBySeed(closings, `${seed}|closing`);
    const whatsappLine = maskedWhatsapp
        ? `We also sent this OTP to your WhatsApp number ${maskedWhatsapp}.`
        : 'No WhatsApp number is linked to this account, so OTP was delivered by email only.';

    const text = [
        opening,
        '',
        `Your One-Time Password (OTP) is: ${otp}`,
        'This code is valid for 5 minutes.',
        whatsappLine,
        '',
        'Next steps:',
        '1. Enter this OTP on the login screen.',
        '2. Complete sign-in before the code expires.',
        '3. Request a new OTP if the timer runs out.',
        '',
        assurance,
        '',
        closing
    ].join('\n');

    const html = `
        <div style="font-family:Arial,Helvetica,sans-serif;background:#f8fafc;padding:20px;color:#111827;">
            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
                <tr>
                    <td style="padding:24px 24px 12px;font-size:15px;line-height:1.6;">
                        <p style="margin:0 0 12px;">${opening}</p>
                        <p style="margin:0 0 12px;">Please use the following One-Time Password to complete your login:</p>
                        <div style="margin:14px 0;padding:14px 16px;border-radius:10px;background:#111827;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:4px;text-align:center;">${otp}</div>
                        <p style="margin:0 0 12px;">This code is valid for <strong>5 minutes</strong>.</p>
                        <p style="margin:0 0 12px;">${whatsappLine}</p>
                        <p style="margin:0 0 8px;"><strong>Next steps:</strong></p>
                        <ol style="margin:0 0 12px 18px;padding:0;">
                            <li>Enter this OTP on the login screen.</li>
                            <li>Complete sign-in before the code expires.</li>
                            <li>Request a new OTP if needed.</li>
                        </ol>
                        <p style="margin:0 0 12px;">${assurance}</p>
                        <p style="margin:0;white-space:pre-line;">${closing}</p>
                    </td>
                </tr>
            </table>
        </div>
    `;

    return { subject, text, html };
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
        const identifier = sanitize(req.body.identifier).toLowerCase();
        const purpose = String(req.body.purpose || '').trim().toLowerCase();

        let user = null;
        let otpIdentity = mobile;
        if (purpose === 'login') {
            if (!identifier || !isEmail(identifier)) {
                return res.status(400).json({ message: 'Enter a valid registered email.' });
            }
            user = await User.findByEmail(identifier);
            if (!user) {
                return res.status(400).json({ message: 'Email not registered' });
            }
            if (!user.email || !isEmail(user.email)) {
                return res.status(400).json({
                    message: 'No email is registered for this account.',
                    delivery: { purpose: 'login', attempted: [], sent: [], missing: ['email'], failed: [] }
                });
            }
            otpIdentity = String(user.email).trim().toLowerCase();
        } else if (!/^[0-9]{10,12}$/.test(mobile)) {
            return res.status(400).json({ message: "Invalid mobile number." });
        }

        // 1. Generate OTP Here
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const otpStorageKey = OtpService.buildStorageKey(otpIdentity, purpose === 'login' ? 'login' : 'mobile');

        // 2. Save using our new Hybrid Service
        // - Local: Saves to RAM
        // - Prod: Saves to DB (Tests connection!)
        await OtpService.saveOtp(otpStorageKey, otp);

        const delivery = {
            purpose: purpose || 'general',
            attempted: [],
            sent: [],
            missing: [],
            failed: []
        };

        if (purpose === 'login' && user) {
            const userEmail = String(user.email || '').trim();
            const whatsappMobile = String(user.whatsapp || user.mobile || '').trim();
            const isWhatsappMobileValid = /^[0-9]{10,12}$/.test(whatsappMobile);

            if (!userEmail) {
                delivery.missing.push('email');
            } else {
                delivery.attempted.push('email');
                delivery.sent.push('email');
            }

            if (!isWhatsappMobileValid) {
                delivery.missing.push('whatsapp');
            } else {
                delivery.attempted.push('whatsapp');
                delivery.sent.push('whatsapp');
            }

            if (!delivery.sent.length) {
                return res.status(400).json({
                    message: 'OTP not sent. No active delivery channel found for this account.',
                    delivery
                });
            }

            delivery.contacts = {
                email: userEmail ? maskEmail(userEmail) : '',
                whatsapp: isWhatsappMobileValid ? maskMobile(whatsappMobile) : ''
            };

            // Fire-and-forget delivery so API response is instant for UI.
            void (async () => {
                if (userEmail) {
                    try {
                        const template = buildLoginOtpEmailTemplate({
                            user,
                            otp,
                            maskedWhatsapp: isWhatsappMobileValid ? maskMobile(whatsappMobile) : ''
                        });
                        await sendEmailCommunication({
                            to: userEmail,
                            subject: template.subject,
                            text: template.text,
                            html: template.html
                        });
                    } catch (error) {
                        console.error('OTP email delivery failed:', error?.message || error);
                    }
                }
                if (isWhatsappMobileValid) {
                    try {
                        await sendWhatsapp({
                            to: whatsappMobile,
                            message: `Your SSC Jewellery OTP is ${otp}. Valid for 5 minutes.`,
                            template: 'login_otp',
                            data: { otp }
                        });
                    } catch (error) {
                        console.error('OTP WhatsApp delivery failed:', error?.message || error);
                    }
                }
            })();
        }

        // 3. Send OTP to Frontend
        res.json({ 
            message: 'OTP generated', 
            debug_otp: otp,  // <--- This is how you retrieve it in Prod!
            delivery
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
        const registerOtpKey = OtpService.buildStorageKey(safeData.mobile, 'mobile');
        const isValidOtp = await OtpService.verifyOtp(registerOtpKey, safeData.otp, true);
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
            const otpIdentifier = String(safeIdentifier || safeMobile || '').trim().toLowerCase();
            if (!otpIdentifier) return res.status(400).json({ message: 'Email is required' });
            user = isEmail(otpIdentifier)
                ? await User.findByEmail(otpIdentifier)
                : await User.findByMobile(otpIdentifier);
            if (!user) return res.status(400).json({ message: 'User not found' });

            const emailIdentity = String(user.email || '').trim().toLowerCase();
            if (!emailIdentity || !isEmail(emailIdentity)) {
                return res.status(400).json({ message: 'No email is registered for this account' });
            }
            const otpStorageKey = OtpService.buildStorageKey(emailIdentity, 'login');
            const isValidOtp = await OtpService.verifyOtp(otpStorageKey, sanitize(otp));
            if (!isValidOtp) return res.status(400).json({ message: 'Invalid OTP' });
        }

        const token = generateToken(user);
        res.json({ message: 'Login successful', token, user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.socialLogin = async (req, res) => {
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

            // MANUALLY CONSTRUCT THE USER OBJECT FOR NEW USERS.
            // User.create() returns an object with `id` (string), not insertId.
            const createdUserId = (result && typeof result === 'object' && result.id)
                ? result.id
                : (result?.insertId || result);
            user = {
                id: createdUserId,
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
            message: 'Social Login successful', 
            token, 
            user: { ...user, picture } // Ensure 'role' is present in this object
        });

    } catch (error) {
        console.error("Social Auth Error:", error);
        error: error.message,
        res.status(401).json({ message: 'Invalid social auth token' });
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
        try {
            const loyalty = await getUserLoyaltyStatus(user.id);
            user.loyaltyTier = loyalty.tier;
            user.loyaltyProfile = loyalty.profile;
        } catch {}
        await issueBirthdayCouponForUser(user.id, { sendEmail: true }).catch(() => {});
        res.json({ user });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getLoyaltyStatus = async (req, res) => {
    try {
        const userId = req.user.id;
        await reassessUserTier(userId, { reason: 'on_demand_read', sendNotifications: false }).catch(() => {});
        const status = await getUserLoyaltyStatus(userId);
        return res.json({ status });
    } catch (error) {
        return res.status(500).json({ message: error?.message || 'Failed to fetch loyalty status' });
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

        const resetOtpKey = OtpService.buildStorageKey(mobile, 'mobile');
        const isValidOtp = await OtpService.verifyOtp(resetOtpKey, otp);
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
        const verifyOtpKey = OtpService.buildStorageKey(sanitize(mobile), 'mobile');
        // Pass 'false' to NOT delete the OTP yet
        const isValid = await OtpService.verifyOtp(verifyOtpKey, sanitize(otp), false);
        
        if (isValid) {
            res.json({ message: "OTP Verified", valid: true });
        } else {
            res.status(400).json({ message: "Invalid OTP", valid: false });
        }
    } catch (error) {
        res.status(500).json({ message: "Server error" });
    }
};
