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
app.use(express.json({ limit: '50mb' })); // Limit besar untuk upload Avatar/Import JSON

// DB Connection
let isConnected = false;
const connectDB = async () => {
    if (isConnected) return;
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
        });
        isConnected = !!conn.connections[0].readyState;
        console.log(`✅ MongoDB Connected`);
    } catch (error) {
        console.error(`❌ DB Error: ${error.message}`);
    }
};

app.use(async (req, res, next) => {
    await connectDB();
    next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/developer', require('./routes/developer')); 
app.use('/api/data', require('./routes/data'));
app.use('/api/admin', require('./routes/admin')); 
app.use('/api/schema', require('./routes/schema')); 
app.get('/', (req, res) => res.send('WANZDB v2.0 enterprise Backend'));

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

module.exports = app;