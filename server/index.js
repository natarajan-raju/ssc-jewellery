const path = require('path');
const fs = require('fs');
const http = require('http'); // [NEW] Import HTTP
const { Server } = require('socket.io'); // [NEW] Import Socket.io
const jwt = require('jsonwebtoken');
const { getSocketRoomsForUser, canAuthenticateSocketUser } = require('./utils/socketAudience');

const nodeEnv = String(process.env.NODE_ENV || 'development').trim().toLowerCase();
const isProduction = nodeEnv === 'production';
const projectRoot = path.join(__dirname, '..');
const rootDevEnvPath = path.join(projectRoot, '.env.dev');
const rootEnvPath = path.join(projectRoot, '.env');
const serverDevEnvPath = path.join(__dirname, '.env.dev');

if (isProduction) {
    if (fs.existsSync(rootEnvPath)) {
        require('dotenv').config({ path: rootEnvPath });
        console.log("🚀 PRODUCTION MODE: Loaded root .env");
    } else {
        require('dotenv').config();
        console.log("🚀 PRODUCTION MODE: Loaded default .env");
    }
} else {
    if (fs.existsSync(rootDevEnvPath)) {
        require('dotenv').config({ path: rootDevEnvPath });
        console.log("🛠️  DEVELOPMENT MODE: Loaded root .env.dev");
    } else if (fs.existsSync(serverDevEnvPath)) {
        require('dotenv').config({ path: serverDevEnvPath });
        console.log("🛠️  DEVELOPMENT MODE: Loaded server/.env.dev");
    } else if (fs.existsSync(rootEnvPath)) {
        require('dotenv').config({ path: rootEnvPath });
        console.log("🛠️  DEVELOPMENT MODE: Loaded root .env");
    } else {
        require('dotenv').config();
        console.log("🛠️  DEVELOPMENT MODE: Loaded default .env");
    }
}

if (!String(process.env.JWT_SECRET || '').trim()) {
    console.error('FATAL: JWT_SECRET is missing. Set JWT_SECRET in your environment before starting the server.');
    process.exit(1);
}

const db = require('./config/db');

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const productRoutes = require('./routes/productRoutes');
const cmsRoutes = require('./routes/cmsRoutes');
const cartRoutes = require('./routes/cartRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const shippingRoutes = require('./routes/shippingRoutes');
const orderRoutes = require('./routes/orderRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const Order = require('./models/Order');
const User = require('./models/User');
const { PaymentAttempt } = require('./models/PaymentAttempt');
const { sendOrderLifecycleCommunication } = require('./services/communications/communicationService');
const { buildDeliveryConfirmationUrl } = require('./services/deliveryConfirmationService');
const {
    startAbandonedCartRecoveryScheduler,
    startAbandonedCartMaintenanceScheduler,
    setKnownPublicOriginFromRequest
} = require('./services/abandonedCartRecoveryService');
const { runMonthlyLoyaltyReassessment, ensureLoyaltyConfigLoaded, issueBirthdayCouponsForEligibleUsersToday } = require('./services/loyaltyService');
const { runDashboardAlertsJob, refreshDashboardDailyAggregates } = require('./controllers/adminController');
const {
    processQueuedCommunicationRetries,
    pruneCommunicationDeliveryLogs
} = require('./services/communications/communicationRetryService');
const sanitizeRequest = require('./middleware/sanitizeRequest');

const app = express();
const server = http.createServer(app); // [NEW] Wrap Express app

// [NEW] Setup Socket.io
const io = new Server(server, {
    cors: {
        // Allow connections from your Frontend URL(s)
        origin: ["http://localhost:5173", "http://localhost:3000"], 
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    socket.on('auth', async (payload = {}) => {
        try {
            const token = String(payload.token || '').trim();
            if (!token || token === 'undefined' || token === 'null') {
                socket.emit('auth:error', { message: 'Authentication token is required' });
                return;
            }
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const userId = decoded?.id ? String(decoded.id) : '';
            if (!userId) {
                socket.emit('auth:error', { message: 'Invalid socket token payload' });
                return;
            }
            const user = await User.findById(userId);
            if (!user || !canAuthenticateSocketUser(user)) {
                socket.emit('auth:error', { message: user ? 'Socket user is inactive' : 'Socket user not found' });
                return;
            }

            const normalizedRole = String(user.role || '').toLowerCase();
            const joinedRooms = [...socket.rooms].filter((room) => room !== socket.id);
            joinedRooms.forEach((room) => socket.leave(room));
            getSocketRoomsForUser({ userId, role: normalizedRole }).forEach((room) => socket.join(room));
            socket.data.userId = userId;
            socket.data.role = normalizedRole;
            socket.emit('auth:ok', { userId, role: normalizedRole });
        } catch (error) {
            socket.emit('auth:error', { message: 'Socket authentication failed' });
        }
    });
});

// [NEW] Make 'io' accessible in controllers via req.app.get('io')
app.set('io', io);

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use((req, _res, next) => {
    setKnownPublicOriginFromRequest(req);
    next();
});
app.use(express.json({
    verify: (req, _res, buf) => {
        if (req.originalUrl?.startsWith('/api/orders/razorpay/webhook')) {
            req.rawBody = buf.toString('utf8');
        }
    }
}));
app.use(sanitizeRequest);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cms', cmsRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/uploads', express.static(path.join(__dirname, '../client/public/uploads')));
// Serve Frontend
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// [CHANGE] Use server.listen instead of app.listen
const startServer = async () => {
    try {
        if (db?.ready && typeof db.ready.then === 'function') {
            await db.ready;
        }
    } catch (error) {
        console.error('Database bootstrap failed. Server not started:', error?.message || error);
        process.exit(1);
    }
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};
startServer();

const scheduleMidnightJob = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const delay = next.getTime() - now.getTime();
    setTimeout(async () => {
        try {
            const result = await Order.markStaleAsPending();
            const ids = Array.isArray(result?.ids) ? result.ids : [];
            if (ids.length > 0) {
                for (const orderId of ids) {
                    try {
                        const order = await Order.getById(orderId);
                        if (!order?.user_id) continue;
                        const customer = await User.findById(order.user_id);
                        if (!customer?.email) continue;
                        await sendOrderLifecycleCommunication({
                            stage: 'pending_delay',
                            customer,
                            order
                        });
                    } catch (error) {
                        console.error(`Pending-delay email failed for order ${orderId}:`, error?.message || error);
                    }
                }
            }
            const reminderCandidates = await Order.getShippedOrdersForCustomerConfirmation({ afterDays: 7, limit: 300 });
            for (const order of reminderCandidates) {
                try {
                    if (!order?.user_id) continue;
                    const customer = await User.findById(order.user_id);
                    if (!customer?.email) continue;
                    const deliveryConfirmUrl = buildDeliveryConfirmationUrl({
                        orderId: order.id,
                        userId: order.user_id
                    });
                    if (!deliveryConfirmUrl) continue;
                    await sendOrderLifecycleCommunication({
                        stage: 'shipped_followup',
                        customer,
                        order: {
                            ...order,
                            delivery_confirmation_url: deliveryConfirmUrl
                        }
                    });
                    await Order.markDeliveryConfirmationReminderSent(order.id);
                } catch (error) {
                    console.error(`Shipped follow-up email failed for order ${order?.id || 'unknown'}:`, error?.message || error);
                }
            }
        } catch (error) {
            console.error('Order pending job failed:', error);
        }
        scheduleMidnightJob();
    }, delay);
};

scheduleMidnightJob();

const schedulePaymentAttemptExpiryJob = () => {
    const intervalMs = 5 * 60 * 1000;
    setInterval(async () => {
        try {
            await PaymentAttempt.expireStaleAttempts({ ttlMinutes: 30 });
        } catch (error) {
            console.error('Payment attempt expiry job failed:', error);
        }
    }, intervalMs);
};

schedulePaymentAttemptExpiryJob();
ensureLoyaltyConfigLoaded({ force: true }).catch(() => {});
const scheduleMonthlyLoyaltyReassessment = () => {
    let lastRunKey = '';
    const runIfWindow = async () => {
        try {
            const now = new Date();
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).formatToParts(now).reduce((acc, part) => {
                if (part.type !== 'literal') acc[part.type] = part.value;
                return acc;
            }, {});
            const year = parts.year;
            const month = parts.month;
            const day = Number(parts.day || 0);
            const hour = Number(parts.hour || 0);
            const minute = Number(parts.minute || 0);
            const runKey = `${year}-${month}`;
            const inWindow = day === 1 && hour === 0 && minute >= 30 && minute < 45;
            if (!inWindow || lastRunKey === runKey) return;
            const result = await runMonthlyLoyaltyReassessment();
            lastRunKey = runKey;
            console.log('Monthly loyalty reassessment completed:', result);
        } catch (error) {
            console.error('Monthly loyalty reassessment failed:', error);
        }
    };

    setInterval(runIfWindow, 15 * 60 * 1000);
    runIfWindow();
};

scheduleMonthlyLoyaltyReassessment();
const scheduleDailyBirthdayCoupons = () => {
    let lastRunKey = '';
    const runIfWindow = async () => {
        try {
            const now = new Date();
            const parts = new Intl.DateTimeFormat('en-US', {
                timeZone: 'Asia/Kolkata',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }).formatToParts(now).reduce((acc, part) => {
                if (part.type !== 'literal') acc[part.type] = part.value;
                return acc;
            }, {});
            const runKey = `${parts.year}-${parts.month}-${parts.day}`;
            const hour = Number(parts.hour || 0);
            const minute = Number(parts.minute || 0);
            const inWindow = hour === 9 && minute >= 0 && minute < 20;
            if (!inWindow || lastRunKey === runKey) return;
            const result = await issueBirthdayCouponsForEligibleUsersToday();
            lastRunKey = runKey;
            console.log('Daily birthday coupon job completed:', result);
        } catch (error) {
            console.error('Daily birthday coupon job failed:', error);
        }
    };
    setInterval(runIfWindow, 10 * 60 * 1000);
    runIfWindow();
};
scheduleDailyBirthdayCoupons();

const scheduleDashboardAlerts = () => {
    setInterval(async () => {
        try {
            await runDashboardAlertsJob();
        } catch (error) {
            console.error('Dashboard alert scheduler failed:', error?.message || error);
        }
    }, 10 * 60 * 1000);
};

const scheduleDashboardAggregatesRefresh = () => {
    const run = async () => {
        try {
            await refreshDashboardDailyAggregates({ lookbackDays: 120 });
        } catch (error) {
            console.error('Dashboard aggregate refresh failed:', error?.message || error);
        }
    };
    setInterval(run, 60 * 60 * 1000);
    run();
};

const scheduleCommunicationRetryProcessing = () => {
    const run = async () => {
        try {
            await processQueuedCommunicationRetries();
        } catch (error) {
            console.error('Communication retry scheduler failed:', error?.message || error);
        }
    };
    setInterval(run, 5 * 60 * 1000);
    run();
};

const scheduleCommunicationRetryMaintenance = () => {
    const run = async () => {
        try {
            await pruneCommunicationDeliveryLogs();
        } catch (error) {
            console.error('Communication retry maintenance failed:', error?.message || error);
        }
    };
    setInterval(run, 12 * 60 * 60 * 1000);
    run();
};

scheduleDashboardAlerts();
scheduleDashboardAggregatesRefresh();
scheduleCommunicationRetryProcessing();
scheduleCommunicationRetryMaintenance();

startAbandonedCartRecoveryScheduler({
    onJourneyUpdate: (payload = {}) => {
        io.to('admin').emit('abandoned_cart:journey:update', {
            ...payload,
            ts: new Date().toISOString()
        });
    }
});
startAbandonedCartMaintenanceScheduler({
    onJourneyUpdate: (payload = {}) => {
        io.to('admin').emit('abandoned_cart:journey:update', {
            ...payload,
            ts: new Date().toISOString()
        });
    }
});
