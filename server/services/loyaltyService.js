const db = require('../config/db');
const User = require('../models/User');
const { sendOrderLifecycleCommunication, sendEmailCommunication } = require('./communications/communicationService');

const TIER_ORDER = ['regular', 'bronze', 'silver', 'gold', 'platinum'];

const LOYALTY_CONFIG = {
    regular: {
        label: 'Regular',
        color: '#4B5563',
        threshold: 0,
        windowDays: 30,
        extraDiscountPct: 0,
        shippingDiscountPct: 0,
        abandonedCartBoostPct: 0,
        priorityWeight: 0,
        shippingPriority: 'standard',
        benefits: ['Standard pricing', 'Standard shipping', 'Progress tracking to next tier']
    },
    bronze: {
        label: 'Bronze',
        color: '#CD7F32',
        threshold: 5000,
        windowDays: 30,
        extraDiscountPct: 1,
        shippingDiscountPct: 5,
        abandonedCartBoostPct: 2,
        priorityWeight: 1,
        shippingPriority: 'standard_plus',
        benefits: ['1% extra member discount', '5% shipping fee discount', 'Priority support queue']
    },
    silver: {
        label: 'Silver',
        color: '#9CA3AF',
        threshold: 10000,
        windowDays: 60,
        extraDiscountPct: 2,
        shippingDiscountPct: 10,
        abandonedCartBoostPct: 4,
        priorityWeight: 2,
        shippingPriority: 'high',
        benefits: ['2% extra member discount', '10% shipping fee discount', 'High priority dispatch queue']
    },
    gold: {
        label: 'Gold',
        color: '#D4AF37',
        threshold: 25000,
        windowDays: 90,
        extraDiscountPct: 3,
        shippingDiscountPct: 15,
        abandonedCartBoostPct: 6,
        priorityWeight: 3,
        shippingPriority: 'higher',
        benefits: ['3% extra member discount', '15% shipping fee discount', 'Faster dispatch + premium support']
    },
    platinum: {
        label: 'Platinum',
        color: '#60A5FA',
        threshold: 100000,
        windowDays: 365,
        extraDiscountPct: 5,
        shippingDiscountPct: 25,
        abandonedCartBoostPct: 10,
        priorityWeight: 4,
        shippingPriority: 'highest',
        benefits: ['5% extra member discount', '25% shipping fee discount', 'Top priority dispatch + premium concierge']
    }
};

const toMoney = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
};

const computeTierFromSpends = ({ spend30 = 0, spend60 = 0, spend90 = 0, spend365 = 0 } = {}) => {
    if (spend365 >= LOYALTY_CONFIG.platinum.threshold) return 'platinum';
    if (spend90 >= LOYALTY_CONFIG.gold.threshold) return 'gold';
    if (spend60 >= LOYALTY_CONFIG.silver.threshold) return 'silver';
    if (spend30 >= LOYALTY_CONFIG.bronze.threshold) return 'bronze';
    return 'regular';
};

const buildProgress = ({ tier = 'regular', spend30 = 0, spend60 = 0, spend90 = 0, spend365 = 0 } = {}) => {
    const currentIndex = TIER_ORDER.indexOf(tier);
    const nextTier = currentIndex >= 0 && currentIndex < TIER_ORDER.length - 1
        ? TIER_ORDER[currentIndex + 1]
        : null;
    if (!nextTier) {
        return {
            nextTier: null,
            needed: 0,
            progressPct: 100,
            message: 'You are at the highest tier.'
        };
    }

    const nextCfg = LOYALTY_CONFIG[nextTier];
    const baseSpend = (() => {
        if (nextTier === 'bronze') return spend30;
        if (nextTier === 'silver') return spend60;
        if (nextTier === 'gold') return spend90;
        return spend365;
    })();
    const needed = Math.max(0, toMoney(nextCfg.threshold - baseSpend));
    const progressPct = Math.min(100, Math.max(0, Math.round((baseSpend / nextCfg.threshold) * 100)));
    return {
        nextTier,
        needed,
        progressPct,
        message: needed > 0
            ? `Spend INR ${needed.toLocaleString('en-IN')} more to unlock ${nextCfg.label}.`
            : `You have unlocked ${nextCfg.label}.`
    };
};

const getUserSpendWindows = async (userId, connection = db) => {
    const [rows] = await connection.execute(
        `SELECT
            COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN GREATEST(0, subtotal - COALESCE(coupon_discount_value, 0) - COALESCE(loyalty_discount_total, 0)) ELSE 0 END), 0) as spend30,
            COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 60 DAY) THEN GREATEST(0, subtotal - COALESCE(coupon_discount_value, 0) - COALESCE(loyalty_discount_total, 0)) ELSE 0 END), 0) as spend60,
            COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY) THEN GREATEST(0, subtotal - COALESCE(coupon_discount_value, 0) - COALESCE(loyalty_discount_total, 0)) ELSE 0 END), 0) as spend90,
            COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 365 DAY) THEN GREATEST(0, subtotal - COALESCE(coupon_discount_value, 0) - COALESCE(loyalty_discount_total, 0)) ELSE 0 END), 0) as spend365
         FROM orders
         WHERE user_id = ?
           AND LOWER(COALESCE(payment_status, '')) = 'paid'
           AND LOWER(COALESCE(status, '')) <> 'cancelled'`,
        [userId]
    );
    const row = rows[0] || {};
    return {
        spend30: toMoney(row.spend30),
        spend60: toMoney(row.spend60),
        spend90: toMoney(row.spend90),
        spend365: toMoney(row.spend365)
    };
};

const getLoyaltyProfileByTier = (tier = 'regular') => {
    return LOYALTY_CONFIG[tier] || LOYALTY_CONFIG.regular;
};

const calculateOrderLoyaltyAdjustments = ({ subtotal = 0, shippingFee = 0, couponDiscount = 0, tier = 'regular' } = {}) => {
    const profile = getLoyaltyProfileByTier(tier);
    const eligibleBase = Math.max(0, toMoney(subtotal - couponDiscount));
    const loyaltyDiscount = toMoney((eligibleBase * Number(profile.extraDiscountPct || 0)) / 100);
    const shippingDiscount = toMoney((toMoney(shippingFee) * Number(profile.shippingDiscountPct || 0)) / 100);
    return {
        tier,
        profile,
        loyaltyDiscount,
        shippingDiscount
    };
};

const getUserLoyaltyStatus = async (userId) => {
    if (!userId) {
        const progress = buildProgress({ tier: 'regular' });
        return {
            tier: 'regular',
            profile: LOYALTY_CONFIG.regular,
            spends: { spend30: 0, spend60: 0, spend90: 0, spend365: 0 },
            progress,
            nextTierProfile: progress?.nextTier ? getLoyaltyProfileByTier(progress.nextTier) : null
        };
    }
    const spends = await getUserSpendWindows(userId);
    const tier = computeTierFromSpends(spends);
    const progress = buildProgress({
        tier,
        spend30: spends.spend30,
        spend60: spends.spend60,
        spend90: spends.spend90,
        spend365: spends.spend365
    });
    return {
        tier,
        profile: getLoyaltyProfileByTier(tier),
        spends,
        progress,
        nextTierProfile: progress?.nextTier ? getLoyaltyProfileByTier(progress.nextTier) : null
    };
};

const sendTierUpgradeMail = async ({ user, previousTier, newTier, status }) => {
    if (!user?.email) return;
    await sendOrderLifecycleCommunication({
        stage: 'processing',
        customer: user,
        order: { order_ref: `Tier Upgrade`, total: 0 }
    }).catch(() => {});
    const label = getLoyaltyProfileByTier(newTier).label;
    await sendEmailCommunication({
        to: user.email,
        subject: `Membership Upgrade: ${label}`,
        text: `Hi ${user.name || 'Customer'}, your membership has been upgraded from ${previousTier} to ${newTier}.`,
        html: `<p>Hi ${user.name || 'Customer'},</p><p>Great news! Your membership has been upgraded from <strong>${previousTier}</strong> to <strong>${label}</strong>.</p><p>${status?.progress?.message || ''}</p>`
    });
};

const sendTierDowngradeMail = async ({ user, previousTier, newTier, status }) => {
    if (!user?.email) return;
    const newLabel = getLoyaltyProfileByTier(newTier).label;
    await sendEmailCommunication({
        to: user.email,
        subject: `Membership Update: ${newLabel}`,
        text: `Hi ${user.name || 'Customer'}, your membership has moved from ${previousTier} to ${newTier}.`,
        html: `<p>Hi ${user.name || 'Customer'},</p><p>Your membership has changed from <strong>${previousTier}</strong> to <strong>${newLabel}</strong>.</p><p>${status?.progress?.message || ''}</p>`
    });
};

const sendMonthlyStatusSummaryMail = async ({ user, status }) => {
    if (!user?.email || !status) return;
    await sendEmailCommunication({
        to: user.email,
        subject: `Your Monthly Membership Summary`,
        text: `Current tier: ${status?.profile?.label || status?.tier || 'Regular'}. ${status?.progress?.message || ''}`,
        html: `<p>Hi ${user.name || 'Customer'},</p><p>Current tier: <strong>${status?.profile?.label || status?.tier || 'Regular'}</strong>.</p><p>${status?.progress?.message || ''}</p>`
    });
};

const sendFomoMailIfEligible = async ({ user, status }) => {
    if (!user?.email) return;
    const pct = Number(status?.progress?.progressPct || 0);
    if (pct < 75 || pct >= 100) return;
    const nextTier = status?.progress?.nextTier;
    if (!nextTier) return;
    const nextLabel = getLoyaltyProfileByTier(nextTier).label;
    await sendEmailCommunication({
        to: user.email,
        subject: `You are close to ${nextLabel} tier`,
        text: `Hi ${user.name || 'Customer'}, ${status?.progress?.message || ''}`,
        html: `<p>Hi ${user.name || 'Customer'},</p><p>You are <strong>${pct}%</strong> towards <strong>${nextLabel}</strong>.</p><p>${status?.progress?.message || ''}</p>`
    });
};

const reassessUserTier = async (userId, { reason = 'monthly_reassessment', sendNotifications = false } = {}) => {
    const status = await getUserLoyaltyStatus(userId);
    const [existingRows] = await db.execute(
        'SELECT tier FROM user_loyalty WHERE user_id = ? LIMIT 1',
        [userId]
    );
    const previousTier = String(existingRows[0]?.tier || 'regular').toLowerCase();
    const nextTier = status.tier;

    await db.execute(
        `INSERT INTO user_loyalty
            (user_id, tier, evaluated_at, spend_30d, spend_60d, spend_90d, spend_365d, progress_json, benefits_json)
         VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            tier = VALUES(tier),
            evaluated_at = VALUES(evaluated_at),
            spend_30d = VALUES(spend_30d),
            spend_60d = VALUES(spend_60d),
            spend_90d = VALUES(spend_90d),
            spend_365d = VALUES(spend_365d),
            progress_json = VALUES(progress_json),
            benefits_json = VALUES(benefits_json)`,
        [
            userId,
            nextTier,
            status.spends.spend30,
            status.spends.spend60,
            status.spends.spend90,
            status.spends.spend365,
            JSON.stringify(status.progress || {}),
            JSON.stringify(status.profile || {})
        ]
    );

    if (previousTier !== nextTier) {
        await db.execute(
            `INSERT INTO user_loyalty_history
                (user_id, previous_tier, new_tier, reason, meta_json)
             VALUES (?, ?, ?, ?, ?)`,
            [userId, previousTier, nextTier, reason, JSON.stringify({ spends: status.spends, progress: status.progress })]
        );
    }

    if (sendNotifications) {
        const user = await User.findById(userId);
        if (previousTier !== nextTier && TIER_ORDER.indexOf(nextTier) > TIER_ORDER.indexOf(previousTier)) {
            await sendTierUpgradeMail({ user, previousTier, newTier: nextTier, status }).catch(() => {});
        } else if (previousTier !== nextTier && TIER_ORDER.indexOf(nextTier) < TIER_ORDER.indexOf(previousTier)) {
            await sendTierDowngradeMail({ user, previousTier, newTier: nextTier, status }).catch(() => {});
        }
        await sendFomoMailIfEligible({ user, status }).catch(() => {});
        if (reason === 'monthly_reassessment') {
            await sendMonthlyStatusSummaryMail({ user, status }).catch(() => {});
        }
    }

    return { previousTier, nextTier, status };
};

const runMonthlyLoyaltyReassessment = async () => {
    const [rows] = await db.execute("SELECT id FROM users WHERE role = 'customer'");
    let upgraded = 0;
    let changed = 0;
    for (const row of rows) {
        const result = await reassessUserTier(row.id, { reason: 'monthly_reassessment', sendNotifications: true });
        if (result.previousTier !== result.nextTier) {
            changed += 1;
            if (TIER_ORDER.indexOf(result.nextTier) > TIER_ORDER.indexOf(result.previousTier)) upgraded += 1;
        }
    }
    return { total: rows.length, changed, upgraded };
};

module.exports = {
    TIER_ORDER,
    LOYALTY_CONFIG,
    getLoyaltyProfileByTier,
    getUserLoyaltyStatus,
    calculateOrderLoyaltyAdjustments,
    reassessUserTier,
    runMonthlyLoyaltyReassessment
};
