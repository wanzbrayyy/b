const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const ApiKey = require('../models/apikey');
const ActivityLog = require('../models/activitylog');
const { v4: uuidv4 } = require('uuid');
router.get('/keys', auth, async (req, res) => {
    try {
        const keys = await ApiKey.find({ userId: req.user.id });
        res.json(keys);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.post('/keys', auth, async (req, res) => {
    try {
        const { name } = req.body;
        const newKey = new ApiKey({
            key: `wanz_${uuidv4().replace(/-/g, '')}`,
            userId: req.user.id,
            name: name || 'Untitled Key'
        });
        await newKey.save();
        res.json(newKey);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
router.delete('/keys/:id', auth, async (req, res) => {
    try {
        await ApiKey.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/stats', auth, async (req, res) => {
    try {
        const stats = await ActivityLog.aggregate([
            { $match: { 
                userId: req.user.id,
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
router.get('/logs', auth, async (req, res) => {
    try {
        const logs = await ActivityLog.find({ userId: req.user.id })
            .sort({ timestamp: -1 })
            .limit(50);
        res.json(logs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;