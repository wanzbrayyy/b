const mongoose = require('mongoose');

const LoginHistorySchema = new mongoose.Schema({
  ip: String,
  device: String,
  timestamp: { type: Date, default: Date.now }
});

const UserSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: 'user' },
  avatar: { type: String }, 
  twoFactorSecret: { type: String },
  isTwoFactorEnabled: { type: Boolean, default: false },
  ipWhitelist: [String],
  loginHistory: [LoginHistorySchema],
  
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);