const Order = require('../models/Order');
const crypto = require('crypto');
const { PaymentAttempt, PAYMENT_STATUS } = require('../models/PaymentAttempt');
const WebhookEvent = require('../models/WebhookEvent');
const { createRazorpayClient } = require('../services/razorpayService');

const toSubunit = (amount) => Math.round(Number(amount || 0) * 100);
const ATTEMPT_TTL_MINUTES = 30;

const buildReceipt = (userId) => {
    const uid = String(userId || '').replace(/[^a-zA-Z0-9]/g, '').slice(-10) || 'guest';
    const stamp = Date.now().toString(36);
    return `ssc_${uid}_${stamp}`.slice(0, 40);
};

const emitOrderAndPaymentUpdate = (req, { order, payment = null } = {}) => {
    const io = req.app.get('io');
    if (!io || !order) return;
    const payload = { orderId: order.id, status: order.status, order };
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

const createRazorpayOrder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { billingAddress, shippingAddress, notes } = req.body || {};

        const summary = await Order.getCheckoutSummary(userId, { shippingAddress });
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
            notes,
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

        const cartSummary = await Order.getCheckoutSummary(userId, {
            shippingAddress: attempt.shipping_address || null
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
                razorpaySignature
            },
            skipStockDeduction: true
        });

        await PaymentAttempt.consumeInventoryForAttempt({ attemptId: attempt.id });

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

        const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id || null;
        const razorpayPaymentId = paymentEntity?.id || null;
        const failureReason = paymentEntity?.error_description || paymentEntity?.error_reason || null;

        if (!razorpayOrderId) {
            await WebhookEvent.markProcessed({
                eventId: webhookEventId,
                status: 'ignored',
                note: 'missing_order_id'
            });
            return res.status(200).json({ ok: true, ignored: true, reason: 'missing_order_id' });
        }

        let paymentStatus = null;
        if (event === 'payment.authorized') paymentStatus = PAYMENT_STATUS.ATTEMPTED;
        if (event === 'payment.captured' || event === 'order.paid') paymentStatus = PAYMENT_STATUS.PAID;
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

        if (paymentStatus === 'attempted') {
            await PaymentAttempt.markAttemptedByRazorpayOrder({
                razorpayOrderId,
                paymentId: razorpayPaymentId
            });
        } else if (paymentStatus === PAYMENT_STATUS.PAID) {
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
        } else if (paymentStatus === PAYMENT_STATUS.FAILED) {
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
        } else if (paymentStatus === PAYMENT_STATUS.REFUNDED) {
            await PaymentAttempt.markPaidByRazorpayOrder({
                razorpayOrderId,
                paymentId: razorpayPaymentId
            });
        }

        const refundEntity = req.body?.payload?.refund?.entity || null;
        const updatedCount = await Order.updatePaymentByRazorpayOrderId({
            razorpayOrderId,
            paymentStatus,
            razorpayPaymentId,
            refundReference: refundEntity?.id || null,
            refundAmount: refundEntity?.amount != null ? Number(refundEntity.amount) / 100 : null,
            refundStatus: refundEntity?.status || null
        });

        if (updatedCount > 0) {
            const order = await Order.getByRazorpayOrderId(razorpayOrderId);
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

const updateOrderStatus = async (req, res) => {
    try {
        const { status } = req.body || {};
        await Order.updateStatus(req.params.id, status);
        const order = await Order.getById(req.params.id);
        const io = req.app.get('io');
        if (io) {
            io.emit('order:update', { orderId: req.params.id, status, order });
            if (order?.user_id) {
                io.to(`user:${order.user_id}`).emit('order:update', { orderId: req.params.id, status, order });
            }
        }
        res.json({ order });
    } catch (error) {
        res.status(400).json({ message: error.message || 'Failed to update order' });
    }
};

module.exports = {
    createOrderFromCheckout,
    createRazorpayOrder,
    retryRazorpayPayment,
    verifyRazorpayPayment,
    handleRazorpayWebhook,
    getAdminOrders,
    getAdminOrderById,
    getMyOrders,
    updateOrderStatus
};
