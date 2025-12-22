const mongoose = require('mongoose');

const ApiKeySchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  name: { type: String, default: 'Default Key' },
  permissions: { type: [String], default: ['read', 'write'] },
  lastUsed: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ApiKey', ApiKeySchema);