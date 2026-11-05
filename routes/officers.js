const express = require('express');
const { body, validationResult } = require('express-validator');
const Officer = require('../models/Officer');
const { auth, adminOnly } = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/upload');

const router = express.Router();

// @route   GET /api/officers
// @desc    Get all officers
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { status, rank, search, page = 1, limit = 50 } = req.query;
    
    let query = {};
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by rank
    if (rank) {
      query.rank = rank;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { metalNo: { $regex: search, $options: 'i' } },
        { kgidNo: { $regex: search, $options: 'i' } }
      ];
    }
    
    const officers = await Officer.find(query)
      .populate('createdBy', 'name')
      .populate('lastUpdatedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Officer.countDocuments(query);
    
    res.json({
      success: true,
      data: officers,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get officers error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching officers'
    });
  }
});

// @route   GET /api/officers/:id
// @desc    Get officer by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const officer = await Officer.findById(req.params.id)
      .populate('createdBy', 'name')
      .populate('lastUpdatedBy', 'name');
    
    if (!officer) {
      return res.status(404).json({
        success: false,
        message: 'Officer not found'
      });
    }
    
    res.json({
      success: true,
      data: officer
    });
  } catch (error) {
    console.error('Get officer error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching officer'
    });
  }
});

// @route   POST /api/officers
// @desc    Create new officer
// @access  Private (Admin only)
router.post('/', [
  auth,
  adminOnly,
  upload.single('profilePicture'),
  body('name').isLength({ min: 2, max: 100 }).trim(),
  body('rank').isIn([
    'Constable', 'Head Constable', 'Assistant Sub Inspector',
    'Sub Inspector', 'Inspector', 'Deputy Superintendent',
    'Superintendent', 'Additional Superintendent',
    'Deputy Inspector General', 'Inspector General',
    'Additional Director General', 'Director General'
  ]),
  body('metalNo').isLength({ min: 1, max: 20 }).trim(),
  body('phonenumber').matches(/^[6-9]\d{9}$/)
], handleMulterError, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const {
      name, rank, metalNo, kgidNo, phonenumber,
      company, unit, designation, joiningDate,
      fingerprintData, fingerprintQuality, remarks
    } = req.body;

    // Check for duplicate metal number
    const existingOfficer = await Officer.findOne({ metalNo: metalNo.toUpperCase() });
    if (existingOfficer) {
      return res.status(400).json({
        success: false,
        message: 'Officer with this metal number already exists'
      });
    }

    // Check for duplicate KGID if provided
    if (kgidNo) {
      const existingKGID = await Officer.findOne({ kgidNo: kgidNo.toUpperCase() });
      if (existingKGID) {
        return res.status(400).json({
          success: false,
          message: 'Officer with this KGID already exists'
        });
      }
    }

    const officerData = {
      name,
      rank,
      metalNo: metalNo.toUpperCase(),
      kgidNo: kgidNo ? kgidNo.toUpperCase() : undefined,
      phonenumber,
      company,
      unit,
      designation,
      joiningDate: joiningDate ? new Date(joiningDate) : undefined,
      fingerprintData,
      fingerprintQuality: fingerprintQuality ? parseInt(fingerprintQuality) : undefined,
      remarks,
      createdBy: req.user.id
    };

    // Add profile picture if uploaded
    if (req.file) {
      officerData.profilePicture = req.file.filename;
    }

    const officer = new Officer(officerData);
    await officer.save();

    // Populate references before sending response
    await officer.populate('createdBy', 'name');

    res.status(201).json({
      success: true,
      message: 'Officer created successfully',
      data: officer
    });
  } catch (error) {
    console.error('Create officer error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `Officer with this ${field} already exists`
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while creating officer'
    });
  }
});

// @route   PUT /api/officers/:id
// @desc    Update officer
// @access  Private (Admin only)
router.put('/:id', [
  auth,
  adminOnly,
  upload.single('profilePicture'),
  body('name').optional().isLength({ min: 2, max: 100 }).trim(),
  body('rank').optional().isIn([
    'Constable', 'Head Constable', 'Assistant Sub Inspector',
    'Sub Inspector', 'Inspector', 'Deputy Superintendent',
    'Superintendent', 'Additional Superintendent',
    'Deputy Inspector General', 'Inspector General',
    'Additional Director General', 'Director General'
  ]),
  body('phonenumber').optional().matches(/^[6-9]\d{9}$/)
], handleMulterError, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const officer = await Officer.findById(req.params.id);
    if (!officer) {
      return res.status(404).json({
        success: false,
        message: 'Officer not found'
      });
    }

    const updateData = { ...req.body };
    updateData.lastUpdatedBy = req.user.id;

    // Handle profile picture update
    if (req.file) {
      updateData.profilePicture = req.file.filename;
    }

    // Convert to uppercase for specific fields
    if (updateData.metalNo) updateData.metalNo = updateData.metalNo.toUpperCase();
    if (updateData.kgidNo) updateData.kgidNo = updateData.kgidNo.toUpperCase();

    Object.assign(officer, updateData);
    await officer.save();

    await officer.populate('createdBy', 'name');
    await officer.populate('lastUpdatedBy', 'name');

    res.json({
      success: true,
      message: 'Officer updated successfully',
      data: officer
    });
  } catch (error) {
    console.error('Update officer error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `Officer with this ${field} already exists`
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while updating officer'
    });
  }
});

// @route   DELETE /api/officers/:id
// @desc    Delete officer
// @access  Private (Admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const officer = await Officer.findById(req.params.id);
    if (!officer) {
      return res.status(404).json({
        success: false,
        message: 'Officer not found'
      });
    }

    await Officer.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Officer deleted successfully'
    });
  } catch (error) {
    console.error('Delete officer error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting officer'
    });
  }
});

// @route   GET /api/officers/search/kgid/:kgid
// @desc    Find officer by KGID
// @access  Private
router.get('/search/kgid/:kgid', auth, async (req, res) => {
  try {
    const officer = await Officer.findOne({ 
      kgidNo: req.params.kgid.toUpperCase(),
      status: 'active'
    });
    
    if (!officer) {
      return res.status(404).json({
        success: false,
        message: 'Officer not found with this KGID'
      });
    }
    
    res.json({
      success: true,
      data: officer
    });
  } catch (error) {
    console.error('Search officer by KGID error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while searching officer'
    });
  }
});

// @route   GET /api/officers/stats
// @desc    Get officer statistics
// @access  Private
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const stats = await Officer.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          inactive: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
          suspended: { $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] } }
        }
      }
    ]);

    const rankStats = await Officer.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: '$rank', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: stats[0] || { total: 0, active: 0, inactive: 0, suspended: 0 },
        byRank: rankStats
      }
    });
  } catch (error) {
    console.error('Get officer stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching officer statistics'
    });
  }
});

module.exports = router;