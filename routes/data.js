const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const auth = require('../middleware/authMiddleware');
const logger = require('../middleware/logger');
const META_COLLECTION_NAME = '_meta_collections_list';
const getCollection = (colName) => mongoose.connection.db.collection(colName);
const parseQuery = (queryObj) => {
    const reserved = ['page', 'limit', 'sort', 'fields', 'trash', 'permanent'];
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in|ne|regex)\b/g, match => `$${match}`);
    
    let parsedQuery = JSON.parse(queryStr);
    
    // Hapus reserved keys
    reserved.forEach(field => delete parsedQuery[field]);

    // Handle Search "Like" / Regex (contoh: ?name[regex]=john)
    // Otomatis case insensitive
    Object.keys(parsedQuery).forEach(key => {
        if (parsedQuery[key].$regex) {
            parsedQuery[key].$options = 'i';
        }
    });

    return parsedQuery;
};

// --- MIDDLEWARES ---
router.use(auth);   // Wajib Login
router.use(logger); // Catat Log Aktivitas

// ==========================================
// 1. COLLECTION MANAGEMENT
// ==========================================

// GET ALL COLLECTIONS (With Real Counts)
router.get('/collections', async (req, res) => {
    try {
        const metaCol = getCollection(META_COLLECTION_NAME);
        
        // Ambil daftar collection dari metadata
        const metaDoc = await metaCol.findOne({ _id: 'master_list' });
        
        // Default system collections
        let collections = metaDoc ? metaDoc.collections : [
            { name: 'users', type: 'system' }, 
            { name: 'logs', type: 'system' }
        ];

        // 🔥 REAL-TIME COUNT: Hitung jumlah dokumen asli di setiap collection
        const enrichedCollections = await Promise.all(collections.map(async (col) => {
            try {
                const actualCol = getCollection(col.name);
                // Hitung dokumen aktif (yang tidak di soft-delete)
                const count = await actualCol.countDocuments({ deletedAt: null });
                return { 
                    ...col, 
                    docsCount: count,
                    size: 'Dynamic' // MongoDB size butuh command stats yang berat, kita skip
                };
            } catch (e) {
                return { ...col, docsCount: 0 };
            }
        }));

        res.json(enrichedCollections);
    } catch (err) {
        console.error("Get Collections Error:", err);
        res.status(500).json({ error: err.message });
    }
});

// CREATE NEW COLLECTION
router.post('/collections', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: "Collection name required" });

        const cleanName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_'); // Sanitize
        const metaCol = getCollection(META_COLLECTION_NAME);
        
        // Update Metadata
        let metaDoc = await metaCol.findOne({ _id: 'master_list' });
        let currentCols = metaDoc ? metaDoc.collections : [
            { name: 'users', type: 'system' }, 
            { name: 'logs', type: 'system' }
        ];

        if (currentCols.find(c => c.name === cleanName)) {
            return res.status(400).json({ error: `Collection '${cleanName}' already exists.` });
        }

        const newCol = { 
            name: cleanName, 
            type: 'user', 
            createdAt: new Date().toISOString(),
            docsCount: 0
        };
        currentCols.push(newCol);

        await metaCol.updateOne(
            { _id: 'master_list' }, 
            { $set: { collections: currentCols } }, 
            { upsert: true }
        );

        // Create Physical Collection in MongoDB
        await mongoose.connection.db.createCollection(cleanName);

        res.json(newCol);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE COLLECTION (DROP)
router.delete('/collections/:name', async (req, res) => {
    try {
        const { name } = req.params;
        const metaCol = getCollection(META_COLLECTION_NAME);

        // Update Metadata
        let metaDoc = await metaCol.findOne({ _id: 'master_list' });
        if (metaDoc) {
            const newCols = metaDoc.collections.filter(c => c.name !== name);
            await metaCol.updateOne({ _id: 'master_list' }, { $set: { collections: newCols } });
        }

        // Drop Physical Collection
        try {
            await mongoose.connection.db.dropCollection(name);
        } catch (e) {
            // Ignore if already dropped
        }

        res.json({ success: true, message: `Collection ${name} dropped.` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 2. BULK OPERATIONS (IMPORT / EXPORT)
// ==========================================

// IMPORT JSON (Bulk Insert)
router.post('/:col/import', async (req, res) => {
    try {
        const colName = req.params.col;
        const docs = req.body; // Array of objects

        if (!Array.isArray(docs)) {
            return res.status(400).json({ error: "Payload must be an array of documents" });
        }
        if (docs.length === 0) {
            return res.status(400).json({ error: "Array is empty" });
        }

        const col = getCollection(colName);

        // Prepare docs: Add IDs, timestamps
        const docsToInsert = docs.map(d => ({
            ...d,
            _id: d._id || uuidv4(),
            createdAt: d.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null // Ensure Active
        }));

        // MongoDB InsertMany (Ordered: false agar jika satu gagal, sisa lanjut)
        const result = await col.insertMany(docsToInsert, { ordered: false });

        res.json({ 
            success: true, 
            imported: result.insertedCount,
            message: `Successfully imported ${result.insertedCount} documents.`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// EXPORT COLLECTION (Download JSON)
router.get('/:col/export', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        // Get only active data
        const data = await col.find({ deletedAt: null }).toArray();
        
        // Set Headers for Download
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=${req.params.col}_export.json`);
        
        // Send JSON directly
        res.send(JSON.stringify(data, null, 2));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 3. TRASH BIN (SOFT DELETE MANAGEMENT)
// ==========================================

// GET TRASH (Deleted Items)
router.get('/:col/trash', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const data = await col.find({ deletedAt: { $ne: null } })
            .sort({ deletedAt: -1 })
            .limit(50)
            .toArray();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// RESTORE ITEM
router.post('/:col/restore/:id', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const result = await col.updateOne(
            { _id: req.params.id }, 
            { $set: { deletedAt: null } }
        );
        res.json({ success: true, modified: result.modifiedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// EMPTY TRASH (Hard Delete All Soft Deleted)
router.delete('/:col/empty-trash', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const result = await col.deleteMany({ deletedAt: { $ne: null } });
        res.json({ success: true, deletedCount: result.deletedCount });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ==========================================
// 4. CRUD OPERATIONS (REAL-TIME)
// ==========================================

// FIND ALL (With Advanced Filtering, Sorting, Pagination)
router.get('/:col', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        
        // 1. Build Query
        let dbQuery = parseQuery(req.query);
        
        // Default: Only show active items (Soft Delete check)
        // Jika user kirim ?trash=true, abaikan deletedAt check (handled by separate route usually, but ok here)
        if (req.query.trash !== 'true') {
            dbQuery.deletedAt = null; 
        }

        // 2. Pagination & Sorting
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 100; // Limit default 100 biar gak berat
        const skip = (page - 1) * limit;
        
        // Sort: ?sort=-createdAt (Desc) or ?sort=name (Asc)
        let sort = { createdAt: -1 }; 
        if (req.query.sort) {
            const parts = req.query.sort.split(','); // support multi sort? simple logic first
            const field = req.query.sort.replace('-', '');
            const order = req.query.sort.startsWith('-') ? -1 : 1;
            sort = { [field]: order };
        }

        const data = await col.find(dbQuery)
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .toArray();

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// FIND ONE BY ID
router.get('/:col/:id', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const doc = await col.findOne({ _id: req.params.id });
        if (!doc) return res.status(404).json({ error: "Document not found" });
        res.json(doc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// FIND ONE (By Predicate/Query - POST method for safety)
router.post('/:col/find-one', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const query = req.body; // { email: "..." }
        
        // Ensure not searching deleted
        const finalQuery = { ...query, deletedAt: null };
        
        const doc = await col.findOne(finalQuery);
        // if (!doc) return res.status(404).json({ error: "Not found" }); // Frontend expects null sometimes
        res.json(doc || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// INSERT ONE
router.post('/:col', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        
        // Construct Real Document
        const doc = {
            _id: req.body._id || uuidv4(), // Gunakan ID dari frontend jika ada (untuk konsistensi UI)
            ...req.body,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            deletedAt: null // Active
        };

        // Jika ID belum ada, generate UUID v4
        if (!doc._id) doc._id = uuidv4();

        await col.insertOne(doc);

        // --- WEBHOOK TRIGGER (Simulasi Real-time) ---
        // Jika ada sistem webhook, di sini kita kirim event 'document.created'
        // await sendWebhookEvent('document.created', doc);

        res.status(201).json(doc);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// UPDATE ONE
router.put('/:col/:id', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        
        const updates = req.body;
        delete updates._id; // ID tidak boleh berubah
        delete updates.createdAt; // CreatedAt jangan diubah
        
        updates.updatedAt = new Date().toISOString();

        const result = await col.findOneAndUpdate(
            { _id: req.params.id },
            { $set: updates },
            { returnDocument: 'after' } // Return dokumen yang SUDAH diupdate
        );

        if (!result) return res.status(404).json({ error: "Document not found" });

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE ONE (Soft Delete by Default, Permanent if requested)
router.delete('/:col/:id', async (req, res) => {
    try {
        const col = getCollection(req.params.col);
        const { id } = req.params;

        if (req.query.permanent === 'true') {
            // HARD DELETE
            const result = await col.deleteOne({ _id: id });
            if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });
        } else {
            // SOFT DELETE (Move to Trash)
            const result = await col.updateOne(
                { _id: id }, 
                { $set: { deletedAt: new Date().toISOString() } }
            );
            if (result.matchedCount === 0) return res.status(404).json({ error: "Not found" });
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;