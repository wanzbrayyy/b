const mongoose = require('mongoose');

const FieldSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true, enum: ['string', 'number', 'boolean', 'date', 'object', 'array'] },
  required: { type: Boolean, default: false }
}, { _id: false });

const SchemaSchema = new mongoose.Schema({
  _id: { type: String, required: true }, 
  collectionName: { type: String, required: true },
  userId: { type: String, required: true },
  fields: [FieldSchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Schema', SchemaSchema, 'schemas'); // Nama collection: schemas