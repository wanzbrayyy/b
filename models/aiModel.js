const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AiModelSchema = new mongoose.Schema({
  // 🔥 PERBAIKAN: Ganti ke String, Hapus ref: 'User'
  userId: { type: String, required: true }, 
  
  // Data Model
  modelName: { type: String, required: true },
  version: { type: String },
  context: { type: Number },
  description: { type: String },
  
  // API Key (Dienkripsi)
  apiKeyHash: { type: String, required: true },
  
  // Akses
  isPublic: { type: Boolean, default: false }, 
  
  createdAt: { type: Date, default: Date.now }
});

// Middleware sebelum simpan: Enkripsi API Key
AiModelSchema.pre('save', async function(next) {
    if (!this.isModified('apiKeyHash')) {
        return next();
    }
    const salt = await bcrypt.genSalt(10);
    this.apiKeyHash = await bcrypt.hash(this.apiKeyHash, salt);
    next();
});

// Method untuk membandingkan API Key saat runtime
AiModelSchema.methods.compareApiKey = async function(candidateApiKey) {
    return await bcrypt.compare(candidateApiKey, this.apiKeyHash);
};

module.exports = mongoose.model('AiModel', AiModelSchema);