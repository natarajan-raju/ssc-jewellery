const db = require('../config/db');
const User = require('../models/User');
const Coupon = require('../models/Coupon');
const { sendOrderLifecycleCommunication, sendEmailCommunication } = require('./communications/communicationService');

const TIER_ORDER = ['regular', 'bronze', 'silver', 'gold', 'platinum'];

const DEFAULT_LOYALTY_CONFIG = {
    regular: {
        label: 'Regular',
        color: '#4B5563',
        threshold: 0,
        windowDays: 30,
        extraDiscountPct: 0,
        shippingDiscountPct: 0,
        birthdayDiscountPct: 10,
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
        birthdayDiscountPct: 10,
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
        birthdayDiscountPct: 10,
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
        birthdayDiscountPct: 10,
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
        birthdayDiscountPct: 10,
        abandonedCartBoostPct: 10,
        priorityWeight: 4,
        shippingPriority: 'highest',
        benefits: ['5% extra member discount', '25% shipping fee discount', 'Top priority dispatch + premium concierge']
    }
};
const LOYALTY_CONFIG_CACHE = {
    loadedAt: 0,
    expiresAt: 0,
    byTier: { ...DEFAULT_LOYALTY_CONFIG }
};
const LOYALTY_CACHE_TTL_MS = 5 * 60 * 1000;

const toMoney = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
};

const normalizeBenefits = (value, fallback = []) => {
    if (Array.isArray(value)) return value.map((entry) => String(entry || '').trim()).filter(Boolean);
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.map((entry) => String(entry || '').trim()).filter(Boolean);
        } catch {}
    }
    return Array.isArray(fallback) ? fallback : [];
};

const normalizeShippingPriority = (value = 'standard') => {
    const v = String(value || '').toLowerCase();
    if (['standard', 'standard_plus', 'high', 'higher', 'highest'].includes(v)) return v;
    return 'standard';
};

const buildBenefitsFromValues = (tier, config = {}) => {
    const t = String(tier || 'regular').toLowerCase();
    if (t === 'regular') {
        return ['Standard pricing', 'Standard shipping', 'Progress tracking to next tier'];
    }
    const extraDiscountPct = toMoney(config.extraDiscountPct ?? 0);
    const shippingDiscountPct = toMoney(config.shippingDiscountPct ?? 0);
    const birthdayDiscountPct = toMoney(config.birthdayDiscountPct ?? 10);
    const abandonedCartBoostPct = toMoney(config.abandonedCartBoostPct ?? 0);
    const priorityWeight = Number(config.priorityWeight ?? 0);
    const shippingPriority = normalizeShippingPriority(config.shippingPriority || 'standard');
    const shippingPriorityLabel = {
        standard: 'Standard dispatch queue',
        standard_plus: 'Standard+ dispatch queue',
        high: 'High dispatch priority',
        higher: 'Higher dispatch priority',
        highest: 'Highest dispatch priority'
    }[shippingPriority];
    const priorityLine = priorityWeight > 0
        ? `${shippingPriorityLabel} (weight ${priorityWeight})`
        : shippingPriorityLabel;
    return [
        `${extraDiscountPct}% extra member discount`,
        `${shippingDiscountPct}% shipping fee discount`,
        `${birthdayDiscountPct}% birthday coupon offer`,
        `${abandonedCartBoostPct}% abandoned cart offer boost`,
        priorityLine
    ];
};

const normalizeTierRecord = (tier, row = null) => {
    const t = String(tier || '').toLowerCase();
    const fallback = DEFAULT_LOYALTY_CONFIG[t] || DEFAULT_LOYALTY_CONFIG.regular;
    if (!row) {
        const out = { ...fallback, benefits: [...(fallback.benefits || [])] };
        out.benefits = buildBenefitsFromValues(t, out);
        return out;
    }
    const normalized = {
        label: String(row.label || fallback.label || t),
        color: String(row.color || fallback.color || '#4B5563'),
        threshold: toMoney(row.threshold ?? fallback.threshold),
        windowDays: Math.max(1, Number(row.window_days ?? fallback.windowDays) || fallback.windowDays),
        extraDiscountPct: toMoney(row.extra_discount_pct ?? fallback.extraDiscountPct),
        shippingDiscountPct: toMoney(row.shipping_discount_pct ?? fallback.shippingDiscountPct),
        birthdayDiscountPct: toMoney(row.birthday_discount_pct ?? fallback.birthdayDiscountPct ?? 10),
        abandonedCartBoostPct: toMoney(row.abandoned_cart_boost_pct ?? fallback.abandonedCartBoostPct),
        priorityWeight: Number(row.priority_weight ?? fallback.priorityWeight ?? 0),
        shippingPriority: normalizeShippingPriority(row.shipping_priority || fallback.shippingPriority || 'standard'),
        benefits: normalizeBenefits(row.benefits_json, fallback.benefits)
    };
    normalized.benefits = buildBenefitsFromValues(t, normalized);
    return normalized;
};

const setCachedLoyaltyConfig = (byTier = {}) => {
    const merged = {};
    for (const tier of TIER_ORDER) {
        merged[tier] = normalizeTierRecord(tier, byTier[tier]);
    }
    LOYALTY_CONFIG_CACHE.byTier = merged;
    LOYALTY_CONFIG_CACHE.loadedAt = Date.now();
    LOYALTY_CONFIG_CACHE.expiresAt = Date.now() + LOYALTY_CACHE_TTL_MS;
    return merged;
};

const ensureLoyaltyConfigLoaded = async ({ force = false } = {}) => {
    if (!force && LOYALTY_CONFIG_CACHE.expiresAt > Date.now()) return LOYALTY_CONFIG_CACHE.byTier;
    try {
        const [rows] = await db.execute(
            `SELECT tier, label, color, threshold, window_days, extra_discount_pct, shipping_discount_pct,
                    birthday_discount_pct, abandoned_cart_boost_pct, priority_weight, shipping_priority, benefits_json
             FROM loyalty_tier_config
             WHERE is_active = 1`
        );
        const byTier = {};
        for (const row of rows || []) {
            const t = String(row.tier || '').toLowerCase();
            if (!TIER_ORDER.includes(t)) continue;
            byTier[t] = row;
        }
        return setCachedLoyaltyConfig(byTier);
    } catch {
        return setCachedLoyaltyConfig({});
    }
};

const getActiveLoyaltyConfig = () => {
    return LOYALTY_CONFIG_CACHE.byTier || DEFAULT_LOYALTY_CONFIG;
};

const computeTierFromSpends = ({ spend30 = 0, spend60 = 0, spend90 = 0, spend365 = 0 } = {}) => {
    const cfg = getActiveLoyaltyConfig();
    if (spend365 >= Number(cfg.platinum?.threshold || 0)) return 'platinum';
    if (spend90 >= Number(cfg.gold?.threshold || 0)) return 'gold';
    if (spend60 >= Number(cfg.silver?.threshold || 0)) return 'silver';
    if (spend30 >= Number(cfg.bronze?.threshold || 0)) return 'bronze';
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

    const cfg = getActiveLoyaltyConfig();
    const nextCfg = cfg[nextTier] || DEFAULT_LOYALTY_CONFIG[nextTier];
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
    const cfg = getActiveLoyaltyConfig();
    return cfg[tier] || cfg.regular || DEFAULT_LOYALTY_CONFIG.regular;
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
    await ensureLoyaltyConfigLoaded();
    if (!userId) {
        const progress = buildProgress({ tier: 'regular' });
        return {
            tier: 'regular',
            profile: getLoyaltyProfileByTier('regular'),
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
    await ensureLoyaltyConfigLoaded({ force: true });
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

const isUserBirthdayToday = (dob) => {
    if (!dob) return false;
    const parts = String(dob).split('T')[0].split('-');
    const month = Number(parts[1] || 0);
    const day = Number(parts[2] || 0);
    if (!month || !day) return false;
    const now = new Date();
    return month === now.getMonth() + 1 && day === now.getDate();
};

const issueBirthdayCouponForUser = async (userId, { sendEmail = true } = {}) => {
    const user = await User.findById(userId);
    if (!user?.id || !user?.email) return { created: false, coupon: null, reason: 'user_missing' };
    if (!isUserBirthdayToday(user.dob)) return { created: false, coupon: null, reason: 'not_birthday' };
    const year = new Date().getFullYear();
    const [existingRows] = await db.execute(
        `SELECT id, code
         FROM coupons
         WHERE source_type = 'birthday'
           AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.userId')) = ?
           AND CAST(JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.year')) AS UNSIGNED) = ?
         ORDER BY id DESC
         LIMIT 1`,
        [String(user.id), Number(year)]
    );
    let coupon = null;
    if (existingRows.length) {
        coupon = existingRows[0];
    } else {
        const status = await getUserLoyaltyStatus(user.id);
        const tierLabel = status?.profile?.label || 'Regular';
        const birthdayDiscountPct = Number(status?.profile?.birthdayDiscountPct ?? 10);
        coupon = await Coupon.createCoupon({
            prefix: 'BDAY',
            name: `${tierLabel} Birthday ${year}`,
            description: `Birthday coupon for ${tierLabel} tier`,
            sourceType: 'birthday',
            scopeType: 'customer',
            discountType: 'percent',
            discountValue: birthdayDiscountPct,
            maxDiscount: null,
            minCartValue: 0,
            usageLimitTotal: null,
            usageLimitPerUser: 1,
            startsAt: new Date(),
            expiresAt: new Date(`${year}-12-31T23:59:59`),
            customerTargets: [user.id],
            metadata: {
                year,
                userId: user.id,
                tier: String(status?.tier || 'regular').toLowerCase()
            }
        }, { createdBy: null });
    }

    if (sendEmail && coupon?.code && !existingRows.length) {
        await sendEmailCommunication({
            to: user.email,
            subject: `Happy Birthday ${user.name || ''}! Your ${new Date().getFullYear()} coupon is here`,
            text: `Happy Birthday! Use code ${coupon.code} to enjoy your birthday offer.`,
            html: `<p>Hi ${user.name || 'Customer'},</p><p>Happy Birthday from SSC Jewellery.</p><p>Your birthday coupon code: <strong>${coupon.code}</strong></p><p>You can use this once this year.</p>`
        }).catch(() => {});
    }
    return { created: !existingRows.length, coupon };
};

const issueBirthdayCouponsForEligibleUsersToday = async () => {
    const [rows] = await db.execute(
        `SELECT id, dob, email
         FROM users
         WHERE role = 'customer'
           AND email IS NOT NULL
           AND dob IS NOT NULL`
    );
    let created = 0;
    let processed = 0;
    for (const row of rows) {
        if (!isUserBirthdayToday(row.dob)) continue;
        processed += 1;
        const result = await issueBirthdayCouponForUser(row.id, { sendEmail: true });
        if (result?.created) created += 1;
    }
    return { processed, created };
};

const getLoyaltyConfigForAdmin = async () => {
    const cfg = await ensureLoyaltyConfigLoaded({ force: true });
    return TIER_ORDER.map((tier) => ({
        tier,
        ...(cfg[tier] || DEFAULT_LOYALTY_CONFIG[tier] || DEFAULT_LOYALTY_CONFIG.regular)
    }));
};

const updateLoyaltyConfigForAdmin = async (items = []) => {
    const rows = Array.isArray(items) ? items : [];
    for (const raw of rows) {
        const tier = String(raw?.tier || '').toLowerCase();
        if (!TIER_ORDER.includes(tier)) continue;
        const fallback = DEFAULT_LOYALTY_CONFIG[tier] || DEFAULT_LOYALTY_CONFIG.regular;
        const nextRecord = {
            extraDiscountPct: toMoney(raw?.extraDiscountPct ?? fallback.extraDiscountPct),
            shippingDiscountPct: toMoney(raw?.shippingDiscountPct ?? fallback.shippingDiscountPct),
            birthdayDiscountPct: toMoney(raw?.birthdayDiscountPct ?? fallback.birthdayDiscountPct ?? 10),
            abandonedCartBoostPct: toMoney(raw?.abandonedCartBoostPct ?? fallback.abandonedCartBoostPct),
            priorityWeight: Number(raw?.priorityWeight ?? fallback.priorityWeight ?? 0),
            shippingPriority: normalizeShippingPriority(raw?.shippingPriority || fallback.shippingPriority || 'standard')
        };
        const benefits = buildBenefitsFromValues(tier, nextRecord);
        await db.execute(
            `INSERT INTO loyalty_tier_config
                (tier, label, color, threshold, window_days, extra_discount_pct, shipping_discount_pct, birthday_discount_pct, abandoned_cart_boost_pct, priority_weight, shipping_priority, benefits_json, is_active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE
                label = VALUES(label),
                color = VALUES(color),
                threshold = VALUES(threshold),
                window_days = VALUES(window_days),
                extra_discount_pct = VALUES(extra_discount_pct),
                shipping_discount_pct = VALUES(shipping_discount_pct),
                birthday_discount_pct = VALUES(birthday_discount_pct),
                abandoned_cart_boost_pct = VALUES(abandoned_cart_boost_pct),
                priority_weight = VALUES(priority_weight),
                shipping_priority = VALUES(shipping_priority),
                benefits_json = VALUES(benefits_json),
                is_active = VALUES(is_active)`,
            [
                tier,
                String(raw?.label || fallback.label || tier),
                String(fallback.color || '#4B5563'),
                toMoney(raw?.threshold ?? fallback.threshold),
                Math.max(1, Number(raw?.windowDays ?? fallback.windowDays) || fallback.windowDays),
                nextRecord.extraDiscountPct,
                nextRecord.shippingDiscountPct,
                nextRecord.birthdayDiscountPct,
                nextRecord.abandonedCartBoostPct,
                nextRecord.priorityWeight,
                nextRecord.shippingPriority,
                JSON.stringify(benefits)
            ]
        );
    }
    return getLoyaltyConfigForAdmin();
};

module.exports = {
    TIER_ORDER,
    LOYALTY_CONFIG: DEFAULT_LOYALTY_CONFIG,
    ensureLoyaltyConfigLoaded,
    getLoyaltyConfigForAdmin,
    updateLoyaltyConfigForAdmin,
    getLoyaltyProfileByTier,
    getUserLoyaltyStatus,
    calculateOrderLoyaltyAdjustments,
    reassessUserTier,
    runMonthlyLoyaltyReassessment,
    issueBirthdayCouponForUser,
    issueBirthdayCouponsForEligibleUsersToday
};
