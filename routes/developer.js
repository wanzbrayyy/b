const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const ApiKey = require('../models/apikey');
const ActivityLog = require('../models/activityLog');
const AiModel = require('../models/aiModel');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

// ===============================================
// 🔥 ZONE PUBLIK (TIDAK ADA AUTH MIDDLEWARE) 🔥
// ===============================================

// @route GET api/developer/public/ai-model/:modelName
// @desc  Get public details of a specific AI model
router.get('/public/ai-model/:modelName', async (req, res) => {
    try {
        const { modelName } = req.params;
        const model = await AiModel.findOne({ modelName });
        
        if (!model || !model.isPublic) return res.status(404).json({ msg: "Model not found or is set to private" });

        // Data yang ditampilkan ke publik
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


// ===============================================
// 🔥 ZONE PROTECTED (Membutuhkan auth) 🔥
// ===============================================

router.use(auth); // Pasang auth middleware di sini

// --- AI CHAT PROXY (MENGGUNAKAN KEY DARI DB) ---
router.post('/ai-chat-proxy', async (req, res) => {
    const { modelName, messages, temperature, max_tokens } = req.body; 
    
    try {
        // 1. Dapatkan API Key dari Database (berdasarkan modelName)
        const aiModel = await AiModel.findOne({ modelName });
        if (!aiModel) {
            return res.status(404).json({ msg: `Model '${modelName}' not found in WanzDB catalog.` });
        }
        
        // 🔥 KRUSIAL: Ambil API Key dari DB (disimpan sebagai apiKeyHash di Model)
        const OPENROUTER_API_KEY = aiModel.apiKeyHash;

        if (!OPENROUTER_API_KEY || !OPENROUTER_API_KEY.startsWith('sk-or-v1-')) {
             return res.status(500).json({ msg: "API Key untuk model ini tidak valid atau kosong." });
        }

        // 2. Kirim ke OpenRouter
        const openrouterUrl = "https://openrouter.ai/api/v1/chat/completions";
        
        const openrouterResponse = await axios.post(
            openrouterUrl,
            {
                model: modelName,
                messages: messages,
                temperature: temperature || 0.7,
                max_tokens: max_tokens || 100,
                stream: false
            },
            {
                headers: {
                    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://landing.wanzofc.site", 
                    "X-Title": "WanzDB Console", 
                },
            }
        );
        
        res.json(openrouterResponse.data);

    } catch (error) {
        console.error("OpenRouter Proxy Error:", error.response?.data || error.message);
        res.status(500).json({ msg: "Failed to process AI request.", detail: error.response?.data });
    }
});


// --- API KEYS MANAGEMENT ---

// GET API Keys
router.get('/keys', async (req, res) => {
    try {
        const keys = await ApiKey.find({ userId: req.user.id });
        const safeKeys = keys.map(k => {
            const key = k.toObject();
            delete key.key;
            return key;
        });
        res.json(safeKeys);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE API Key
router.post('/keys', async (req, res) => {
    try {
        const { name, permissions } = req.body;
        
        const newKey = new ApiKey({
            key: `wanz_${uuidv4().replace(/-/g, '')}`,
            userId: req.user.id,
            name: name || 'Untitled Key',
            permissions: permissions
        });
        await newKey.save();

        const safeKey = newKey.toObject();
        delete safeKey.key;
        
        res.status(201).json(safeKey);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE API Key
router.delete('/keys/:id', async (req, res) => {
    try {
        const key = await ApiKey.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        if (!key) return res.status(404).json({ msg: "API Key not found or access denied" });
        
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


// --- ANALYTICS & LOGS ---

// GET Activity Stats (Chart Data)
router.get('/stats', async (req, res) => {
    try {
        const stats = await ActivityLog.aggregate([
            { $match: { 
                userId: req.user._id,
                timestamp: { $gte: new Date(Date.now() - 24*60*60*1000) } 
            }},
            { $group: {
                _id: { $hour: "$timestamp" },
                count: { $sum: 1 }
            }},
            { $sort: { "_id": 1 } }
        ]);
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET Recent Logs (Logs Stream)
router.get('/logs', async (req, res) => {
    try {
        const logs = await ActivityLog.find({ userId: req.user._id })
            .sort({ timestamp: -1 })
            .limit(50);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;