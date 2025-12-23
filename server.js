const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
    origin: "*", 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-auth-token", "x-api-key"]
}));
app.use(express.json({ limit: '50mb' }));

// DB Connection
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;

    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000, 
            socketTimeoutMS: 45000,
        });
        isConnected = !!conn.connections[0].readyState;
        console.log(`✅ MongoDB Connected`);
    } catch (error) {
        console.error(`❌ MongoDB Connection Error: ${error.message}`);
    }
};

// Middleware: Pastikan DB connect
app.use(async (req, res, next) => {
    await connectDB();
    next();
});

// 🔥 ROUTE DEBUG BARU: Quick Setup Admin 🔥
app.get('/titit', async (req, res) => {
    try {
        const User = require('./models/user'); 
        const bcrypt = require('bcryptjs');
        const { v4: uuidv4 } = require('uuid');

        const newName = 'debugadmin';
        const newEmail = `debug-${Date.now()}@wanzdb.com`;
        const simplePass = 'awan';
        const userId = uuidv4();
        let user = await User.findOne({ name: newName });
        if (user) {
            return res.status(200).send(`
                <h1>Quick Setup Error</h1>
                <p>User 'debugadmin' already exists. <a href="/api/auth/login">Login here</a>.</p>
                <p>Password: ${simplePass}</p>
            `);
        }

        const hashedPassword = await bcrypt.hash(simplePass, 10);

        user = new User({
            _id: 'debug_' + uuidv4(), // Pastikan ID unik
            name: newName,
            email: newEmail,
            password: hashedPassword,
            role: 'admin',
            avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=debugadmin'
        });

        await user.save();

        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>WanzDB Quick Setup</title>
                <style>body{font-family:sans-serif;background:#0f172a;color:white;padding:20px}code{background:#27272a;padding:5px;border-radius:4px;display:block;margin-top:10px}</style>
            </head>
            <body>
                <h1>✅ WanzDB Admin Quick Setup Success</h1>
                <p>Akun admin telah berhasil dibuat di database. Gunakan kredensial di bawah ini untuk Login Console atau SDK.</p>
                <p><strong>Username:</strong> <code>${newName}</code></p>
                <p><strong>Email:</strong> <code>${newEmail}</code></p>
                <p><strong>Password:</strong> <code>${simplePass}</code> (<strong>Ubah segera!</strong>)</p>
                <p><strong>UUID/API Key:</strong> <code>${user._id}</code></p>
                <hr>
                <h2>Connection String (SDK)</h2>
                <code>wanzdb://${newName}:${user._id}@dbw-nu.vercel.app/?retryWrites=true</code>
                <p><a href="/">Kembali ke Landing Page</a></p>
            </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send(`
            <h1>❌ Server Error</h1>
            <p>Failed to create admin user: ${e.message}</p>
            <p>Database Status: ${isConnected ? 'Connected' : 'Disconnected'}</p>
        `);
    }
});
app.use('/api/auth', require('./routes/auth'));
app.use('/api/developer', require('./routes/developer'));
app.use('/api/data', require('./routes/data'));
app.use('/api/admin', require('./routes/admin')); 
app.use('/api/schema', require('./routes/schema')); 
app.get('/', (req, res) => {
    res.send('✅ WanzDB Backend is Running');
});


if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Server running locally on port ${PORT}`));
}

module.exports = app;