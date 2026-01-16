const path = require('path');
const isDev = process.env.npm_lifecycle_event === 'server' || process.env.npm_lifecycle_event === 'dev';

if (isDev) {
    require('dotenv').config({ path: path.join(__dirname, '.env.dev') });
    console.log("🛠️  DEVELOPMENT MODE: Loaded .env.dev (Remote DB)");
} else {
    require('dotenv').config(); // Loads standard .env
    console.log("🚀 PRODUCTION MODE: Loaded .env (Local DB)");
}
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes'); // Ensure this is imported
// const syncDatabase = require('./utils/dbSync'); // Import Sync
const productRoutes = require('./routes/productRoutes'); // Import Product Routes
const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes); // Use Product Routes
// Sync Database (Runs only in production)
// syncDatabase();

// Serve Frontend
app.use(express.static(path.join(__dirname, '../client/dist')));
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));