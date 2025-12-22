const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/authMiddleware');
const logger = require('../middleware/logger');

// Middleware Wajib
router.use(auth);
router.use(logger);

const getCollection = (colName) => mongoose.connection.db.collection(colName);
const META_COLLECTION_NAME = '_meta_collections_list';

// Helper Query Parser
const parseQuery = (queryObj) => {
    const reserved = ['page', 'limit', 'sort', 'fields', 'trash', 'permanent'];
    let queryStr = JSON.stringify(queryObj);
    // Operator MongoDB ($gt, $lt, dll)
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in|ne|regex)\b/g, match => `$${match}`);
    let parsedQuery = JSON.parse(queryStr);
    
    // Hapus reserved keys agar tidak masuk ke query database
    reserved.forEach(field => delete parsedQuery[field]);
    
    // Handle Regex Options
    Object.keys(parsedQuery).forEach(key => {
        if (parsedQuery[key].$regex) parsedQuery[key].$options = 'i';
    });
    return parsedQuery;
};

// ==========================================
// 1. COLLECTION MANAGEMENT (ISOLATED PER USER)
// ==========================================

// Get Collections
router.get('/collections', async (req, res) => {
    try {
        const metaCol = getCollection(META_COLLECTION_NAME);
        
        // 🔥 PENTING: Ambil metadata milik USER INI SAJA
        const metaId = `master_list_${req.user.id}`;
        const metaDoc = await metaCol.findOne({ _id: metaId });
        
        let collections = metaDoc ? metaDoc.collections : [
            { name: 'users', type: 'system' }, 
            { name: 'logs', type: 'system' }
        ];

        // Hitung dokumen real-time (Hanya milik user ini)
        const enrichedCollections = await Promise.all(collections.map(async (col) => {
            try {
                const actualCol = getCollection(col.name);
                const count = await actualCol.countDocuments({ 
                    _uid: req.user.id, // Filter owner
                    deletedAt: null 
                });
                return { ...col, docsCount: count, size: 'Dynamic' };
            } catch (e) {
                return { ...col, docsCount: 0 };
            }
        }));

        res.json(enrichedCollections);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Create Collection
router.post('/collections', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: "Name required" });

        const cleanName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');
        const metaCol = getCollection(META_COLLECTION_NAME);
        const metaId = `master_list_${req.user.id}`; // ID Unik per User
        
        let metaDoc = await metaCol.findOne({ _id: metaId });
        let currentCols = metaDoc ? metaDoc.collections : [
            { name: 'users', type: 'system' }, 
            { name: 'logs', type: 'system' }
        ];

        if (currentCols.find(c => c.name === cleanName)) {
            return res.status(400).json({ error: `Collection '${cleanName}' already exists.` });
        }

        const newCol = { name: cleanName, type: 'user', createdAt: new Date().toISOString(), docsCount: 0 };
        currentCols.push(newCol);

        await metaCol.updateOne(
            { _id: metaId }, 
            { $set: { collections: currentCols } }, 
            { upsert: true }
        );
        
        // Create physical collection (shared DB, logical separation)
        try { await mongoose.connection.db.createCollection(cleanName); } catch(e){}

        res.json(newCol);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete Collection
router.delete('/collections/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const metaCol = getCollection(META_COLLECTION_NAME);
        const metaId = `master_list_${req.user.id}`;

        let metaDoc = await metaCol.findOne({ _id: metaId });
        if (metaDoc) {
            const newCols = metaDoc.collections.filter(c => c.name !== name);
            await metaCol.updateOne({ _id: metaId }, { $set: { collections: newCols } });
        }
        
        // Hapus SEMUA data user ini di collection tersebut (Hard Delete)
        const col = getCollection(name);
        await col.deleteMany({ _uid: req.user.id });

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 2. DATA CRUD (ISOLATED via _uid)
// ==========================================

// Import Bulk
router.post('/:col/import', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const docs = req.body; 

        if (!Array.isArray(docs)) return res.status(400).json({ error: "Must be array" });

        const docsToInsert = docs.map(d => ({
            ...d,
            _id: d._id || uuidv4(),
            _uid: req.user.id, // 🔥 Force Owner
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        }));

        const result = await col.insertMany(docsToInsert, { ordered: false });
        res.json({ success: true, count: result.insertedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Find All
router.get('/:col', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        let dbQuery = parseQuery(req.query);
        
        // 🔥 FORCE FILTER: Hanya data milik user ini
        dbQuery._uid = req.user.id;

        // Trash Logic
        if (req.query.trash === 'true') {
            dbQuery.deletedAt = { $ne: null };
        } else {
            dbQuery.deletedAt = null; 
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100;
        const skip = (page - 1) * limit;
        
        let sort = { createdAt: -1 }; 
        if (req.query.sort) {
            const field = req.query.sort.replace('-', '');
            const order = req.query.sort.startsWith('-') ? -1 : 1;
            sort = { [field]: order };
        }

        const data = await col.find(dbQuery).sort(sort).skip(skip).limit(limit).toArray();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Find One (Post for predicate)
router.post('/:col/find-one', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const query = { 
            ...req.body, 
            _uid: req.user.id, // Isolasi
            deletedAt: null 
        };
        const doc = await col.findOne(query);
        res.json(doc || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Find By ID
router.get('/:col/:id', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const doc = await col.findOne({ _id: req.params.id, _uid: req.user.id });
        if (!doc) return res.status(404).json({ error: "Not found" });
        res.json(doc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Insert
router.post('/:col', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const doc = {
            _id: req.body._id || uuidv4(),
            ...req.body,
            _uid: req.user.id, // 🔥 Owner Tag
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null
        };
        await col.insertOne(doc);
        res.status(201).json(doc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update
router.put('/:col/:id', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const updates = req.body;
        delete updates._id; 
        delete updates._uid; // Prevent owner change
        updates.updatedAt = new Date().toISOString();

        const result = await col.findOneAndUpdate(
            { _id: req.params.id, _uid: req.user.id }, 
            { $set: updates },
            { returnDocument: 'after' }
        );
        if (!result) return res.status(404).json({ error: "Not found" });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete (Soft or Permanent)
router.delete('/:col/:id', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const query = { _id: req.params.id, _uid: req.user.id };

        if (req.query.permanent === 'true') {
            const result = await col.deleteOne(query);
            if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
        } else {
            const result = await col.updateOne(query, { $set: { deletedAt: new Date().toISOString() } });
            if (result.matchedCount === 0) return res.status(404).json({ error: "Not found" });
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- TRASH BIN ROUTES ---

router.get('/:col/trash', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const data = await col.find({ 
            _uid: req.user.id, 
            deletedAt: { $ne: null } 
        }).sort({ deletedAt: -1 }).limit(50).toArray();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/:col/restore/:id', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        await col.updateOne(
            { _id: req.params.id, _uid: req.user.id }, 
            { $set: { deletedAt: null } }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/:col/empty-trash', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const result = await col.deleteMany({ 
            _uid: req.user.id, 
            deletedAt: { $ne: null } 
        });
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;