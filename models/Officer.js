const mongoose = require('mongoose');

const officerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Officer name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  rank: {
    type: String,
    required: [true, 'Rank is required'],
    enum: [
      'Constable',
      'Head Constable', 
      'Assistant Sub Inspector',
      'Sub Inspector',
      'Inspector',
      'Deputy Superintendent',
      'Superintendent',
      'Additional Superintendent',
      'Deputy Inspector General',
      'Inspector General',
      'Additional Director General',
      'Director General'
    ]
  },
  metalNo: {
    type: String,
    required: [true, 'Metal number is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  kgidNo: {
    type: String,
    trim: true,
    uppercase: true,
    sparse: true // Allows multiple null values but unique non-null values
  },
  phonenumber: {
    type: String,
    required: [true, 'Phone number is required'],
    match: [/^[6-9]\d{9}$/, 'Please enter a valid Indian phone number']
  },
  company: {
    type: String,
    trim: true,
    maxlength: [50, 'Company name cannot exceed 50 characters']
  },
  unit: {
    type: String,
    trim: true,
    maxlength: [50, 'Unit name cannot exceed 50 characters']
  },
  designation: {
    type: String,
    trim: true,
    maxlength: [100, 'Designation cannot exceed 100 characters']
  },
  joiningDate: {
    type: Date
  },
  profilePicture: {
    type: String // File path
  },
  // Optional until the fingerprint device is installed and registered.
  fingerprintData: { type: String, default: undefined },
  fingerprintQuality: {
    type: Number,
    min: 0,
    max: 100
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'transferred'],
    default: 'active'
  },
  remarks: {
    type: String,
    maxlength: [500, 'Remarks cannot exceed 500 characters']
  },
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
officerSchema.index({ metalNo: 1 });
officerSchema.index({ kgidNo: 1 });
officerSchema.index({ status: 1 });
officerSchema.index({ rank: 1 });

// Virtual for full identification
officerSchema.virtual('fullId').get(function() {
  return `${this.rank} ${this.name} (${this.metalNo})`;
});

// Pre-save middleware
officerSchema.pre('save', function(next) {
  if (this.isModified('metalNo')) {
    this.metalNo = this.metalNo.toUpperCase();
  }
  if (this.isModified('kgidNo') && this.kgidNo) {
    this.kgidNo = this.kgidNo.toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Officer', officerSchema);