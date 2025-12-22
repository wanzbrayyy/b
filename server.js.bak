const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

// Load env vars
dotenv.config();

const app = express();

// Middleware
app.use(cors()); // Agar frontend Vite bisa akses backend
app.use(express.json()); // Agar bisa baca JSON dari body request

// Koneksi Database
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected: wanzdb_production'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// --- ROUTES ---
app.use('/api/auth', require('./routes/auth'));
app.use('/api/data', require('./routes/data'));

// Jalankan Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));