const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Helper untuk akses dynamic collection secara langsung (Native Driver)
const getCollection = (colName) => mongoose.connection.db.collection(colName);

// Collection khusus untuk menyimpan metadata (daftar nama collection user)
// Ini meniru logika: const META_COLLECTIONS_KEY = '_meta_collections_list';
const META_COLLECTION_NAME = '_meta_collections_list';

// --- Collection Management ---

// 1. Get Collections
router.get('/collections', async (req, res) => {
  try {
    const metaCol = getCollection(META_COLLECTION_NAME);
    // Ambil data metadata
    const metaDoc = await metaCol.findOne({ _id: 'master_list' });
    
    // Default collections (Sesuai kode mock Anda)
    const defaults = [
      { name: 'users', type: 'system' }, 
      { name: 'logs', type: 'system' }
    ];

    // Jika belum ada data di DB, kembalikan default
    if (!metaDoc || !metaDoc.collections || metaDoc.collections.length === 0) {
      return res.json(defaults);
    }

    res.json(metaDoc.collections);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create Collection
router.post('/collections', async (req, res) => {
  try {
    const { name } = req.body;
    const metaCol = getCollection(META_COLLECTION_NAME);
    
    // Ambil list saat ini
    let metaDoc = await metaCol.findOne({ _id: 'master_list' });
    let currentCols = metaDoc ? metaDoc.collections : [
      { name: 'users', type: 'system' }, 
      { name: 'logs', type: 'system' }
    ];

    // Cek duplikasi (Logic mock: if (collections.find...))
    if (currentCols.find(c => c.name === name)) {
      return res.status(400).json({ error: `Collection '${name}' already exists.` });
    }

    // Buat object baru (Sesuai kode mock Anda)
    const newCol = { 
      name, 
      type: 'user', 
      createdAt: new Date().toISOString(),
      docsCount: 0 
    };

    currentCols.push(newCol);

    // Simpan update metadata
    await metaCol.updateOne(
      { _id: 'master_list' },
      { $set: { collections: currentCols } },
      { upsert: true }
    );

    // Buat collection fisik di MongoDB (opsional, tapi bagus utk inisialisasi)
    await mongoose.connection.db.createCollection(name);

    res.json(newCol);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Delete Collection
router.delete('/collections/:name', async (req, res) => {
  try {
    const { name } = req.params;
    const metaCol = getCollection(META_COLLECTION_NAME);

    // Ambil list
    let metaDoc = await metaCol.findOne({ _id: 'master_list' });
    if (!metaDoc) return res.json({ success: true }); // Sudah kosong

    // Filter (Logic mock: collections.filter...)
    const newCols = metaDoc.collections.filter(c => c.name !== name);

    // Update metadata
    await metaCol.updateOne(
      { _id: 'master_list' },
      { $set: { collections: newCols } }
    );

    // Hapus collection fisik dan isinya
    try {
      await mongoose.connection.db.dropCollection(name);
    } catch (e) {
      // Ignore error jika collection fisik memang belum ada
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Document CRUD ---

// 4. Find All (Logic mock: return getStorage(collection))
router.get('/:col', async (req, res) => {
  try {
    const col = getCollection(req.params.col);
    const data = await col.find({}).sort({ createdAt: -1 }).toArray();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Find One (Logic mock: items.find(predicate))
// NOTE: Kita pakai POST untuk kirim query object (misal: { email: "..." })
router.post('/:col/find-one', async (req, res) => {
  try {
    const col = getCollection(req.params.col);
    const query = req.body; // Body berisi object pencarian
    const item = await col.findOne(query);
    res.json(item || null); // Return null jika tidak ketemu (sesuai mock)
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Find By ID
router.get('/:col/:id', async (req, res) => {
  try {
    const col = getCollection(req.params.col);
    const item = await col.findOne({ _id: req.params.id });
    res.json(item || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Insert (Logic mock: generate ID, push array)
router.post('/:col', async (req, res) => {
  try {
    const col = getCollection(req.params.col);
    const data = req.body;

    // Backend menerima data yang SUDAH punya _id dari frontend (agar UI update duluan),
    // atau generate di sini jika belum ada.
    if (!data.createdAt) {
      data.createdAt = new Date().toISOString();
    }
    
    // Mongoose driver allow custom _id string
    await col.insertOne(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Update
router.put('/:col/:id', async (req, res) => {
  try {
    const col = getCollection(req.params.col);
    const updates = req.body;
    
    // Set updatedAt
    updates.updatedAt = new Date().toISOString();

    const result = await col.findOneAndUpdate(
      { _id: req.params.id },
      { $set: updates },
      { returnDocument: 'after' }
    );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Remove
router.delete('/:col/:id', async (req, res) => {
  try {
    const col = getCollection(req.params.col);
    await col.deleteOne({ _id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;