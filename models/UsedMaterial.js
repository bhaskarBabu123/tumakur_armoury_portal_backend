const mongoose = require('mongoose');

const usedMaterialSchema = new mongoose.Schema({
  officerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Officer', required: true, index: true },
  returnTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true, index: true },
  sourceIssueTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true, index: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  itemType: { type: String, enum: ['ammunition', 'munition'], required: true, index: true },
  itemName: { type: String, required: true },
  consumedCount: { type: Number, default: 0, min: 0 },
  emptyCasesReceived: { type: Number, default: 0, min: 0 },
  missingCasesCount: { type: Number, default: 0, min: 0 },
  remarks: { type: String, default: '' },
  documents: [{ fileName: String, filePath: String, fileType: String }],
  recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

usedMaterialSchema.index({ createdAt: -1 });
module.exports = mongoose.model('UsedMaterial', usedMaterialSchema);
