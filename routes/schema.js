const express = require('express');
const router = express.Router();
const Schema = require('../models/schema');
const auth = require('../middleware/authMiddleware');

router.use(auth);

// @route GET api/schema/:collectionName
// @desc Get schema by collection name
router.get('/:collectionName', async (req, res) => {
    try {
        const { collectionName } = req.params;
        const schemaId = `${collectionName}_${req.user.id}`;
        
        const schema = await Schema.findById(schemaId);
        
        // Jika tidak ada, kembalikan array kosong
        if (!schema) return res.json({ fields: [] });

        res.json(schema);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// @route POST/PUT api/schema/:collectionName
// @desc Create or Update schema
router.post('/:collectionName', async (req, res) => {
    try {
        const { collectionName } = req.params;
        const { fields } = req.body; // Array of { name, type, required }
        const schemaId = `${collectionName}_${req.user.id}`;

        const newSchema = {
            _id: schemaId,
            collectionName,
            userId: req.user.id,
            fields: fields.filter(f => f.name && f.name.trim() !== ''),
            updatedAt: new Date()
        };

        const result = await Schema.findByIdAndUpdate(
            schemaId, 
            newSchema, 
            { new: true, upsert: true } // Upsert: buat baru jika tidak ada
        );

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;