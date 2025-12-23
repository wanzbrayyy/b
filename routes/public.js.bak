const express = require('express');
const router = express.Router();
const AiModel = require('../models/aiModel');

// @route GET /api/public/ai-model/:modelName
// @desc  Get public details of a specific AI model (NO AUTH AT ALL)
router.get('/ai-model/:modelName', async (req, res) => {
    try {
        const { modelName } = req.params;
        
        // Cari model dan pastikan isPublic: true
        const model = await AiModel.findOne({ modelName, isPublic: true }); 
        
        if (!model) return res.status(404).json({ msg: "Model not found or is set to private" });

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

module.exports = router;