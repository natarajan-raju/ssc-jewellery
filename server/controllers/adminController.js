const User = require('../models/User');
const Cart = require('../models/Cart');
const bcrypt = require('bcryptjs');
const CompanyProfile = require('../models/CompanyProfile');
const Coupon = require('../models/Coupon');
const {
    verifyEmailTransport,
    sendEmailCommunication,
    sendWhatsapp
} = require('../services/communications/communicationService');
const { getLoyaltyConfigForAdmin, updateLoyaltyConfigForAdmin, ensureLoyaltyConfigLoaded } = require('../services/loyaltyService');

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
    const { name, email, mobile, password, address, role, dob } = req.body;

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
            address,
            dob: dob || null
        });

        const io = req.app.get('io');
        if (io) {
            io.emit('user:create', newUser);
        }
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
        const io = req.app.get('io');
        if (io) {
            io.emit('user:delete', { id: req.params.id });
        }
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

// --- 5. GET USER CART (Admin/Staff) ---
const getUserCart = async (req, res) => {
    try {
        const userToFetch = await User.findById(req.params.id);
        if (!userToFetch) return res.status(404).json({ message: 'User not found' });
        const items = await Cart.getByUser(req.params.id);
        res.json({ items });
    } catch (error) {
        console.error('Admin cart fetch error:', error);
        res.status(500).json({ message: 'Server Error' });
    }
};

const verifyEmailChannel = async (_req, res) => {
    try {
        const result = await verifyEmailTransport();
        return res.json({ ok: true, channel: 'email', ...result });
    } catch (error) {
        return res.status(400).json({ ok: false, channel: 'email', message: error?.message || 'Email verification failed' });
    }
};

const sendTestEmail = async (req, res) => {
    try {
        const {
            to,
            subject = 'SSC Jewellery - Test Email',
            message = 'This is a test email from SSC Jewellery communications module.'
        } = req.body || {};

        if (!to) {
            return res.status(400).json({ message: 'Recipient email is required' });
        }

        const safeMessage = String(message || '').trim() || 'This is a test email from SSC Jewellery communications module.';
        const result = await sendEmailCommunication({
            to,
            subject,
            text: safeMessage,
            html: `<p>${safeMessage}</p>`
        });

        return res.json({
            ok: true,
            channel: 'email',
            result
        });
    } catch (error) {
        return res.status(400).json({ ok: false, channel: 'email', message: error?.message || 'Failed to send test email' });
    }
};

const getCompanyInfo = async (_req, res) => {
    try {
        const company = await CompanyProfile.get();
        return res.json({ company });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to fetch company info' });
    }
};

const updateCompanyInfo = async (req, res) => {
    try {
        const payload = req.body || {};
        const company = await CompanyProfile.update(payload);
        const io = req.app.get('io');
        if (io) {
            io.emit('company:info_update', { company });
        }
        return res.json({ company });
    } catch (error) {
        return res.status(400).json({ message: error?.message || 'Failed to update company info' });
    }
};

const getLoyaltyConfig = async (_req, res) => {
    try {
        const config = await getLoyaltyConfigForAdmin();
        return res.json({ config });
    } catch (error) {
        return res.status(500).json({ message: error?.message || 'Failed to fetch loyalty config' });
    }
};

const updateLoyaltyConfig = async (req, res) => {
    try {
        const items = Array.isArray(req.body?.config) ? req.body.config : [];
        const config = await updateLoyaltyConfigForAdmin(items);
        await ensureLoyaltyConfigLoaded({ force: true }).catch(() => {});
        return res.json({ config });
    } catch (error) {
        return res.status(400).json({ message: error?.message || 'Failed to update loyalty config' });
    }
};

const listCoupons = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1', 10) || 1;
        const limit = parseInt(req.query.limit || '20', 10) || 20;
        const search = String(req.query.search || '').trim();
        const sourceType = String(req.query.sourceType || 'all').trim().toLowerCase();
        const result = await Coupon.listCoupons({ page, limit, search, sourceType });
        return res.json({
            coupons: result.coupons,
            pagination: {
                currentPage: page,
                totalPages: result.totalPages,
                totalCoupons: result.total
            }
        });
    } catch (error) {
        return res.status(500).json({ message: error?.message || 'Failed to fetch coupons' });
    }
};

const createCoupon = async (req, res) => {
    try {
        if (String(req.user?.role || '').toLowerCase() !== 'admin') {
            return res.status(403).json({ message: 'Only admin can create coupons' });
        }
        const payload = req.body || {};
        if (!payload.startsAt) {
            return res.status(400).json({ message: 'start date is required' });
        }
        if (payload.expiresAt && new Date(payload.expiresAt).getTime() < new Date(payload.startsAt).getTime()) {
            return res.status(400).json({ message: 'end date must be on or after start date' });
        }
        const coupon = await Coupon.createCoupon(payload, { createdBy: req.user?.id || null });
        return res.status(201).json({ coupon });
    } catch (error) {
        return res.status(400).json({ message: error?.message || 'Failed to create coupon' });
    }
};

const issueCouponToUser = async (req, res) => {
    try {
        const userId = String(req.params.id || '').trim();
        if (!userId) return res.status(400).json({ message: 'Invalid user id' });
        const user = await User.findById(userId);
        if (!user || String(user.role || 'customer') !== 'customer') {
            return res.status(404).json({ message: 'Customer not found' });
        }
        const body = req.body || {};
        if (!body.startsAt) {
            return res.status(400).json({ message: 'start date is required' });
        }
        if (body.expiresAt && new Date(body.expiresAt).getTime() < new Date(body.startsAt).getTime()) {
            return res.status(400).json({ message: 'end date must be on or after start date' });
        }
        const coupon = await Coupon.createCoupon({
            name: body.name || `Customer Offer - ${user.name || userId}`,
            description: body.description || null,
            sourceType: 'admin',
            scopeType: 'customer',
            discountType: body.discountType || 'percent',
            discountValue: Number(body.discountValue || 0),
            maxDiscount: body.maxDiscount != null ? Number(body.maxDiscount) : null,
            minCartValue: body.minCartValue != null ? Number(body.minCartValue) : 0,
            usageLimitTotal: body.usageLimitTotal != null ? Number(body.usageLimitTotal) : null,
            usageLimitPerUser: Math.max(1, Number(body.usageLimitPerUser || 1)),
            startsAt: body.startsAt,
            expiresAt: body.expiresAt || null,
            customerTargets: [user.id]
        }, { createdBy: req.user?.id || null });

        const message = `Hi ${user.name || 'Customer'}, your coupon code is ${coupon.code}.`;
        const emailResult = user.email
            ? await sendEmailCommunication({
                to: user.email,
                subject: `${coupon.name} - Coupon Code`,
                text: `${message} Expires on ${coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString('en-IN') : 'N/A'}.`,
                html: `<p>${message}</p><p>Expires on: <strong>${coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString('en-IN') : 'N/A'}</strong></p>`
            }).catch(() => ({ ok: false }))
            : { ok: false, skipped: true, reason: 'missing_email' };

        const whatsappResult = user.mobile
            ? await sendWhatsapp({
                mobile: user.mobile,
                message: `${message} Use once per order.`
            }).catch(() => ({ ok: false }))
            : { ok: false, skipped: true, reason: 'missing_mobile' };

        return res.status(201).json({ coupon, delivery: { email: emailResult, whatsapp: whatsappResult } });
    } catch (error) {
        return res.status(400).json({ message: error?.message || 'Failed to issue coupon' });
    }
};

const getUserActiveCoupons = async (req, res) => {
    try {
        const userId = String(req.params.id || '').trim();
        if (!userId) return res.status(400).json({ message: 'Invalid user id' });
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        const coupons = await Coupon.getActiveCouponsByUser({
            userId,
            loyaltyTier: user.loyaltyTier || 'regular'
        });
        return res.json({ coupons });
    } catch (error) {
        return res.status(500).json({ message: error?.message || 'Failed to fetch active coupons' });
    }
};

module.exports = {
    getUsers,
    createUser,
    deleteUser,
    resetUserPassword,
    getUserCart,
    verifyEmailChannel,
    sendTestEmail,
    getCompanyInfo,
    updateCompanyInfo,
    getLoyaltyConfig,
    updateLoyaltyConfig,
    listCoupons,
    createCoupon,
    issueCouponToUser,
    getUserActiveCoupons
};
