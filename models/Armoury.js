const mongoose = require('mongoose');

const armourySchema = new mongoose.Schema({
  registerNumber: {
    type: String,
    required: [true, 'Register number is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  buttNumber: {
    type: String,
    required: [true, 'Butt number is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  barcode: {
    type: String,
    trim: true,
    uppercase: true,
    sparse: true
  },
  type: {
    type: String,
    required: [true, 'Weapon type is required'],
    enum: [
      'AK-47 Rifle', 'INSAS Rifle', 'SLR Rifle', '.303 Rifle', 'Carbine',
      '9mm Pistol', '.32 Pistol', '.38 Revolver', 'SMG', 'LMG', 'Shotgun',
      'Tear Gas Gun', 'Grenade Launcher', 'Sniper Rifle', 'Machine Gun'
    ]
  },
  category: {
    type: String,
    enum: ['Rifle', 'Pistol', 'Revolver', 'SMG', 'LMG', 'Shotgun', 'Special']
  },
  manufacturer: { type: String, trim: true },
  manufacturingYear: { type: Number, min: 1900 },
  caliber: { type: String, trim: true },
  serialNumber: { type: String, trim: true, uppercase: true },
  storageLocation: { type: String, trim: true },
  condition: {
    type: String,
    enum: ['excellent', 'good', 'fair', 'needs_repair', 'damaged', 'unserviceable'],
    default: 'good'
  },
  status: {
    type: String,
    enum: ['available', 'issued', 'maintenance', 'decommissioned', 'lost', 'damaged'],
    default: 'available'
  },
  currentHolder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Officer'
  },
  remarks: [{
    text: String,
    date: { type: Date, default: Date.now },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

// Pre-save middleware to automate categorization
armourySchema.pre('save', function(next) {
  if (this.isModified('type')) {
    if (this.type.includes('Rifle')) this.category = 'Rifle';
    else if (this.type.includes('Pistol')) this.category = 'Pistol';
    else if (this.type.includes('Revolver')) this.category = 'Revolver';
    else if (this.type.includes('SMG')) this.category = 'SMG';
    else if (this.type.includes('LMG')) this.category = 'LMG';
    else if (this.type.includes('Shotgun')) this.category = 'Shotgun';
    else this.category = 'Special';
  }
  next();
});

module.exports = mongoose.model('Armoury', armourySchema);