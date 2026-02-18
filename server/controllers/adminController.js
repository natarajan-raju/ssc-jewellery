const User = require('../models/User');
const Cart = require('../models/Cart');
const bcrypt = require('bcryptjs');
const CompanyProfile = require('../models/CompanyProfile');
const Coupon = require('../models/Coupon');
const AbandonedCart = require('../models/AbandonedCart');
const {
    verifyEmailTransport,
    sendEmailCommunication,
    sendWhatsapp
} = require('../services/communications/communicationService');
const { getLoyaltyConfigForAdmin, updateLoyaltyConfigForAdmin, ensureLoyaltyConfigLoaded } = require('../services/loyaltyService');

const emitCouponChanged = (req, payload = {}) => {
    const io = req.app.get('io');
    if (!io) return;
    const eventPayload = { ...payload, ts: new Date().toISOString() };
    io.to('admin').emit('coupon:changed', eventPayload);
    const targets = Array.isArray(payload.userTargets)
        ? [...new Set(payload.userTargets.map((id) => String(id || '').trim()).filter(Boolean))]
        : [];
    targets.forEach((userId) => {
        io.to(`user:${userId}`).emit('coupon:changed', eventPayload);
    });
    if (payload.broadcast === true) {
        io.emit('coupon:changed', eventPayload);
    }
};

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
        const io = req.app.get('io');
        if (io) {
            io.emit('loyalty:config_update', { config });
        }
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
        emitCouponChanged(req, {
            action: 'created',
            couponId: coupon?.id || null,
            scopeType: coupon?.scope_type || payload.scopeType || 'generic',
            sourceType: coupon?.source_type || payload.sourceType || 'admin',
            broadcast: true
        });
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

        const customerName = user.name || 'Customer';
        const expiryLabel = coupon.expires_at ? new Date(coupon.expires_at).toLocaleDateString('en-IN') : 'No expiry';
        const offerLabel = String(coupon.discount_type || body.discountType || 'percent').toLowerCase() === 'fixed'
            ? `₹${Number(coupon.discount_value || body.discountValue || 0).toLocaleString('en-IN')} OFF`
            : `${Number(coupon.discount_value || body.discountValue || 0)}% OFF`;
        const message = `Hi ${customerName}, your coupon code is ${coupon.code}.`;
        const [emailResult, whatsappResult] = await Promise.all([
            user.email
                ? sendEmailCommunication({
                    to: user.email,
                    subject: `${customerName}, a little surprise from SSC Jewellery`,
                    text: [
                        `Hi ${customerName},`,
                        '',
                        `We are so glad to have you with us.`,
                        `As a small thank-you, here is a special offer for your next order:`,
                        '',
                        `Coupon code: ${coupon.code}`,
                        `Offer: ${offerLabel}`,
                        `Valid till: ${expiryLabel}`,
                        '',
                        `Whenever you are ready, apply this code at checkout and enjoy your savings.`,
                        '',
                        `With warmth,`,
                        `Team SSC Jewellery`
                    ].join('\n'),
                    html: `
                        <div style="font-family:Arial,Helvetica,sans-serif;background:#f7f7f8;padding:20px;color:#111827;">
                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
                                <tr>
                                    <td style="padding:22px 22px 8px;">
                                        <div style="font-size:22px;font-weight:700;color:#111827;">A little surprise for you</div>
                                        <div style="font-size:14px;color:#4b5563;margin-top:8px;">Hi ${customerName}, we are so glad to have you with us at SSC Jewellery.</div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:0 22px 8px;">
                                        <div style="font-size:14px;color:#111827;">As a small thank-you, here is a special offer for your next order:</div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:8px 22px;">
                                        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;background:#fafafa;">
                                            <tr>
                                                <td style="padding:14px 16px;">
                                                    <div style="font-size:12px;color:#6b7280;letter-spacing:0.04em;text-transform:uppercase;">Coupon Code</div>
                                                    <div style="font-size:22px;font-weight:700;color:#111827;margin-top:4px;">${coupon.code}</div>
                                                    <div style="font-size:14px;color:#111827;margin-top:8px;">Offer: <strong>${offerLabel}</strong></div>
                                                    <div style="font-size:14px;color:#111827;margin-top:4px;">Valid till: <strong>${expiryLabel}</strong></div>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:8px 22px 20px;font-size:13px;color:#6b7280;">
                                        Whenever you are ready, apply this code at checkout and enjoy your savings.
                                        <br/><br/>
                                        With warmth,<br/>
                                        <strong>Team SSC Jewellery</strong>
                                    </td>
                                </tr>
                            </table>
                        </div>
                    `
                }).catch(() => ({ ok: false }))
                : Promise.resolve({ ok: false, skipped: true, reason: 'missing_email' }),
            user.mobile
                ? sendWhatsapp({
                    mobile: user.mobile,
                    message: `${message} Use once per order.`
                }).catch(() => ({ ok: false }))
                : Promise.resolve({ ok: false, skipped: true, reason: 'missing_mobile' })
        ]);

        emitCouponChanged(req, {
            action: 'created',
            couponId: coupon?.id || null,
            scopeType: 'customer',
            sourceType: 'admin',
            userTargets: [user.id]
        });

        return res.status(201).json({ coupon, delivery: { email: emailResult, whatsapp: whatsappResult } });
    } catch (error) {
        return res.status(400).json({ message: error?.message || 'Failed to issue coupon' });
    }
};

const deleteCoupon = async (req, res) => {
    try {
        if (String(req.user?.role || '').toLowerCase() !== 'admin') {
            return res.status(403).json({ message: 'Only admin can delete coupons' });
        }
        const couponId = Number(req.params.couponId || req.params.id || 0);
        if (!Number.isFinite(couponId) || couponId <= 0) {
            return res.status(400).json({ message: 'Invalid coupon id' });
        }
        const coupon = await Coupon.getById(couponId);
        if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
        const affected = await Coupon.deactivateCoupon(couponId);
        if (!affected) return res.status(400).json({ message: 'Coupon is already inactive' });
        emitCouponChanged(req, {
            action: 'deleted',
            couponId,
            code: coupon.code || null,
            scopeType: coupon.scope_type || 'generic',
            sourceType: coupon.source_type || 'admin',
            userTargets: coupon.scope_type === 'customer' ? (coupon.customerTargets || []) : [],
            broadcast: coupon.scope_type !== 'customer'
        });
        return res.json({ ok: true, id: couponId });
    } catch (error) {
        return res.status(400).json({ message: error?.message || 'Failed to delete coupon' });
    }
};

const deleteUserCoupon = async (req, res) => {
    try {
        if (String(req.user?.role || '').toLowerCase() !== 'admin') {
            return res.status(403).json({ message: 'Only admin can delete coupons' });
        }
        const userId = String(req.params.id || '').trim();
        const couponIdRaw = String(req.params.couponId || '').trim();
        if (!userId || !couponIdRaw) {
            return res.status(400).json({ message: 'Invalid coupon id' });
        }

        if (couponIdRaw.startsWith('abandoned:')) {
            const code = couponIdRaw.slice('abandoned:'.length);
            const affected = await AbandonedCart.deactivateDiscountByCodeForUser({ userId, code });
            if (!affected) return res.status(404).json({ message: 'Coupon not found or already inactive' });
            emitCouponChanged(req, {
                action: 'deleted',
                code: String(code || '').toUpperCase(),
                scopeType: 'customer',
                sourceType: 'abandoned',
                userTargets: [userId]
            });
            return res.json({ ok: true, id: couponIdRaw });
        }

        const couponId = Number(couponIdRaw);
        if (!Number.isFinite(couponId) || couponId <= 0) {
            return res.status(400).json({ message: 'Invalid coupon id' });
        }
        const coupon = await Coupon.getById(couponId);
        if (!coupon) return res.status(404).json({ message: 'Coupon not found' });
        const affected = await Coupon.deactivateCoupon(couponId);
        if (!affected) return res.status(400).json({ message: 'Coupon is already inactive' });
        emitCouponChanged(req, {
            action: 'deleted',
            couponId,
            code: coupon.code || null,
            scopeType: coupon.scope_type || 'generic',
            sourceType: coupon.source_type || 'admin',
            userTargets: [userId]
        });
        return res.json({ ok: true, id: couponId });
    } catch (error) {
        return res.status(400).json({ message: error?.message || 'Failed to delete coupon' });
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
    deleteCoupon,
    deleteUserCoupon,
    issueCouponToUser,
    getUserActiveCoupons
};
