const mongoose = require('mongoose');

const ActivityLogSchema = new mongoose.Schema({
  userId: String,
  method: String, 
  path: String, 
  collectionName: String,
  statusCode: Number,
  ip: String,
  duration: Number, 
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ActivityLog', ActivityLogSchema);