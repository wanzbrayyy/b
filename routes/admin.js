const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const admin = require('../middleware/adminMiddleware');
const AiModel = require('../models/aiModel');

// PENTING: Semua route di sini wajib Login (auth) DAN harus role 'admin' (admin)
router.use(auth);
router.use(admin);

// --- AI MODEL MANAGEMENT (ADMIN ONLY) ---

// GET All Models (Admin melihat semua model)
router.get('/ai-models', async (req, res) => {
    try {
        const models = await AiModel.find({});
        
        const safeModels = models.map(m => {
            const model = m.toObject();
            delete model.apiKeyHash; 
            return model;
        });
        res.json(safeModels);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CREATE Model
router.post('/ai-models', async (req, res) => {
    try {
        const { modelName, version, context, description, apiKey } = req.body;
        
        const newModel = new AiModel({
            userId: req.user._id, // Menggunakan UUID 50 digit
            modelName,
            version,
            context,
            description,
            apiKeyHash: apiKey 
        });

        await newModel.save();

        const model = newModel.toObject();
        delete model.apiKeyHash;
        
        res.status(201).json(model);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE Model
router.delete('/ai-models/:id', async (req, res) => {
    try {
        const model = await AiModel.findByIdAndDelete(req.params.id);
        if (!model) return res.status(404).json({ msg: "Model not found" });
        
        res.json({ success: true, msg: "AI Model deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


module.exports = router;