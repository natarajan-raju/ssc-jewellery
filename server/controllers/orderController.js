const Order = require('../models/Order');
const crypto = require('crypto');
const { PaymentAttempt, PAYMENT_STATUS } = require('../models/PaymentAttempt');
const WebhookEvent = require('../models/WebhookEvent');
const { createRazorpayClient } = require('../services/razorpayService');
const { markRecoveredByOrder } = require('../services/abandonedCartRecoveryService');
const AbandonedCart = require('../models/AbandonedCart');
const User = require('../models/User');
const CompanyProfile = require('../models/CompanyProfile');
const { buildInvoicePdfBuffer } = require('../utils/invoicePdf');

const toSubunit = (amount) => Math.round(Number(amount || 0) * 100);
const ATTEMPT_TTL_MINUTES = 30;

const buildReceipt = (userId) => {
    const uid = String(userId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-10) || 'guest';
    const stamp = Date.now().toString(36);
    return `ssc_${uid}_${stamp}`.slice(0, 40);
};

const emitOrderAndPaymentUpdate = (req, { order, payment = null, silent = false } = {}) => {
    const io = req.app.get('io');
    if (!io || !order) return;
    const payload = { orderId: order.id, status: order.status, order, silent: Boolean(silent) };
    io.emit('order:update', payload);
    if (order?.user_id) {
        io.to(`user:${order.user_id}`).emit('order:update', payload);
    }
    if (!payment) return;
    const paymentPayload = { ...payload, payment };
    io.emit('payment:update', paymentPayload);
    if (order?.user_id) {
        io.to(`user:${order.user_id}`).emit('payment:update', paymentPayload);
    }
};

const emitAbandonedRecoveryUpdate = (req, { journeyId = null, userId = null, reason = 'order_paid' } = {}) => {
    const io = req.app.get('io');
    if (!io) return;
    io.to('admin').emit('abandoned_cart:recovered', {
        journeyId: journeyId || null,
        userId: userId || null,
        reason,
        ts: new Date().toISOString()
    });
};

const parseAddressObject = (value) => {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
};

const createOrderFromRecoveryPayment = async (req, {
    notes = {},
    razorpayOrderId = null,
    razorpayPaymentId = null,
    paymentLinkId = null
} = {}) => {
    if (razorpayPaymentId) {
        const existingByPayment = await Order.getByRazorpayPaymentId(razorpayPaymentId);
        if (existingByPayment) return existingByPayment;
    }

    const attemptByLink = paymentLinkId
        ? await AbandonedCart.getAttemptByPaymentLinkId(paymentLinkId)
        : null;

    const userId = notes.userId || notes.user_id || attemptByLink?.payload_json?.userId || null;
    const journeyId = Number(
        notes.journeyId
        || notes.journey_id
        || attemptByLink?.journey_id
        || 0
    ) || null;
    const attemptNo = Number(
        notes.attemptNo
        || notes.attempt_no
        || attemptByLink?.attempt_no
        || 0
    ) || null;
    const preferredOrderRef = String(
        notes.orderRef
        || notes.order_ref
        || attemptByLink?.payload_json?.orderRef
        || ''
    ).trim() || null;
    const shippingFeeOverrideSubunits = Number(
        notes.shippingFeeSubunits
        || notes.shipping_fee_subunits
        || attemptByLink?.payload_json?.shippingFeeSubunits
        || attemptByLink?.payload_json?.shipping_fee_subunits
        || 0
    ) || null;
    if (!userId || !journeyId) return null;

    const timeline = await AbandonedCart.getJourneyTimeline(journeyId);
    const journey = timeline?.journey || null;
    if (!journey || String(journey.user_id) !== String(userId)) return null;

    const user = await User.findById(userId);
    const shippingAddress = parseAddressObject(user?.address) || {};
    const billingAddress = parseAddressObject(user?.billingAddress) || shippingAddress || {};

    const createdOrder = await Order.createFromRecoveryJourney(userId, {
        journey,
        payment: {
            paymentStatus: PAYMENT_STATUS.PAID,
            gateway: 'razorpay',
            razorpayOrderId: razorpayOrderId || null,
            razorpayPaymentId: razorpayPaymentId || null
        },
        billingAddress,
        shippingAddress,
        orderRef: preferredOrderRef,
        shippingFeeOverrideSubunits
    });

    if (paymentLinkId) {
        try {
            await AbandonedCart.markAttemptPaidByPaymentLink({
                paymentLinkId,
                paymentId: razorpayPaymentId || null
            });
        } catch {}
    }

    if (createdOrder) {
        try {
            await markRecoveredByOrder({ order: createdOrder, reason: 'payment_paid_webhook' });
            emitAbandonedRecoveryUpdate(req, {
                journeyId: createdOrder.abandoned_journey_id || journeyId,
                userId: createdOrder.user_id || userId,
                reason: 'payment_paid_webhook'
            });
        } catch {}
    }
    return createdOrder;
};

const getAttemptExpiryDate = () => {
    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + ATTEMPT_TTL_MINUTES);
    return expires;
};

const timingSafeSignatureMatch = (left, right) => {
    try {
        const a = Buffer.from(String(left || ''), 'utf8');
        const b = Buffer.from(String(right || ''), 'utf8');
        if (a.length !== b.length) return false;
        return crypto.timingSafeEqual(a, b);
    } catch {
        return false;
    }
};

const mapRazorpayOrderStatusToLocalPayment = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'paid') return PAYMENT_STATUS.PAID;
    if (normalized === 'placed') return 'pending';
    if (normalized === 'refunded') return PAYMENT_STATUS.REFUNDED;
    if (normalized === 'cancelled') return PAYMENT_STATUS.FAILED;
    return null;
};

const mapRazorpayPaymentStatusToLocalPayment = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'captured') return PAYMENT_STATUS.PAID;
    if (normalized === 'authorized') return PAYMENT_STATUS.ATTEMPTED;
    if (normalized === 'failed') return PAYMENT_STATUS.FAILED;
    if (normalized === 'pending') return 'pending';
    return null;
};

const normalizeSettlementSnapshot = (settlement = null) => {
    if (!settlement) return null;
    const amount = Number(settlement.amount || 0);
    const fees = Number(settlement.fees || 0);
    const tax = Number(settlement.tax || 0);
    return {
        id: settlement.id || null,
        entity: settlement.entity || 'settlement',
        amount,
        status: settlement.status || null,
        fees,
        tax,
        net_amount: amount - fees - tax,
        utr: settlement.utr || null,
        created_at: settlement.created_at || null,
        fetched_at: Math.floor(Date.now() / 1000)
    };
};

const fetchSettlementSnapshotSafe = async (razorpay, settlementId) => {
    const ref = String(settlementId || '').trim();
    if (!razorpay || !ref) return null;
    try {
        const settlement = await razorpay.settlements.fetch(ref);
        return normalizeSettlementSnapshot(settlement);
    } catch {
        return null;
    }
};

const createRazorpayOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { billingAddress, shippingAddress, notes, couponCode } = req.body || {};

        const normalizedCouponCode = String(couponCode || '').trim().toUpperCase() || null;
        const summary = await Order.getCheckoutSummary(userId, {
            shippingAddress,
            couponCode: normalizedCouponCode
        });
        const amount = toSubunit(summary.total);

        if (amount < 100) {
            return res.status(400).json({ message: 'Order amount should be at least INR 1.00' });
        }

        const razorpay = createRazorpayClient();
        const expiresAt = getAttemptExpiryDate();
        const razorpayOrder = await razorpay.orders.create({
            amount,
            currency: summary.currency || 'INR',
            receipt: buildReceipt(userId),
            notes: {
                userId: String(userId),
                itemCount: String(summary.itemCount),
                ...(normalizedCouponCode ? { couponCode: normalizedCouponCode } : {}),
                ...(notes && typeof notes === 'object' ? notes : {})
            }
        });

        const attempt = await PaymentAttempt.create({
            userId,
            razorpayOrderId: razorpayOrder.id,
            amountSubunits: amount,
            currency: summary.currency || 'INR',
            billingAddress,
            shippingAddress,
            notes: {
                ...(notes && typeof notes === 'object' ? notes : {}),
                ...(normalizedCouponCode ? { couponCode: normalizedCouponCode } : {})
            },
            expiresAt
        });

        try {
            await PaymentAttempt.reserveInventoryForAttempt({
                attemptId: attempt.id,
                userId,
                expiresAt
            });
        } catch (error) {
            await PaymentAttempt.markFailed({
                id: attempt.id,
                errorMessage: error?.message || 'Reservation failed'
            });
            return res.status(400).json({ message: error?.message || 'Failed to reserve stock for payment' });
        }

        return res.status(201).json({
            order: razorpayOrder,
            keyId: process.env.RAZORPAY_KEY_ID,
            summary,
            attempt: {
                id: attempt.id,
                status: PAYMENT_STATUS.CREATED,
                expiresAt
            }
        });
    } catch (error) {
        const statusCode = Number(error?.statusCode || 0);
        const gatewayMessage = error?.error?.description || error?.description;
        const message = gatewayMessage || error?.message || 'Failed to create payment order';

        if (statusCode === 400 || error?.error?.code === 'BAD_REQUEST_ERROR') {
            return res.status(400).json({ message });
        }
        if (
            String(message).toLowerCase().includes('razorpay') ||
            String(message).toLowerCase().includes('key') ||
            String(message).toLowerCase().includes('credential') ||
            String(message).toLowerCase().includes('cannot find module')
        ) {
            return res.status(500).json({ message: 'Razorpay is not configured on server' });
        }
        return res.status(400).json({ message });
    }
};

const verifyRazorpayPayment = async (req, res) => {
    let lockedAttemptId = null;
    let lockedPaymentId = null;
    let lockedSignature = null;
    try {
        const userId = req.user.id;
        const {
            razorpay_payment_id: razorpayPaymentId,
            razorpay_order_id: razorpayOrderId,
            razorpay_signature: razorpaySignature
        } = req.body || {};

        if (!razorpayPaymentId || !razorpayOrderId || !razorpaySignature) {
            return res.status(400).json({ message: 'Payment verification fields are required' });
        }

        const attempt = await PaymentAttempt.getByRazorpayOrderId({ userId, razorpayOrderId });
        if (!attempt) {
            return res.status(404).json({ message: 'Payment attempt not found' });
        }

        if (attempt.status === PAYMENT_STATUS.PAID && attempt.local_order_id) {
            const existingOrder = await Order.getById(attempt.local_order_id);
            if (existingOrder) {
                return res.json({ order: existingOrder, verified: true });
            }
        }
        if (attempt.status === PAYMENT_STATUS.EXPIRED) {
            return res.status(410).json({ message: 'Payment session expired. Please retry payment.' });
        }

        const secret = (process.env.RAZORPAY_KEY_SECRET || '').trim();
        if (!secret) {
            return res.status(500).json({ message: 'Razorpay is not configured on server' });
        }

        const generatedSignature = crypto
            .createHmac('sha256', secret)
            .update(`${attempt.razorpay_order_id}|${razorpayPaymentId}`)
            .digest('hex');

        const isValidSignature = (() => {
            try {
                return crypto.timingSafeEqual(
                    Buffer.from(generatedSignature),
                    Buffer.from(String(razorpaySignature))
                );
            } catch {
                return false;
            }
        })();

        if (!isValidSignature) {
            await PaymentAttempt.markFailed({
                id: attempt.id,
                paymentId: razorpayPaymentId,
                signature: razorpaySignature,
                errorMessage: 'Signature verification failed'
            });
            return res.status(400).json({ message: 'Invalid payment signature' });
        }

        const lockAcquired = await PaymentAttempt.beginVerificationLock({
            id: attempt.id,
            paymentId: razorpayPaymentId,
            signature: razorpaySignature
        });

        if (!lockAcquired) {
            const latestAttempt = await PaymentAttempt.getById(attempt.id);
            if (latestAttempt?.local_order_id) {
                const existingOrder = await Order.getById(latestAttempt.local_order_id);
                if (existingOrder) {
                    return res.json({ order: existingOrder, verified: true });
                }
            }
            return res.status(409).json({ message: 'Payment verification already in progress. Please retry in a moment.' });
        }
        lockedAttemptId = attempt.id;
        lockedPaymentId = razorpayPaymentId;
        lockedSignature = razorpaySignature;

        const razorpay = createRazorpayClient();
        const paymentDetails = await razorpay.payments.fetch(razorpayPaymentId);

        if (!paymentDetails || String(paymentDetails.order_id) !== String(attempt.razorpay_order_id)) {
            await PaymentAttempt.releaseInventoryForAttempt({ attemptId: attempt.id, reason: 'verify_mismatch' });
            await PaymentAttempt.markFailed({
                id: attempt.id,
                paymentId: razorpayPaymentId,
                signature: razorpaySignature,
                errorMessage: 'Payment order mismatch'
            });
            return res.status(400).json({ message: 'Payment verification failed: order mismatch' });
        }

        if (Number(paymentDetails.amount || 0) !== Number(attempt.amount_subunits || 0)) {
            await PaymentAttempt.releaseInventoryForAttempt({ attemptId: attempt.id, reason: 'verify_amount_mismatch' });
            await PaymentAttempt.markFailed({
                id: attempt.id,
                paymentId: razorpayPaymentId,
                signature: razorpaySignature,
                errorMessage: 'Payment amount mismatch'
            });
            return res.status(400).json({ message: 'Payment verification failed: amount mismatch' });
        }

        if (String(paymentDetails.currency || '').toUpperCase() !== String(attempt.currency || 'INR').toUpperCase()) {
            await PaymentAttempt.releaseInventoryForAttempt({ attemptId: attempt.id, reason: 'verify_currency_mismatch' });
            await PaymentAttempt.markFailed({
                id: attempt.id,
                paymentId: razorpayPaymentId,
                signature: razorpaySignature,
                errorMessage: 'Payment currency mismatch'
            });
            return res.status(400).json({ message: 'Payment verification failed: currency mismatch' });
        }

        if (String(paymentDetails.status || '').toLowerCase() !== 'captured') {
            return res.status(400).json({ message: 'Payment is not captured yet' });
        }

        const appliedCouponCode = String(attempt?.notes?.couponCode || '').trim().toUpperCase() || null;
        const cartSummary = await Order.getCheckoutSummary(userId, {
            shippingAddress: attempt.shipping_address || null,
            couponCode: appliedCouponCode
        });
        const currentAmountSubunits = toSubunit(cartSummary.total);
        if (Number(currentAmountSubunits) !== Number(attempt.amount_subunits || 0)) {
            await PaymentAttempt.releaseInventoryForAttempt({ attemptId: attempt.id, reason: 'cart_changed' });
            await PaymentAttempt.markFailed({
                id: attempt.id,
                paymentId: razorpayPaymentId,
                signature: razorpaySignature,
                errorMessage: 'Cart changed after payment initiation'
            });
            return res.status(409).json({ message: 'Cart changed after payment initiation. Please retry checkout.' });
        }

        const order = await Order.createFromCart(userId, {
            billingAddress: attempt.billing_address || null,
            shippingAddress: attempt.shipping_address || null,
            payment: {
                gateway: 'razorpay',
                paymentStatus: PAYMENT_STATUS.PAID,
                razorpayOrderId: attempt.razorpay_order_id,
                razorpayPaymentId: razorpayPaymentId,
                razorpaySignature,
                settlementId: paymentDetails?.settlement_id || null,
                settlementSnapshot: null
            },
            skipStockDeduction: true,
            couponCode: appliedCouponCode,
            sourceChannel: appliedCouponCode ? 'abandoned_recovery' : 'checkout'
        });

        await PaymentAttempt.consumeInventoryForAttempt({ attemptId: attempt.id });
        try {
            await markRecoveredByOrder({ order, reason: 'order_paid_checkout' });
        } catch {}

        const verifyMarked = await PaymentAttempt.markVerified({
            id: attempt.id,
            paymentId: razorpayPaymentId,
            signature: razorpaySignature,
            localOrderId: order.id
        });
        if (!verifyMarked) {
            const latestAttempt = await PaymentAttempt.getById(attempt.id);
            if (latestAttempt?.local_order_id) {
                const existingOrder = await Order.getById(latestAttempt.local_order_id);
                if (existingOrder) {
                    return res.json({ order: existingOrder, verified: true });
                }
            }
            return res.status(409).json({ message: 'Payment verification conflict. Please retry.' });
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('order:create', { order });
            io.to(`user:${userId}`).emit('order:update', { orderId: order.id, status: order.status || 'confirmed', order });
            const paymentPayload = {
                orderId: order.id,
                status: order.status || 'confirmed',
                order,
                payment: {
                    paymentStatus: PAYMENT_STATUS.PAID,
                    paymentMethod: 'razorpay',
                    paymentReference: razorpayPaymentId,
                    razorpayOrderId: attempt.razorpay_order_id
                }
            };
            io.emit('payment:update', paymentPayload);
            io.to(`user:${userId}`).emit('payment:update', paymentPayload);
        }

        return res.json({ order, verified: true });
    } catch (error) {
        if (lockedAttemptId) {
            try {
                await PaymentAttempt.releaseInventoryForAttempt({
                    attemptId: lockedAttemptId,
                    reason: 'verify_failed'
                });
                await PaymentAttempt.markFailed({
                    id: lockedAttemptId,
                    paymentId: lockedPaymentId,
                    signature: lockedSignature,
                    errorMessage: error?.message || 'Verification failed'
                });
            } catch {}
        }
        return res.status(400).json({ message: error.message || 'Failed to verify payment' });
    }
};

const retryRazorpayPayment = async (req, res) => {
    try {
        const userId = req.user.id;
        const { attemptId } = req.body || {};
        const sourceAttempt = attemptId
            ? await PaymentAttempt.getById(attemptId)
            : await PaymentAttempt.getLatestRetryableByUser(userId);

        if (!sourceAttempt || String(sourceAttempt.user_id) !== String(userId)) {
            return res.status(404).json({ message: 'No retryable payment found' });
        }
        if (![PAYMENT_STATUS.FAILED, PAYMENT_STATUS.EXPIRED].includes(String(sourceAttempt.status))) {
            return res.status(400).json({ message: 'Selected payment is not retryable' });
        }

        return createRazorpayOrder({
            ...req,
            body: {
                billingAddress: sourceAttempt.billing_address || null,
                shippingAddress: sourceAttempt.shipping_address || null,
                notes: {
                    ...(sourceAttempt.notes || {}),
                    retryOfAttemptId: sourceAttempt.id
                }
            }
        }, res);
    } catch (error) {
        return res.status(400).json({ message: error.message || 'Failed to retry payment' });
    }
};

const handleRazorpayWebhook = async (req, res) => {
    let webhookEventId = null;
    try {
        const secret = (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim();
        if (!secret) {
            return res.status(500).json({ message: 'Webhook secret not configured' });
        }

        const signature = req.headers['x-razorpay-signature'];
        if (!signature) {
            return res.status(400).json({ message: 'Missing webhook signature' });
        }

        const rawBody = req.rawBody || JSON.stringify(req.body || {});
        const generatedSignature = crypto
            .createHmac('sha256', secret)
            .update(rawBody)
            .digest('hex');

        if (!timingSafeSignatureMatch(generatedSignature, signature)) {
            return res.status(400).json({ message: 'Invalid webhook signature' });
        }

        const event = String(req.body?.event || '');
        const headerEventId = String(req.headers['x-razorpay-event-id'] || '').trim();
        webhookEventId = headerEventId || crypto.createHash('sha256').update(rawBody).digest('hex');
        const webhookEntry = await WebhookEvent.register({
            eventId: webhookEventId,
            eventType: event,
            signature: String(signature || ''),
            payloadRaw: rawBody,
            payload: req.body || {}
        });
        if (webhookEntry.duplicate) {
            return res.status(200).json({ ok: true, duplicate: true, eventId: webhookEventId });
        }

        const paymentEntity = req.body?.payload?.payment?.entity || null;
        const orderEntity = req.body?.payload?.order?.entity || null;
        const paymentLinkEntity = req.body?.payload?.payment_link?.entity || null;
        const settlementEntity = req.body?.payload?.settlement?.entity || null;
        const paymentNotes = paymentEntity?.notes && typeof paymentEntity.notes === 'object' ? paymentEntity.notes : {};
        const orderNotes = orderEntity?.notes && typeof orderEntity.notes === 'object' ? orderEntity.notes : {};
        const paymentLinkNotes = paymentLinkEntity?.notes && typeof paymentLinkEntity.notes === 'object' ? paymentLinkEntity.notes : {};

        if (event.startsWith('settlement.')) {
            const settlementId = String(settlementEntity?.id || '').trim();
            const settlementSnapshot = normalizeSettlementSnapshot(settlementEntity);
            if (!settlementId || !settlementSnapshot) {
                await WebhookEvent.markProcessed({
                    eventId: webhookEventId,
                    status: 'ignored',
                    note: 'missing_settlement_payload'
                });
                return res.status(200).json({ ok: true, ignored: true, reason: 'missing_settlement_payload' });
            }

            const linkedOrders = await Order.getBySettlementId(settlementId, { limit: 250 });
            for (const linked of linkedOrders) {
                await Order.updateSettlementByOrderId({
                    orderId: linked.id,
                    settlementId,
                    settlementSnapshot
                });
                const updatedOrder = await Order.getById(linked.id);
                if (updatedOrder) {
                    emitOrderAndPaymentUpdate(req, {
                        order: updatedOrder,
                        payment: {
                            event,
                            paymentStatus: updatedOrder.payment_status,
                            paymentMethod: updatedOrder.payment_gateway || 'razorpay',
                            paymentReference: updatedOrder.razorpay_payment_id || null,
                            razorpayOrderId: updatedOrder.razorpay_order_id || null,
                            settlementId,
                            settlementStatus: settlementSnapshot.status || null,
                            settlementAmount: settlementSnapshot.amount
                        }
                    });
                }
            }

            const io = req.app.get('io');
            if (io) {
                io.to('admin').emit('payment:update', {
                    eventType: event,
                    settlement: settlementSnapshot,
                    settlementId,
                    linkedOrderCount: linkedOrders.length
                });
            }

            await WebhookEvent.markProcessed({
                eventId: webhookEventId,
                status: 'processed',
                note: `settlement_status:${settlementSnapshot.status || 'unknown'}`
            });
            return res.status(200).json({
                ok: true,
                event,
                settlementId,
                linkedOrders: linkedOrders.length
            });
        }

        const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id || null;
        const razorpayPaymentId = paymentEntity?.id || null;
        const failureReason = paymentEntity?.error_description || paymentEntity?.error_reason || null;

        let paymentStatus = null;
        if (event === 'payment.authorized') paymentStatus = PAYMENT_STATUS.ATTEMPTED;
        if (event === 'payment.captured' || event === 'order.paid') paymentStatus = PAYMENT_STATUS.PAID;
        if (event === 'payment_link.paid') paymentStatus = PAYMENT_STATUS.PAID;
        if (event === 'payment.failed') paymentStatus = PAYMENT_STATUS.FAILED;
        if (event === 'refund.processed' || event === 'payment.refunded') paymentStatus = PAYMENT_STATUS.REFUNDED;

        if (!paymentStatus) {
            await WebhookEvent.markProcessed({
                eventId: webhookEventId,
                status: 'ignored',
                note: `ignored_event:${event}`
            });
            return res.status(200).json({ ok: true, ignored: true, event });
        }

        if (!razorpayOrderId && paymentStatus !== PAYMENT_STATUS.PAID) {
            await WebhookEvent.markProcessed({
                eventId: webhookEventId,
                status: 'ignored',
                note: 'missing_order_id'
            });
            return res.status(200).json({ ok: true, ignored: true, reason: 'missing_order_id' });
        }

        if (paymentStatus === 'attempted' && razorpayOrderId) {
            await PaymentAttempt.markAttemptedByRazorpayOrder({
                razorpayOrderId,
                paymentId: razorpayPaymentId
            });
        } else if (paymentStatus === PAYMENT_STATUS.PAID && razorpayOrderId) {
            const attempt = await PaymentAttempt.getByRazorpayOrderIdAny(razorpayOrderId);
            const payloadAmount = Number(paymentEntity?.amount || 0);
            if (
                attempt &&
                payloadAmount > 0 &&
                Number(attempt.amount_subunits || 0) > 0 &&
                payloadAmount !== Number(attempt.amount_subunits)
            ) {
                await PaymentAttempt.markFailedByRazorpayOrder({
                    razorpayOrderId,
                    paymentId: razorpayPaymentId,
                    errorMessage: 'Webhook amount mismatch'
                });
                await WebhookEvent.markFailed({
                    eventId: webhookEventId,
                    note: 'Webhook amount mismatch'
                });
                return res.status(400).json({ message: 'Webhook amount mismatch' });
            }
            await PaymentAttempt.markPaidByRazorpayOrder({
                razorpayOrderId,
                paymentId: razorpayPaymentId
            });
        } else if (paymentStatus === PAYMENT_STATUS.FAILED && razorpayOrderId) {
            const attempt = await PaymentAttempt.getByRazorpayOrderIdAny(razorpayOrderId);
            if (attempt) {
                await PaymentAttempt.releaseInventoryForAttempt({
                    attemptId: attempt.id,
                    reason: 'payment_failed'
                });
            }
            await PaymentAttempt.markFailedByRazorpayOrder({
                razorpayOrderId,
                paymentId: razorpayPaymentId,
                errorMessage: failureReason
            });
        } else if (paymentStatus === PAYMENT_STATUS.REFUNDED && razorpayOrderId) {
            await PaymentAttempt.markPaidByRazorpayOrder({
                razorpayOrderId,
                paymentId: razorpayPaymentId
            });
        }

        const refundEntity = req.body?.payload?.refund?.entity || null;
        const settlementIdFromWebhook = paymentEntity?.settlement_id || null;
        const updatedCount = razorpayOrderId
            ? await Order.updatePaymentByRazorpayOrderId({
                razorpayOrderId,
                paymentStatus,
                razorpayPaymentId,
                settlementId: settlementIdFromWebhook,
                settlementSnapshot: null,
                refundReference: refundEntity?.id || null,
                refundAmount: refundEntity?.amount != null ? Number(refundEntity.amount) / 100 : null,
                refundStatus: refundEntity?.status || null
            })
            : 0;

        let linkedOrder = null;
        if (updatedCount > 0) {
            const order = await Order.getByRazorpayOrderId(razorpayOrderId);
            linkedOrder = order;
            if (order && paymentStatus === PAYMENT_STATUS.PAID) {
                try {
                    await markRecoveredByOrder({ order, reason: 'payment_paid_webhook' });
                    emitAbandonedRecoveryUpdate(req, {
                        journeyId: order.abandoned_journey_id || null,
                        userId: order.user_id || null,
                        reason: 'payment_paid_webhook'
                    });
                } catch {}
            }
            emitOrderAndPaymentUpdate(req, {
                order,
                payment: {
                    event,
                    paymentStatus,
                    paymentMethod: order?.payment_gateway || 'razorpay',
                    paymentReference: razorpayPaymentId,
                    razorpayOrderId,
                    refundReference: refundEntity?.id || null,
                    refundAmount: refundEntity?.amount != null ? Number(refundEntity.amount) / 100 : null,
                    refundStatus: refundEntity?.status || null
                }
            });
        } else if (paymentStatus === PAYMENT_STATUS.PAID) {
            const notes = { ...orderNotes, ...paymentNotes, ...paymentLinkNotes };
            if (paymentLinkEntity?.id) {
                try {
                    await AbandonedCart.markAttemptPaidByPaymentLink({
                        paymentLinkId: paymentLinkEntity.id,
                        paymentId: razorpayPaymentId || null
                    });
                } catch {}
            }

            linkedOrder = razorpayPaymentId
                ? await Order.getByRazorpayPaymentId(razorpayPaymentId)
                : null;
            if (!linkedOrder && razorpayOrderId) {
                linkedOrder = await Order.getByRazorpayOrderId(razorpayOrderId);
            }
            if (!linkedOrder) {
                linkedOrder = await createOrderFromRecoveryPayment(req, {
                    notes,
                    razorpayOrderId,
                    razorpayPaymentId,
                    paymentLinkId: paymentLinkEntity?.id || null
                });
                if (linkedOrder) {
                    const io = req.app.get('io');
                    if (io) {
                        io.emit('order:create', { order: linkedOrder });
                        if (linkedOrder.user_id) {
                            io.to(`user:${linkedOrder.user_id}`).emit('order:update', {
                                orderId: linkedOrder.id,
                                status: linkedOrder.status,
                                order: linkedOrder
                            });
                        }
                    }
                }
            }

            if (linkedOrder) {
                emitOrderAndPaymentUpdate(req, {
                    order: linkedOrder,
                    payment: {
                        event,
                        paymentStatus,
                        paymentMethod: linkedOrder?.payment_gateway || 'razorpay',
                        paymentReference: razorpayPaymentId,
                        razorpayOrderId
                    }
                });
            }
        }

        await WebhookEvent.markProcessed({
            eventId: webhookEventId,
            status: 'processed',
            note: `payment_status:${paymentStatus}`
        });
        return res.status(200).json({ ok: true, event, paymentStatus });
    } catch (error) {
        if (webhookEventId) {
            try {
                await WebhookEvent.markFailed({
                    eventId: webhookEventId,
                    note: error?.message || 'Webhook processing failed'
                });
            } catch {}
        }
        return res.status(500).json({ message: 'Webhook processing failed' });
    }
};

const createOrderFromCheckout = async (req, res) => {
    return res.status(400).json({
        message: 'Direct checkout is disabled. Please complete verified online payment before order creation.'
    });
};

const validateRecoveryCoupon = async (req, res) => {
    try {
        const userId = req.user.id;
        const code = String(req.body?.code || req.query?.code || '').trim().toUpperCase();
        if (!code) {
            return res.status(400).json({ message: 'Coupon code is required' });
        }
        const { shippingAddress = null } = req.body || {};
        const summary = await Order.getCheckoutSummary(userId, {
            shippingAddress,
            couponCode: code
        });
        return res.json({
            ok: true,
            code,
            discountTotal: Number(summary.discountTotal || 0),
            total: Number(summary.total || 0),
            coupon: summary.coupon || null
        });
    } catch (error) {
        return res.status(400).json({ message: error?.message || 'Coupon is invalid or expired' });
    }
};

const getAdminOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const status = req.query.status || 'all';
        const search = req.query.search || '';
        const startDate = req.query.startDate || '';
        const endDate = req.query.endDate || '';
        const quickRange = req.query.quickRange || 'all';
        const sortBy = req.query.sortBy || 'newest';
        const filters = { status, search, startDate, endDate, quickRange, sortBy };
        const result = await Order.getPaginated({ page, limit, ...filters });
        const metrics = await Order.getMetrics(filters);
        res.json({ orders: result.orders, pagination: { currentPage: page, totalPages: result.totalPages, totalOrders: result.total }, metrics });
    } catch (error) {
        res.status(500).json({ message: 'Failed to load orders' });
    }
};

const getAdminOrderById = async (req, res) => {
    try {
        const order = await Order.getById(req.params.id);
        if (!order) return res.status(404).json({ message: 'Order not found' });
        res.json({ order });
    } catch (error) {
        res.status(500).json({ message: 'Failed to load order' });
    }
};

const getMyOrders = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const duration = req.query.duration || 'all';
        const result = await Order.getByUserPaginated({ userId: req.user.id, page, limit, duration });
        res.json({
            orders: result.orders,
            pagination: {
                currentPage: page,
                totalPages: result.totalPages,
                totalOrders: result.total
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to load orders' });
    }
};

const getMyOrderByPaymentRef = async (req, res) => {
    try {
        const paymentId = String(req.params.paymentId || '').trim();
        if (!paymentId) {
            return res.status(400).json({ message: 'Payment reference is required' });
        }
        const order = await Order.getByRazorpayPaymentId(paymentId);
        if (!order || String(order.user_id) !== String(req.user.id)) {
            return res.status(404).json({ message: 'Order not found' });
        }
        return res.json({ order });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to load order' });
    }
};

const updateOrderStatus = async (req, res) => {
    try {
        const { status, processRefund = false, refundAmount = null } = req.body || {};
        const orderId = Number(req.params.id);
        if (!Number.isFinite(orderId) || orderId <= 0) {
            return res.status(400).json({ message: 'Invalid order id' });
        }
        const existingOrder = await Order.getById(orderId);
        if (!existingOrder) {
            return res.status(404).json({ message: 'Order not found' });
        }
        const refundAlreadyInitiated = Boolean(
            existingOrder?.refund_reference
            || existingOrder?.refund_status
            || String(existingOrder?.payment_status || '').toLowerCase() === PAYMENT_STATUS.REFUNDED
            || Number(existingOrder?.refund_amount || 0) > 0
        );
        if (
            String(existingOrder?.status || '').toLowerCase() === 'cancelled' &&
            refundAlreadyInitiated &&
            String(status || '').toLowerCase() !== 'cancelled'
        ) {
            return res.status(400).json({ message: 'Cancelled orders with initiated refunds cannot be moved to other statuses' });
        }

        let refund = null;
        if (
            status === 'cancelled' &&
            Boolean(processRefund) &&
            String(existingOrder?.payment_gateway || '').toLowerCase() === 'razorpay' &&
            String(existingOrder?.payment_status || '').toLowerCase() === PAYMENT_STATUS.PAID &&
            String(existingOrder?.razorpay_payment_id || '').trim()
        ) {
            const razorpay = createRazorpayClient();
            const paymentId = String(existingOrder.razorpay_payment_id).trim();
            const amountSubunits = refundAmount != null
                ? Math.max(1, Math.round(Number(refundAmount) * 100))
                : null;
            const payload = {
                speed: 'optimum',
                notes: {
                    order_ref: existingOrder.order_ref || '',
                    order_id: String(existingOrder.id)
                },
                receipt: `rfnd-${existingOrder.order_ref || existingOrder.id}-${Date.now()}`
            };
            if (amountSubunits && Number.isFinite(amountSubunits)) {
                payload.amount = amountSubunits;
            }

            refund = await razorpay.payments.refund(paymentId, payload);
            await Order.updatePaymentByRazorpayOrderId({
                razorpayOrderId: existingOrder.razorpay_order_id,
                paymentStatus: PAYMENT_STATUS.REFUNDED,
                razorpayPaymentId: paymentId,
                refundReference: refund?.id || null,
                refundAmount: refund?.amount != null ? Number(refund.amount) / 100 : null,
                refundStatus: refund?.status || null
            });
        }

        await Order.updateStatus(req.params.id, status);
        const order = await Order.getById(req.params.id);
        const io = req.app.get('io');
        if (io) {
            io.emit('order:update', { orderId: req.params.id, status, order });
            if (order?.user_id) {
                io.to(`user:${order.user_id}`).emit('order:update', { orderId: req.params.id, status, order });
            }
        }
        res.json({ order, refund });
    } catch (error) {
        res.status(400).json({ message: error.message || 'Failed to update order' });
    }
};

const deleteAdminOrder = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (!Number.isFinite(orderId) || orderId <= 0) {
            return res.status(400).json({ message: 'Invalid order id' });
        }

        const order = await Order.getById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const deleted = await Order.deleteById(orderId);
        if (!deleted) {
            return res.status(400).json({ message: 'Failed to delete order' });
        }

        const io = req.app.get('io');
        if (io) {
            io.emit('order:update', { orderId, deleted: true, status: 'deleted' });
            if (order?.user_id) {
                io.to(`user:${order.user_id}`).emit('order:update', { orderId, deleted: true, status: 'deleted' });
            }
        }

        return res.json({ ok: true, id: orderId });
    } catch (error) {
        return res.status(400).json({ message: error?.message || 'Failed to delete order' });
    }
};

const deleteAdminPaymentAttempt = async (req, res) => {
    try {
        const attemptId = Number(req.params.id);
        if (!Number.isFinite(attemptId) || attemptId <= 0) {
            return res.status(400).json({ message: 'Invalid attempt id' });
        }

        const attempt = await PaymentAttempt.getById(attemptId);
        if (!attempt || attempt.local_order_id) {
            return res.status(404).json({ message: 'Attempt not found' });
        }
        if (String(attempt.status || '').toLowerCase() === PAYMENT_STATUS.PAID) {
            return res.status(400).json({ message: 'Paid attempts cannot be deleted' });
        }

        await PaymentAttempt.releaseInventoryForAttempt({
            attemptId,
            reason: 'admin_delete'
        });

        const deleted = await PaymentAttempt.deleteById(attemptId);
        if (!deleted) {
            return res.status(400).json({ message: 'Failed to delete attempt' });
        }

        return res.json({ ok: true, id: attemptId });
    } catch (error) {
        return res.status(400).json({ message: error?.message || 'Failed to delete attempt' });
    }
};

const fetchAdminPaymentStatus = async (req, res) => {
    try {
        const {
            orderId = null,
            attemptId = null,
            razorpayOrderId: inputRazorpayOrderId = null,
            razorpayPaymentId: inputRazorpayPaymentId = null
        } = req.body || {};

        const numericOrderId = Number(orderId);
        const numericAttemptId = Number(attemptId);

        const order = Number.isFinite(numericOrderId) && numericOrderId > 0
            ? await Order.getById(numericOrderId)
            : null;
        const attempt = Number.isFinite(numericAttemptId) && numericAttemptId > 0
            ? await PaymentAttempt.getById(numericAttemptId)
            : null;

        let razorpayOrderId = String(
            inputRazorpayOrderId ||
            order?.razorpay_order_id ||
            attempt?.razorpay_order_id ||
            ''
        ).trim();
        let razorpayPaymentId = String(
            inputRazorpayPaymentId ||
            order?.razorpay_payment_id ||
            attempt?.razorpay_payment_id ||
            ''
        ).trim();

        if (!razorpayOrderId && !razorpayPaymentId) {
            return res.status(400).json({ message: 'Razorpay order or payment reference is required' });
        }

        const razorpay = createRazorpayClient();
        let razorpayOrder = null;
        let paymentDetails = null;

        if (razorpayOrderId) {
            try {
                razorpayOrder = await razorpay.orders.fetch(razorpayOrderId);
            } catch {}
        }

        if (razorpayPaymentId) {
            try {
                paymentDetails = await razorpay.payments.fetch(razorpayPaymentId);
                if (!razorpayOrderId && paymentDetails?.order_id) {
                    razorpayOrderId = String(paymentDetails.order_id).trim();
                }
            } catch {}
        }

        // If payment id is not known locally, try resolving latest payment from the Razorpay order.
        if (!paymentDetails && razorpayOrder?.id) {
            try {
                const paymentList = await razorpay.payments.all({
                    order_id: razorpayOrder.id,
                    count: 1
                });
                const candidate = Array.isArray(paymentList?.items) ? paymentList.items[0] : null;
                if (candidate?.id) {
                    paymentDetails = candidate;
                    razorpayPaymentId = candidate.id;
                }
            } catch {}
        }

        let paymentStatus = mapRazorpayOrderStatusToLocalPayment(razorpayOrder?.status);
        const paymentStatusFromPayment = mapRazorpayPaymentStatusToLocalPayment(paymentDetails?.status);
        const refundedSubunits = Number(paymentDetails?.amount_refunded || 0);
        const refundStatusFromGateway = String(paymentDetails?.refund_status || '').trim().toLowerCase();
        const refundSignalFromGateway = (
            refundedSubunits > 0
            || Boolean(refundStatusFromGateway)
            || String(paymentDetails?.status || '').toLowerCase() === 'refunded'
        );
        const existingStatus = String(order?.payment_status || attempt?.status || 'pending').toLowerCase();

        // Razorpay payment can stay "captured" even after refund. Prefer explicit refund signals.
        if (refundSignalFromGateway) {
            paymentStatus = PAYMENT_STATUS.REFUNDED;
        } else if (paymentStatusFromPayment) {
            paymentStatus = paymentStatusFromPayment;
        }
        if (!paymentStatus) {
            paymentStatus = existingStatus;
        }
        // Never regress from refunded to paid when gateway payload has no refund metadata.
        if (existingStatus === PAYMENT_STATUS.REFUNDED && paymentStatus === PAYMENT_STATUS.PAID && !refundSignalFromGateway) {
            paymentStatus = PAYMENT_STATUS.REFUNDED;
        }

        const settlementId = String(
            paymentDetails?.settlement_id
            || order?.settlement_id
            || ''
        ).trim() || null;
        const settlementSnapshot = settlementId
            ? await fetchSettlementSnapshotSafe(razorpay, settlementId)
            : null;

        if (razorpayOrderId) {
            if (paymentStatus === PAYMENT_STATUS.PAID || paymentStatus === PAYMENT_STATUS.REFUNDED) {
                await PaymentAttempt.markPaidByRazorpayOrder({
                    razorpayOrderId,
                    paymentId: razorpayPaymentId || null
                });
            } else if (paymentStatus === PAYMENT_STATUS.FAILED) {
                const existingAttempt = await PaymentAttempt.getByRazorpayOrderIdAny(razorpayOrderId);
                if (existingAttempt) {
                    await PaymentAttempt.releaseInventoryForAttempt({
                        attemptId: existingAttempt.id,
                        reason: 'payment_failed'
                    });
                }
                await PaymentAttempt.markFailedByRazorpayOrder({
                    razorpayOrderId,
                    paymentId: razorpayPaymentId || null,
                    errorMessage: paymentDetails?.error_description || 'Payment failed'
                });
            } else {
                await PaymentAttempt.markAttemptedByRazorpayOrder({
                    razorpayOrderId,
                    paymentId: razorpayPaymentId || null
                });
            }

            await Order.updatePaymentByRazorpayOrderId({
                razorpayOrderId,
                paymentStatus,
                razorpayPaymentId: razorpayPaymentId || null,
                settlementId,
                settlementSnapshot,
                refundReference: null,
                refundAmount: paymentDetails?.amount_refunded != null
                    ? Number(paymentDetails.amount_refunded || 0) / 100
                    : null,
                refundStatus: paymentDetails?.refund_status || null
            });
        }

        const updatedOrder = razorpayOrderId
            ? await Order.getByRazorpayOrderId(razorpayOrderId)
            : order;
        if (updatedOrder) {
            if (paymentStatus === PAYMENT_STATUS.PAID) {
                try {
                    await markRecoveredByOrder({ order: updatedOrder, reason: 'payment_paid_admin_sync' });
                } catch {}
            }
            emitOrderAndPaymentUpdate(req, {
                order: updatedOrder,
                payment: {
                    event: 'admin.fetch_status',
                    paymentStatus,
                    paymentMethod: paymentDetails?.method || updatedOrder?.payment_gateway || 'razorpay',
                    paymentReference: razorpayPaymentId || null,
                    razorpayOrderId: razorpayOrderId || null
                },
                silent: true
            });
        }

        const updatedAttempt = attempt
            ? await PaymentAttempt.getById(attempt.id)
            : (razorpayOrderId ? await PaymentAttempt.getByRazorpayOrderIdAny(razorpayOrderId) : null);

        return res.json({
            ok: true,
            paymentStatus,
            order: updatedOrder || null,
            attempt: updatedAttempt || null,
            razorpay: {
                order: razorpayOrder ? {
                    id: razorpayOrder.id,
                    status: razorpayOrder.status,
                    amount: razorpayOrder.amount,
                    amount_paid: razorpayOrder.amount_paid,
                    amount_due: razorpayOrder.amount_due,
                    offers: razorpayOrder.offers || [],
                    promotions: razorpayOrder.promotions || [],
                    customer_details: razorpayOrder.customer_details || null,
                    shipping_fee: razorpayOrder.shipping_fee ?? null
                } : null,
                payment: paymentDetails ? {
                    id: paymentDetails.id,
                    status: paymentDetails.status,
                    method: paymentDetails.method || null,
                    error_description: paymentDetails.error_description || null,
                    error_reason: paymentDetails.error_reason || null
                } : null,
                settlement: settlementSnapshot
            }
        });
    } catch (error) {
        return res.status(400).json({ message: error?.message || 'Failed to fetch payment status' });
    }
};

const fetchMyPaymentStatus = async (req, res) => {
    try {
        const numericOrderId = Number(req.body?.orderId);
        if (!Number.isFinite(numericOrderId) || numericOrderId <= 0) {
            return res.status(400).json({ message: 'Valid order id is required' });
        }

        const order = await Order.getById(numericOrderId);
        if (!order || String(order.user_id) !== String(req.user.id)) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const razorpayOrderId = String(order?.razorpay_order_id || '').trim();
        const razorpayPaymentId = String(order?.razorpay_payment_id || '').trim();
        if (!razorpayOrderId && !razorpayPaymentId) {
            return res.status(400).json({ message: 'Razorpay reference not available for this order' });
        }

        req.body = {
            orderId: numericOrderId,
            attemptId: null,
            razorpayOrderId,
            razorpayPaymentId
        };
        return fetchAdminPaymentStatus(req, res);
    } catch (error) {
        return res.status(400).json({ message: error?.message || 'Failed to fetch refund status' });
    }
};

const sendInvoicePdf = async (res, order) => {
    const paymentStatus = String(order?.payment_status || '').toLowerCase();
    if (![PAYMENT_STATUS.PAID, PAYMENT_STATUS.REFUNDED].includes(paymentStatus)) {
        return res.status(400).json({ message: 'Invoice is available only for paid or refunded orders' });
    }
    let orderForInvoice = { ...(order || {}) };
    try {
        const snapshot = orderForInvoice.company_snapshot && typeof orderForInvoice.company_snapshot === 'object'
            ? { ...orderForInvoice.company_snapshot }
            : {};
        const missingAddress = !String(snapshot.address || '').trim();
        const missingSupport = !String(snapshot.supportEmail || '').trim();
        const missingContact = !String(snapshot.contactNumber || '').trim();
        if (missingAddress || missingSupport || missingContact) {
            const profile = await CompanyProfile.get();
            orderForInvoice.company_snapshot = {
                ...profile,
                ...snapshot,
                address: snapshot.address || profile.address || '',
                supportEmail: snapshot.supportEmail || profile.supportEmail || '',
                contactNumber: snapshot.contactNumber || profile.contactNumber || ''
            };
        }
    } catch {}
    const pdfBuffer = await buildInvoicePdfBuffer(orderForInvoice);
    const invoiceRef = String(order?.order_ref || order?.id || Date.now()).replace(/[^a-zA-Z0-9-_]/g, '');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=\"invoice-${invoiceRef}.pdf\"`);
    res.setHeader('Cache-Control', 'no-store');
    return res.send(pdfBuffer);
};

const downloadMyInvoicePdf = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (!Number.isFinite(orderId) || orderId <= 0) {
            return res.status(400).json({ message: 'Invalid order id' });
        }
        const order = await Order.getById(orderId);
        if (!order || String(order.user_id) !== String(req.user.id)) {
            return res.status(404).json({ message: 'Order not found' });
        }
        return sendInvoicePdf(res, order);
    } catch (error) {
        return res.status(500).json({ message: error?.message || 'Failed to generate invoice' });
    }
};

const downloadAdminInvoicePdf = async (req, res) => {
    try {
        const orderId = Number(req.params.id);
        if (!Number.isFinite(orderId) || orderId <= 0) {
            return res.status(400).json({ message: 'Invalid order id' });
        }
        const order = await Order.getById(orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }
        return sendInvoicePdf(res, order);
    } catch (error) {
        return res.status(500).json({ message: error?.message || 'Failed to generate invoice' });
    }
};

module.exports = {
    createOrderFromCheckout,
    createRazorpayOrder,
    validateRecoveryCoupon,
    retryRazorpayPayment,
    verifyRazorpayPayment,
    handleRazorpayWebhook,
    getAdminOrders,
    getAdminOrderById,
    getMyOrders,
    getMyOrderByPaymentRef,
    downloadMyInvoicePdf,
    downloadAdminInvoicePdf,
    updateOrderStatus,
    fetchAdminPaymentStatus,
    fetchMyPaymentStatus,
    deleteAdminOrder,
    deleteAdminPaymentAttempt
};
