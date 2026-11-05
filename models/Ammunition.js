const mongoose = require('mongoose');

const ammunitionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Ammunition name is required'],
    enum: [
      '7.62mm AK-47 Rounds',
      '5.56mm INSAS Rounds',
      '7.62mm SLR Rounds',
      '.303 Rounds',
      '9mm Pistol Rounds',
      '.32 Pistol Rounds',
      '.38 Revolver Rounds',
      'Shotgun Cartridges',
      'Rubber Bullets',
      'Blank Rounds',
      'Tracer Rounds',
      'Armor Piercing Rounds',
      'Hollow Point Rounds',
      'Training Rounds'
    ]
  },
  type: {
    type: String,
    enum: ['Live', 'Blank', 'Rubber', 'Training', 'Special'],
    // required: true
  },
  caliber: {
    type: String,
    // required: [true, 'Caliber is required'],
    enum: ['7.62mm', '5.56mm', '.303', '9mm', '.32', '.38', '12 Gauge', 'Other']
  },
  batchNumber: {
    type: String,
    trim: true,
    uppercase: true
  },
  manufacturingDate: {
    type: Date
  },
  expiryDate: {
    type: Date
  },
  manufacturer: {
    type: String,
    trim: true
  },
  totalCount: {
    type: Number,
    required: [true, 'Total count is required'],
    min: [0, 'Total count cannot be negative']
  },
  availableCount: {
    type: Number,
    required: [true, 'Available count is required'],
    min: [0, 'Available count cannot be negative']
  },
  issuedCount: {
    type: Number,
    default: 0,
    min: [0, 'Issued count cannot be negative']
  },
  returnedCount: {
    type: Number,
    default: 0,
    min: [0, 'Returned count cannot be negative']
  },
  emptyCasesCount: { type: Number, default: 0, min: 0 },
  // Lifetime quantity consumed; empty cases are tracked separately and never enter usable stock.
  consumedCount: { type: Number, default: 0, min: 0 },
  damagedCount: {
    type: Number,
    default: 0,
    min: [0, 'Damaged count cannot be negative']
  },
  lostCount: {
    type: Number,
    default: 0,
    min: [0, 'Lost count cannot be negative']
  },
  unitPrice: {
    type: Number,
    min: [0, 'Unit price cannot be negative']
  },
  totalValue: {
    type: Number,
    min: [0, 'Total value cannot be negative']
  },
  storageLocation: {
    type: String,
    trim: true
  },
  storageConditions: {
    temperature: String,
    humidity: String,
    specialRequirements: String
  },
  receivedByUnit: {
    type: String,
    trim: true
  },
  receivedDate: {
    type: Date
  },
  receivedFrom: {
    type: String,
    trim: true
  },
  purchaseOrderNumber: {
    type: String,
    trim: true
  },
  invoiceNumber: {
    type: String,
    trim: true
  },
  qualityCheckStatus: {
    type: String,
    enum: ['pending', 'passed', 'failed', 'conditional'],
    default: 'pending'
  },
  qualityCheckDate: {
    type: Date
  },
  qualityCheckRemarks: {
    type: String
  },
  minimumStockLevel: {
    type: Number,
    default: 100,
    min: [0, 'Minimum stock level cannot be negative']
  },
  reorderLevel: {
    type: Number,
    default: 200,
    min: [0, 'Reorder level cannot be negative']
  },
  status: {
    type: String,
    enum: ['active', 'expired', 'recalled', 'disposed'],
    default: 'active'
  },
  about: {
    type: String,
    maxlength: [500, 'About cannot exceed 500 characters']
  },
  remarks: [{
    text: String,
    date: {
      type: Date,
      default: Date.now
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  issueHistory: [{
    officer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Officer'
    },
    quantity: Number,
    issueDate: {
      type: Date,
      default: Date.now
    },
    purpose: String,
    returnedQuantity: {
      type: Number,
      default: 0
    },
    emptyCasesReturned: {
      type: Number,
      default: 0
    },
    returnDate: Date,
    status: {
      type: String,
      enum: ['issued', 'partially_returned', 'fully_returned', 'lost'],
      default: 'issued'
    }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for performance
ammunitionSchema.index({ name: 1 });
ammunitionSchema.index({ type: 1 });
ammunitionSchema.index({ caliber: 1 });
ammunitionSchema.index({ status: 1 });
ammunitionSchema.index({ availableCount: 1 });
ammunitionSchema.index({ expiryDate: 1 });

// Virtual for stock status
ammunitionSchema.virtual('stockStatus').get(function() {
  if (this.availableCount <= 0) return 'out_of_stock';
  if (this.availableCount <= this.minimumStockLevel) return 'critical';
  if (this.availableCount <= this.reorderLevel) return 'low';
  return 'adequate';
});

// Virtual for stock percentage
ammunitionSchema.virtual('stockPercentage').get(function() {
  return this.totalCount > 0 ? Math.round((this.availableCount / this.totalCount) * 100) : 0;
});

// Pre-save middleware for validation
ammunitionSchema.pre('save', function(next) {
  // Ensure available count doesn't exceed total count
  if (this.availableCount > this.totalCount) {
    this.availableCount = this.totalCount;
  }
  
  // Calculate total value
  if (this.unitPrice && this.totalCount) {
    this.totalValue = this.unitPrice * this.totalCount;
  }
  
  // Set type based on name if not provided
  if (this.isModified('name') && !this.isModified('type')) {
    if (this.name.includes('Blank')) this.type = 'Blank';
    else if (this.name.includes('Rubber')) this.type = 'Rubber';
    else if (this.name.includes('Training')) this.type = 'Training';
    else if (this.name.includes('Tracer') || this.name.includes('Armor Piercing')) this.type = 'Special';
    else this.type = 'Live';
  }
  
  next();
});

module.exports = mongoose.model('Ammunition', ammunitionSchema);