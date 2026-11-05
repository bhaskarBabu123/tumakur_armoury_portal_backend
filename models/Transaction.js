const mongoose = require('mongoose');
const MunitionIssueSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Munition' },
  name: String,
  type: String,
  count: { type: Number, required: true },
  returnedCount: { type: Number, default: 0 },
  consumedCount: { type: Number, default: 0 },
  emptyCasesReturned: { type: Number, default: 0 },
  missingCasesCount: { type: Number, default: 0 },
  sourceIssueTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  nonReturnReason: String,
  dispositionStatus: String,
  emptyCasesReturnedL: { type: Number, default: 0 },
  status: { type: String, default: 'issued' },
  batchNumber: String,
  expiryDate: Date
}, { _id: false }); // We don't need a new ID for this sub-doc

// Define exactly what a Weapon (Armoury) item looks like inside a transaction
const ArmouryIssueSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Armoury' },
  registerNumber: String,
  buttNumber: String,
  type: String,
  status: { type: String, default: 'issued' },
  sourceIssueTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  dispositionStatus: { type: String, enum: ['returned', 'pending_approval'] },
  nonReturnReason: String
}, { _id: false });
const transactionSchema = new mongoose.Schema({
  transactionType: {
    type: String,
    enum: ['issue', 'return'],
    required: [true, 'Transaction type is required']
  },
  transactionNumber: {
    type: String,
    unique: true,
    required: true
  },
  officerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Officer',
    required: [true, 'Officer ID is required']
  },
  issuedItems: {
   armoury: [ArmouryIssueSchema],
    ammunition: [{
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ammunition'
      },
      name: String,
      caliber: String,
      count: {
        type: Number,
        required: true,
        min: 1
      },
      returnedCount: { type: Number, default: 0, min: 0 },
      consumedCount: { type: Number, default: 0, min: 0 },
      emptyCasesReturned: { type: Number, default: 0, min: 0 },
      missingCasesCount: { type: Number, default: 0, min: 0 },
      sourceIssueTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
      lostCount: {
        type: Number,
        default: 0,
        min: 0
      },
      status: {
        type: String,
        enum: ['issued', 'partially_returned', 'fully_returned', 'shortage'],
        default: 'issued'
      },
      issueTimestamp: {
        type: Date,
        default: Date.now
      },
      returnTimestamp: Date,
      batchNumber: String,
      expiryDate: Date,
      remarks: String
    }],
  munition: [MunitionIssueSchema],
  },
  purpose: {
    type: String,
    // required: [true, 'Purpose is required'],
    enum: [
      'Duty Assignment',
      'Training Exercise',
      'Special Operation',
      'Riot Control',
      'VIP Security',
      'Patrol Duty',
      'Investigation',
      'Court Duty',
      'Emergency Response',
      'Maintenance',
      'Other'
    ],
    default:'Duty Assignment'
  },
  location: {
    type: String,
    trim: true
  },
  expectedReturnDate: {
    type: Date
  },
  actualReturnDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['open', 'closed', 'overdue', 'partial'],
    default: 'open'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvalDate: {
    type: Date
  },
  approvalRemarks: {
    type: String
  },
  returnDocuments: [{
    fileName: String,
    filePath: String,
    fileType: String,
    fileSize: Number,
    description: String,
    uploadDate: {
      type: Date,
      default: Date.now
    }
  }],
  returnRemarks: [{
    type: String
  }],
  shortageDetails: [{
    itemType: {
      type: String,
      enum: ['armoury', 'ammunition', 'munition']
    },
    itemId: mongoose.Schema.Types.ObjectId,
    itemName: String,
    expectedQuantity: Number,
    returnedQuantity: Number,
    shortageQuantity: Number,
    reason: String,
    actionTaken: String,
    firNumber: String,
    firDate: Date,
    investigationStatus: {
      type: String,
      enum: ['pending', 'ongoing', 'completed', 'closed']
    }
  }],
  fingerprint: {
    issueFingerprint: String,
    returnFingerprint: String,
    verificationStatus: {
      type: String,
      enum: ['verified', 'failed', 'pending'],
      default: 'pending'
    }
  },
  audit: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    lastModifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastModifiedAt: {
      type: Date
    },
    actions: [{
      action: String,
      performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      details: String,
      ipAddress: String
    }]
  }
}, {
  timestamps: true
});

// Indexes for performance
transactionSchema.index({ transactionNumber: 1 });
transactionSchema.index({ officerId: 1 });
transactionSchema.index({ transactionType: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ expectedReturnDate: 1 });

// Pre-save middleware to generate transaction number
transactionSchema.pre('save', async function(next) {
  if (this.isNew) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    // Count transactions for today
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
    
    const count = await this.constructor.countDocuments({
      createdAt: { $gte: startOfDay, $lt: endOfDay }
    });
    
    const sequence = String(count + 1).padStart(4, '0');
    const prefix = this.transactionType === 'issue' ? 'ISS' : 'RET';
    
    // this.transactionNumber = `${prefix}${year}${month}${day}${sequence}`;
  }
  
  // Update last modified info
  if (this.isModified() && !this.isNew) {
    this.audit.lastModifiedAt = new Date();
  }
  
  next();
});

// Method to add audit action
transactionSchema.methods.addAuditAction = function(action, performedBy, details, ipAddress) {
  this.audit.actions.push({
    action,
    performedBy,
    details,
    ipAddress,
    timestamp: new Date()
  });
};

// Virtual for total items count
transactionSchema.virtual('totalItemsCount').get(function() {
  const armouryCount = this.issuedItems.armoury ? this.issuedItems.armoury.length : 0;
  const ammunitionCount = this.issuedItems.ammunition ? this.issuedItems.ammunition.length : 0;
  const munitionCount = this.issuedItems.munition ? this.issuedItems.munition.length : 0;
  return armouryCount + ammunitionCount + munitionCount;
});

// Virtual for shortage status
transactionSchema.virtual('hasShortage').get(function() {
  return this.shortageDetails && this.shortageDetails.length > 0;
});

module.exports = mongoose.model('Transaction', transactionSchema);