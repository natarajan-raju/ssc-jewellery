require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Mount the Auth Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', require('./routes/adminRoutes'));
// Test Route
app.get('/api/test', (req, res) => res.json({ message: "Server is working" }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));