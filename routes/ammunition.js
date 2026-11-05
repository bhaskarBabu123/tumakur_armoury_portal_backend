const express = require('express');
const { body, validationResult } = require('express-validator');
const Ammunition = require('../models/Ammunition');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/ammunition
// @desc    Get all ammunition
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { status, type, caliber, search, page = 1, limit = 50 } = req.query;
    
    let query = {};
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by type
    if (type) {
      query.type = type;
    }
    
    // Filter by caliber
    if (caliber) {
      query.caliber = caliber;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { batchNumber: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } }
      ];
    }
    
    const ammunition = await Ammunition.find(query)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Ammunition.countDocuments(query);
    
    res.json({
      success: true,
      data: ammunition,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get ammunition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching ammunition'
    });
  }
});

// @route   GET /api/ammunition/:id
// @desc    Get ammunition by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const ammunition = await Ammunition.findById(req.params.id)
      .populate('issueHistory.officer', 'name rank metalNo')
      .populate('createdBy', 'name')
      .populate('lastUpdatedBy', 'name');
    
    if (!ammunition) {
      return res.status(404).json({
        success: false,
        message: 'Ammunition not found'
      });
    }
    
    res.json({
      success: true,
      data: ammunition
    });
  } catch (error) {
    console.error('Get ammunition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching ammunition'
    });
  }
});

// @route   POST /api/ammunition
// @desc    Add new ammunition
// @access  Private (Admin only)
// @route   POST /api/ammunition
// @desc    Add new stock or update existing (logging the transaction)
router.post('/', [auth, adminOnly], async (req, res) => {
  try {
    const { name, totalCount, receivedByUnit, receivedDate, remarks, about } = req.body;
    const addedCount = parseInt(totalCount);

    // 1. Try to find existing ammunition by name
    let ammo = await Ammunition.findOne({ name });

    const logEntry = {
      text: `STOCK UPDATE: Added ${addedCount} rounds. Unit: ${receivedByUnit || 'Central'}. Note: ${remarks || 'N/A'}`,
      addedBy: req.user.id,
      date: new Date()
    };

    if (ammo) {
      // 2. UPDATE EXISTING
      ammo.totalCount += addedCount;
      ammo.availableCount += addedCount;
      ammo.receivedByUnit = receivedByUnit; // Update to latest unit
      ammo.receivedDate = receivedDate;
      ammo.remarks.push(logEntry); // Push to the log array
      
      await ammo.save();
      return res.status(200).json({ success: true, message: 'Existing stock updated', data: ammo });
    } else {
      // 3. CREATE NEW
      const newAmmo = new Ammunition({
        ...req.body,
        availableCount: addedCount,
        totalCount: addedCount,
        createdBy: req.user.id,
        remarks: [logEntry]
      });

      await newAmmo.save();
      res.status(201).json({ success: true, message: 'New asset registered', data: newAmmo });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/ammunition/:id
// @desc    Update ammunition
// @access  Private (Admin only)
router.put('/:id', [
  auth,
  adminOnly,
  body('totalCount').optional().isInt({ min: 0 }),
  body('availableCount').optional().isInt({ min: 0 })
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

    const ammunition = await Ammunition.findById(req.params.id);
    if (!ammunition) {
      return res.status(404).json({
        success: false,
        message: 'Ammunition not found'
      });
    }

    const updateData = { ...req.body };
    updateData.lastUpdatedBy = req.user.id;

    // Validate available count doesn't exceed total count
    const newTotalCount = updateData.totalCount || ammunition.totalCount;
    const newAvailableCount = updateData.availableCount || ammunition.availableCount;
    
    if (newAvailableCount > newTotalCount) {
      return res.status(400).json({
        success: false,
        message: 'Available count cannot exceed total count'
      });
    }

    // Convert to uppercase for specific fields
    if (updateData.batchNumber) updateData.batchNumber = updateData.batchNumber.toUpperCase();

    Object.assign(ammunition, updateData);
    await ammunition.save();

    await ammunition.populate('createdBy', 'name');
    await ammunition.populate('lastUpdatedBy', 'name');

    res.json({
      success: true,
      message: 'Ammunition updated successfully',
      data: ammunition
    });
  } catch (error) {
    console.error('Update ammunition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating ammunition'
    });
  }
});

// @route   DELETE /api/ammunition/:id
// @desc    Delete ammunition
// @access  Private (Admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const ammunition = await Ammunition.findById(req.params.id);
    if (!ammunition) {
      return res.status(404).json({
        success: false,
        message: 'Ammunition not found'
      });
    }

    // Check if ammunition has been issued
    if (ammunition.issuedCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete ammunition that has been issued'
      });
    }

    await Ammunition.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Ammunition deleted successfully'
    });
  } catch (error) {
    console.error('Delete ammunition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting ammunition'
    });
  }
});

// @route   GET /api/ammunition/low-stock
// @desc    Get low stock ammunition
// @access  Private
router.get('/alerts/low-stock', auth, async (req, res) => {
  try {
    const lowStockAmmunition = await Ammunition.find({
      $expr: {
        $lte: ['$availableCount', '$minimumStockLevel']
      },
      status: 'active'
    }).sort({ availableCount: 1 });

    res.json({
      success: true,
      data: lowStockAmmunition
    });
  } catch (error) {
    console.error('Get low stock ammunition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching low stock ammunition'
    });
  }
});

// @route   GET /api/ammunition/expiring
// @desc    Get expiring ammunition
// @access  Private
router.get('/alerts/expiring', auth, async (req, res) => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringAmmunition = await Ammunition.find({
      expiryDate: {
        $lte: thirtyDaysFromNow,
        $gte: new Date()
      },
      status: 'active'
    }).sort({ expiryDate: 1 });

    res.json({
      success: true,
      data: expiringAmmunition
    });
  } catch (error) {
    console.error('Get expiring ammunition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching expiring ammunition'
    });
  }
});

// @route   GET /api/ammunition/stats
// @desc    Get ammunition statistics
// @access  Private
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const stats = await Ammunition.aggregate([
      {
        $group: {
          _id: null,
          totalTypes: { $sum: 1 },
          totalRounds: { $sum: '$totalCount' },
          availableRounds: { $sum: '$availableCount' },
          issuedRounds: { $sum: '$issuedCount' },
          totalValue: { $sum: '$totalValue' }
        }
      }
    ]);

    const typeStats = await Ammunition.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 }, totalRounds: { $sum: '$totalCount' } } },
      { $sort: { totalRounds: -1 } }
    ]);

    const caliberStats = await Ammunition.aggregate([
      { $group: { _id: '$caliber', count: { $sum: 1 }, totalRounds: { $sum: '$totalCount' } } },
      { $sort: { totalRounds: -1 } }
    ]);

    const stockStatus = await Ammunition.aggregate([
      {
        $addFields: {
          stockStatus: {
            $cond: {
              if: { $eq: ['$availableCount', 0] },
              then: 'out_of_stock',
              else: {
                $cond: {
                  if: { $lte: ['$availableCount', '$minimumStockLevel'] },
                  then: 'critical',
                  else: {
                    $cond: {
                      if: { $lte: ['$availableCount', '$reorderLevel'] },
                      then: 'low',
                      else: 'adequate'
                    }
                  }
                }
              }
            }
          }
        }
      },
      { $group: { _id: '$stockStatus', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: {
        overview: stats[0] || { totalTypes: 0, totalRounds: 0, availableRounds: 0, issuedRounds: 0, totalValue: 0 },
        byType: typeStats,
        byCaliber: caliberStats,
        stockStatus: stockStatus
      }
    });
  } catch (error) {
    console.error('Get ammunition stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching ammunition statistics'
    });
  }
});

module.exports = router;