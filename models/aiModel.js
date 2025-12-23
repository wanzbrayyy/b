const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const AiModelSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  modelName: { type: String, required: true },
  version: { type: String },
  context: { type: Number },
  description: { type: String },
  apiKeyHash: { type: String, required: true },
  isPublic: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
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