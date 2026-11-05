const mongoose = require('mongoose');

const munitionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Munition name is required'],
    enum: [
      'Hand Grenades', 'Tear Gas Shells', 'Smoke Grenades', 'Flash Bang Grenades',
      'Stun Grenades', 'Riot Control Gas', 'Pepper Spray Canisters', 'Signal Flares',
      'Illumination Rounds', 'Breaching Charges', 'Training Grenades',
      'Concussion Grenades', 'Incendiary Grenades', 'Explosive Charges', 'Detonators'
    ]
  },
  type: {
    type: String,
    enum: ['Explosive', 'Non-Lethal', 'Signaling', 'Training', 'Special'],
    required: true
  },
  category: {
    type: String,
    enum: ['Grenade', 'Gas', 'Flare', 'Charge', 'Spray', 'Other'],
    required: true
  },
  batchNumber: { type: String, trim: true, uppercase: true },
  expiryDate: { type: Date },
  totalCount: {
    type: Number,
    required: [true, 'Total count is required'],
    min: 0
  },
  availableCount: {
    type: Number,
    required: [true, 'Available count is required'],
    min: 0
  },
  issuedCount: { type: Number, default: 0 },
  returnedCount: { type: Number, default: 0 },
  consumedCount: { type: Number, default: 0, min: 0 },
  emptyCasesCount: { type: Number, default: 0, min: 0 },
  damagedCount: { type: Number, default: 0 },
  unitPrice: { type: Number, min: 0 },
  totalValue: { type: Number, min: 0 },
  dangerClass: {
    type: String,
    enum: ['1.1', '1.2', '1.3', '1.4', '1.5', '1.6'],
    required: function() { return this.type === 'Explosive'; }
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'recalled', 'disposed', 'quarantined'],
    default: 'active'
  },
  minimumStockLevel: { type: Number, default: 10 },
  reorderLevel: { type: Number, default: 25 },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Virtuals for Stock Management
munitionSchema.virtual('stockStatus').get(function() {
  if (this.availableCount <= 0) return 'out_of_stock';
  if (this.availableCount <= this.minimumStockLevel) return 'critical';
  if (this.availableCount <= this.reorderLevel) return 'low';
  return 'adequate';
});

// Auto-calculation and Type Assignment
munitionSchema.pre('save', function(next) {
  if (this.unitPrice && this.totalCount) {
    this.totalValue = this.unitPrice * this.totalCount;
  }

  if (this.isModified('name') && !this.isModified('type')) {
    if (this.name.includes('Grenade') || this.name.includes('Explosive')) this.type = 'Explosive';
    else if (this.name.includes('Gas') || this.name.includes('Spray')) this.type = 'Non-Lethal';
    else if (this.name.includes('Flare')) this.type = 'Signaling';
    else this.type = 'Special';
  }
  next();
});

module.exports = mongoose.model('Munition', munitionSchema);