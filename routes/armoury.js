const express = require('express');
const { body, validationResult } = require('express-validator');
const Armoury = require('../models/Armoury');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/armoury
// @desc    Get all weapons
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { status, type, condition, search, page = 1, limit = 50 } = req.query;
    
    let query = {};
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by type
    if (type) {
      query.type = type;
    }
    
    // Filter by condition
    if (condition) {
      query.condition = condition;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { registerNumber: { $regex: search, $options: 'i' } },
        { buttNumber: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } },
        { type: { $regex: search, $options: 'i' } }
      ];
    }
    
    const weapons = await Armoury.find(query)
      .populate('currentHolder', 'name rank metalNo')
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Armoury.countDocuments(query);
    
    res.json({
      success: true,
      data: weapons,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get weapons error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching weapons'
    });
  }
});

// @route   GET /api/armoury/:id
// @desc    Get weapon by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const weapon = await Armoury.findById(req.params.id)
      .populate('currentHolder', 'name rank metalNo kgidNo')
      .populate('issueHistory.officer', 'name rank metalNo')
      .populate('createdBy', 'name')
      .populate('lastUpdatedBy', 'name');
    
    if (!weapon) {
      return res.status(404).json({
        success: false,
        message: 'Weapon not found'
      });
    }
    
    res.json({
      success: true,
      data: weapon
    });
  } catch (error) {
    console.error('Get weapon error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching weapon'
    });
  }
});

// @route   POST /api/armoury
// @desc    Add new weapon
// @access  Private (Admin only)
router.post('/', [
  auth,
  adminOnly,
  body('registerNumber').isLength({ min: 1, max: 50 }).trim(),
  body('buttNumber').isLength({ min: 1, max: 50 }).trim(),
  body('type').isIn([
    'AK-47 Rifle', 'INSAS Rifle', 'SLR Rifle', '.303 Rifle',
    'Carbine', '9mm Pistol', '.32 Pistol', '.38 Revolver',
    'SMG', 'LMG', 'Shotgun', 'Tear Gas Gun', 'Grenade Launcher',
    'Sniper Rifle', 'Machine Gun'
  ])
], async (req, res) => {
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
      registerNumber, buttNumber, barcode, type, manufacturer,
      manufacturingYear, caliber, serialNumber, companyName,
      storageRackNo, storageLocation, receivedByUnit, receivedDate,
      condition, remarks
    } = req.body;

    // Check for duplicate register number
    const existingRegister = await Armoury.findOne({ 
      registerNumber: registerNumber.toUpperCase() 
    });
    if (existingRegister) {
      return res.status(400).json({
        success: false,
        message: 'Weapon with this register number already exists'
      });
    }

    // Check for duplicate butt number
    const existingButt = await Armoury.findOne({ 
      buttNumber: buttNumber.toUpperCase() 
    });
    if (existingButt) {
      return res.status(400).json({
        success: false,
        message: 'Weapon with this butt number already exists'
      });
    }

    // Check for duplicate barcode if provided
    if (barcode) {
      const existingBarcode = await Armoury.findOne({ 
        barcode: barcode.toUpperCase() 
      });
      if (existingBarcode) {
        return res.status(400).json({
          success: false,
          message: 'Weapon with this barcode already exists'
        });
      }
    }

    const weaponData = {
      registerNumber: registerNumber.toUpperCase(),
      buttNumber: buttNumber.toUpperCase(),
      barcode: barcode ? barcode.toUpperCase() : undefined,
      type,
      manufacturer,
      manufacturingYear: manufacturingYear ? parseInt(manufacturingYear) : undefined,
      caliber,
      serialNumber: serialNumber ? serialNumber.toUpperCase() : undefined,
      companyName,
      storageRackNo: storageRackNo ? storageRackNo.toUpperCase() : undefined,
      storageLocation,
      receivedByUnit,
      receivedDate: receivedDate ? new Date(receivedDate) : undefined,
      condition: condition || 'good',
      createdBy: req.user.id
    };

    // Add remarks if provided
    if (remarks) {
      weaponData.remarks = [{
        text: remarks,
        addedBy: req.user.id
      }];
    }

    const weapon = new Armoury(weaponData);
    await weapon.save();

    await weapon.populate('createdBy', 'name');

    res.status(201).json({
      success: true,
      message: 'Weapon added successfully',
      data: weapon
    });
  } catch (error) {
    console.error('Create weapon error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `Weapon with this ${field} already exists`
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while adding weapon'
    });
  }
});

// @route   PUT /api/armoury/:id
// @desc    Update weapon
// @access  Private (Admin only)
router.put('/:id', [
  auth,
  adminOnly,
  body('registerNumber').optional().isLength({ min: 1, max: 50 }).trim(),
  body('buttNumber').optional().isLength({ min: 1, max: 50 }).trim(),
  body('type').optional().isIn([
    'AK-47 Rifle', 'INSAS Rifle', 'SLR Rifle', '.303 Rifle',
    'Carbine', '9mm Pistol', '.32 Pistol', '.38 Revolver',
    'SMG', 'LMG', 'Shotgun', 'Tear Gas Gun', 'Grenade Launcher',
    'Sniper Rifle', 'Machine Gun'
  ])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const weapon = await Armoury.findById(req.params.id);
    if (!weapon) {
      return res.status(404).json({
        success: false,
        message: 'Weapon not found'
      });
    }

    const updateData = { ...req.body };
    updateData.lastUpdatedBy = req.user.id;

    // Convert to uppercase for specific fields
    if (updateData.registerNumber) updateData.registerNumber = updateData.registerNumber.toUpperCase();
    if (updateData.buttNumber) updateData.buttNumber = updateData.buttNumber.toUpperCase();
    if (updateData.barcode) updateData.barcode = updateData.barcode.toUpperCase();
    if (updateData.serialNumber) updateData.serialNumber = updateData.serialNumber.toUpperCase();
    if (updateData.storageRackNo) updateData.storageRackNo = updateData.storageRackNo.toUpperCase();

    Object.assign(weapon, updateData);
    await weapon.save();

    await weapon.populate('currentHolder', 'name rank metalNo');
    await weapon.populate('createdBy', 'name');
    await weapon.populate('lastUpdatedBy', 'name');

    res.json({
      success: true,
      message: 'Weapon updated successfully',
      data: weapon
    });
  } catch (error) {
    console.error('Update weapon error:', error);
    
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `Weapon with this ${field} already exists`
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while updating weapon'
    });
  }
});

// @route   DELETE /api/armoury/:id
// @desc    Delete weapon
// @access  Private (Admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const weapon = await Armoury.findById(req.params.id);
    if (!weapon) {
      return res.status(404).json({
        success: false,
        message: 'Weapon not found'
      });
    }

    // Check if weapon is currently issued
    if (weapon.status === 'issued') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete weapon that is currently issued'
      });
    }

    await Armoury.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Weapon deleted successfully'
    });
  } catch (error) {
    console.error('Delete weapon error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting weapon'
    });
  }
});

// @route   GET /api/armoury/search/barcode/:barcode
// @desc    Find weapon by barcode
// @access  Private
router.get('/search/barcode/:barcode', auth, async (req, res) => {
  try {
    const weapon = await Armoury.findOne({ 
      barcode: req.params.barcode.toUpperCase(),
      status: 'available'
    });
    
    if (!weapon) {
      return res.status(404).json({
        success: false,
        message: 'Weapon not found with this barcode or not available'
      });
    }
    
    res.json({
      success: true,
      data: weapon
    });
  } catch (error) {
    console.error('Search weapon by barcode error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while searching weapon'
    });
  }
});

// @route   GET /api/armoury/stats
// @desc    Get weapon statistics
// @access  Private
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const stats = await Armoury.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          available: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
          issued: { $sum: { $cond: [{ $eq: ['$status', 'issued'] }, 1, 0] } },
          maintenance: { $sum: { $cond: [{ $eq: ['$status', 'maintenance'] }, 1, 0] } },
          decommissioned: { $sum: { $cond: [{ $eq: ['$status', 'decommissioned'] }, 1, 0] } }
        }
      }
    ]);

    const typeStats = await Armoury.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const conditionStats = await Armoury.aggregate([
      { $group: { _id: '$condition', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      success: true,
      data: {
        overview: stats[0] || { total: 0, available: 0, issued: 0, maintenance: 0, decommissioned: 0 },
        byType: typeStats,
        byCondition: conditionStats
      }
    });
  } catch (error) {
    console.error('Get weapon stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching weapon statistics'
    });
  }
});

module.exports = router;