const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
    origin: "*", // Izinkan semua frontend akses (untuk debugging)
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true
}));
app.use(express.json());

// --- MONGODB CONNECTION (SERVERLESS OPTIMIZED) ---
let isConnected = false;

const connectDB = async () => {
    if (isConnected) return;

    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // Opsi agar koneksi lebih stabil di jaringan lambat
            serverSelectionTimeoutMS: 5000, 
            socketTimeoutMS: 45000,
        });
        isConnected = !!conn.connections[0].readyState;
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
        // Jangan process.exit(1) di serverless, biarkan retry
    }
};

// Middleware: Pastikan DB connect sebelum memproses request apa pun
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// Default Route (Cek status server)
app.get('/', (req, res) => {
    res.send('✅ WanzDB Backend is Running & Connected!');
});

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/data', require('./routes/data'));

// Vercel membutuhkan export app, bukan app.listen
// Tapi untuk local development, kita butuh listen
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Server running locally on port ${PORT}`));
}

module.exports = app;