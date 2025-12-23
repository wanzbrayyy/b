const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const AiModel = require('./models/aiModel'); // Import Model AI
const axios = require('axios'); // Asumsi axios terinstal

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

// 🔥 ROUTE PUBLIK AI MODEL DITEMPATKAN DI SINI (PALING ATAS) 🔥
// Endpoint ini tidak memerlukan Token (Auth)
app.get('/api/developer/public/ai-model/:modelName', async (req, res) => {
    try {
        const { modelName } = req.params;
        const model = await AiModel.findOne({ modelName, isPublic: true }); 
        
        if (!model) return res.status(404).json({ msg: "Model not found or is set to private" });

        const publicData = {
            modelName: model.modelName,
            version: model.version,
            context: model.context,
            description: model.description,
            endpoint: `https://ai.wanzofc.site/v1/chat/completions/${model.modelName}`,
            quickstart: {
                node: `const stream = await client.ai.chat.send({ model: '${model.modelName}', messages: [...] });`
            }
        };

        res.json(publicData);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
// 🔥 AKHIR ROUTE PUBLIK 🔥


// Routes Protected (Semua yang ada di bawah ini menggunakan auth middleware di file masing-masing)
app.use('/api/auth', require('./routes/auth'));
app.use('/api/developer', require('./routes/developer')); 
app.use('/api/data', require('./routes/data'));
app.use('/api/admin', require('./routes/admin')); 
app.use('/api/schema', require('./routes/schema')); 

// Default Route
app.get('/', (req, res) => {
    res.send('✅ WanzDB Backend is Running');
});


if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => console.log(`🚀 Server running locally on port ${PORT}`));
}

module.exports = app;