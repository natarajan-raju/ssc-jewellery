const path = require('path');
const http = require('http'); // [NEW] Import HTTP
const { Server } = require('socket.io'); // [NEW] Import Socket.io

const isDev = process.env.npm_lifecycle_event === 'server' || process.env.npm_lifecycle_event === 'dev';

if (isDev) {
    require('dotenv').config({ path: path.join(__dirname, '.env.dev') });
    console.log("🛠️  DEVELOPMENT MODE: Loaded .env.dev (Remote DB)");
} else {
    require('dotenv').config(); 
    console.log("🚀 PRODUCTION MODE: Loaded .env (Local DB)");
}

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
const {
    startAbandonedCartRecoveryScheduler,
    startAbandonedCartMaintenanceScheduler,
    setKnownPublicOriginFromRequest
} = require('./services/abandonedCartRecoveryService');
const { runMonthlyLoyaltyReassessment, ensureLoyaltyConfigLoaded } = require('./services/loyaltyService');

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
    socket.on('auth', (payload = {}) => {
        const userId = payload.userId || payload.id;
        if (userId) {
            socket.join(`user:${userId}`);
        }
        const role = String(payload.role || '').toLowerCase();
        if (role === 'admin' || role === 'staff') {
            socket.join('admin');
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
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

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
