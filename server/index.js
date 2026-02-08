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

// [NEW] Make 'io' accessible in controllers via req.app.get('io')
app.set('io', io);

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/cms', cmsRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/shipping', shippingRoutes);
app.use('/uploads', express.static(path.join(__dirname, '../client/public/uploads')));
// Serve Frontend
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// [CHANGE] Use server.listen instead of app.listen
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
