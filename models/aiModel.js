const mongoose = require('mongoose');

const AiModelSchema = new mongoose.Schema({
  userId: { type: String, required: true }, 
  
  modelName: { type: String, required: true },
  version: { type: String },
  context: { type: Number },
  description: { type: String },
  
  // 🔥 PERBAIKAN: API Key disimpan sebagai String (Plain Text untuk simulasi)
  // TIDAK AMAN DI PRODUCTION! Kita hanya ingin mengambil nilainya.
  apiKeyHash: { type: String, required: true }, 
  
  isPublic: { type: Boolean, default: false }, 
  
  createdAt: { type: Date, default: Date.now }
});

// Hapus pre-save hook bcrypt agar kita bisa menyimpan/mengambil key dalam plain text.
// Model ini harus di-redeploy.

module.exports = mongoose.model('AiModel', AiModelSchema);