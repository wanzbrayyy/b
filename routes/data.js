const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const auth = require('../middleware/authMiddleware');

// Helper untuk akses dynamic collection secara langsung
const getCollection = (colName) => mongoose.connection.db.collection(colName);

// @route   GET api/data/collections
// @desc    Get list of all collections
router.get('/collections', auth, async (req, res) => {
  try {
    const collections = await mongoose.connection.db.listCollections().toArray();
    // Format agar sesuai dengan frontend
    const formatted = collections.map(c => ({
        name: c.name,
        type: c.name === 'users' ? 'system' : 'user'
    }));
    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   POST api/data/collections
// @desc    Create new collection
router.post('/collections', auth, async (req, res) => {
  try {
    const { name } = req.body;
    await mongoose.connection.db.createCollection(name);
    res.json({ name, type: 'user' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// @route   DELETE api/data/collections/:name
// @desc    Drop collection
router.delete('/collections/:name', auth, async (req, res) => {
  try {
    await mongoose.connection.db.dropCollection(req.params.name);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- CRUD DOCUMENTS ---

// GET All Docs in Collection
router.get('/:col', auth, async (req, res) => {
  try {
    const col = getCollection(req.params.col);
    const data = await col.find({}).sort({ createdAt: -1 }).toArray();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// INSERT Document
router.post('/:col', auth, async (req, res) => {
  try {
    const col = getCollection(req.params.col);
    const doc = req.body;
    
    // Pastikan ID string kita dipakai (override default ObjectId)
    // MongoDB driver Node.js menerima _id kustom
    await col.insertOne(doc);
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE Document
router.delete('/:col/:id', auth, async (req, res) => {
  try {
    const col = getCollection(req.params.col);
    await col.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;