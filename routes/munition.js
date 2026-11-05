const express = require('express');
const { body, validationResult } = require('express-validator');
const Munition = require('../models/Munition');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/munition
// @desc    Get all munitions
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    const { status, type, category, search, page = 1, limit = 50 } = req.query;
    
    let query = {};
    
    // Filter by status
    if (status) {
      query.status = status;
    }
    
    // Filter by type
    if (type) {
      query.type = type;
    }
    
    // Filter by category
    if (category) {
      query.category = category;
    }
    
    // Search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { batchNumber: { $regex: search, $options: 'i' } },
        { manufacturer: { $regex: search, $options: 'i' } }
      ];
    }
    
    const munitions = await Munition.find(query)
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    const total = await Munition.countDocuments(query);
    
    res.json({
      success: true,
      data: munitions,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (error) {
    console.error('Get munitions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching munitions'
    });
  }
});

// @route   GET /api/munition/:id
// @desc    Get munition by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const munition = await Munition.findById(req.params.id)
      .populate('issueHistory.officer', 'name rank metalNo')
      .populate('createdBy', 'name')
      .populate('lastUpdatedBy', 'name');
    
    if (!munition) {
      return res.status(404).json({
        success: false,
        message: 'Munition not found'
      });
    }
    
    res.json({
      success: true,
      data: munition
    });
  } catch (error) {
    console.error('Get munition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching munition'
    });
  }
});

// @route   POST /api/munition
// @desc    Add new munition
// @access  Private (Admin only)
// @route   POST /api/munition
// @desc    Add or Update munition (Upsert logic)
// @access  Private (Admin only)
router.post('/', [auth, adminOnly], async (req, res) => {
  try {
    const { name, batchNumber, totalCount, availableCount, remarks } = req.body;
    const formattedBatch = batchNumber.toUpperCase();

    // 1. Check if this exact nomenclature and batch already exist
    let munition = await Munition.findOne({
      name: name,
      batchNumber: formattedBatch
    });

    if (munition) {
      // 2. Logic: INCREMENT EXISTING STOCK
      munition.totalCount += parseInt(totalCount);
      munition.availableCount += parseInt(availableCount);
      munition.lastUpdatedBy = req.user.id;
      
      // Update history
      const logEntry = {
        text: `RESTOCK: Added ${totalCount} units via manual entry.`,
        addedBy: req.user.id,
        createdAt: new Date()
      };
      
      munition.remarks = munition.remarks ? [...munition.remarks, logEntry] : [logEntry];

      await munition.save();

      return res.status(200).json({
        success: true,
        message: 'Existing stockpile updated',
        data: munition,
        isUpdate: true // Flag for the frontend
      });
    }

    // 3. Logic: CREATE NEW IF NO MATCH
    const newMunition = new Munition({
      ...req.body,
      batchNumber: formattedBatch,
      createdBy: req.user.id
    });

    await newMunition.save();
    res.status(201).json({
      success: true,
      data: newMunition,
      isUpdate: false
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @route   PUT /api/munition/:id
// @desc    Update munition
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

    const munition = await Munition.findById(req.params.id);
    if (!munition) {
      return res.status(404).json({
        success: false,
        message: 'Munition not found'
      });
    }

    const updateData = { ...req.body };
    updateData.lastUpdatedBy = req.user.id;

    // Validate available count doesn't exceed total count
    const newTotalCount = updateData.totalCount || munition.totalCount;
    const newAvailableCount = updateData.availableCount || munition.availableCount;
    
    if (newAvailableCount > newTotalCount) {
      return res.status(400).json({
        success: false,
        message: 'Available count cannot exceed total count'
      });
    }

    // Convert to uppercase for specific fields
    if (updateData.batchNumber) updateData.batchNumber = updateData.batchNumber.toUpperCase();

    Object.assign(munition, updateData);
    await munition.save();

    await munition.populate('createdBy', 'name');
    await munition.populate('lastUpdatedBy', 'name');

    res.json({
      success: true,
      message: 'Munition updated successfully',
      data: munition
    });
  } catch (error) {
    console.error('Update munition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating munition'
    });
  }
});

// @route   DELETE /api/munition/:id
// @desc    Delete munition
// @access  Private (Admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const munition = await Munition.findById(req.params.id);
    if (!munition) {
      return res.status(404).json({
        success: false,
        message: 'Munition not found'
      });
    }

    // Check if munition has been issued
    if (munition.issuedCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete munition that has been issued'
      });
    }

    await Munition.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'Munition deleted successfully'
    });
  } catch (error) {
    console.error('Delete munition error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting munition'
    });
  }
});

// @route   GET /api/munition/low-stock
// @desc    Get low stock munitions
// @access  Private
router.get('/alerts/low-stock', auth, async (req, res) => {
  try {
    const lowStockMunitions = await Munition.find({
      $expr: {
        $lte: ['$availableCount', '$minimumStockLevel']
      },
      status: 'active'
    }).sort({ availableCount: 1 });

    res.json({
      success: true,
      data: lowStockMunitions
    });
  } catch (error) {
    console.error('Get low stock munitions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching low stock munitions'
    });
  }
});

// @route   GET /api/munition/expiring
// @desc    Get expiring munitions
// @access  Private
router.get('/alerts/expiring', auth, async (req, res) => {
  try {
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringMunitions = await Munition.find({
      expiryDate: {
        $lte: thirtyDaysFromNow,
        $gte: new Date()
      },
      status: 'active'
    }).sort({ expiryDate: 1 });

    res.json({
      success: true,
      data: expiringMunitions
    });
  } catch (error) {
    console.error('Get expiring munitions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching expiring munitions'
    });
  }
});

// @route   GET /api/munition/stats
// @desc    Get munition statistics
// @access  Private
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const stats = await Munition.aggregate([
      {
        $group: {
          _id: null,
          totalTypes: { $sum: 1 },
          totalUnits: { $sum: '$totalCount' },
          availableUnits: { $sum: '$availableCount' },
          issuedUnits: { $sum: '$issuedCount' },
          totalValue: { $sum: '$totalValue' }
        }
      }
    ]);

    const typeStats = await Munition.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 }, totalUnits: { $sum: '$totalCount' } } },
      { $sort: { totalUnits: -1 } }
    ]);

    const categoryStats = await Munition.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 }, totalUnits: { $sum: '$totalCount' } } },
      { $sort: { totalUnits: -1 } }
    ]);

    const stockStatus = await Munition.aggregate([
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
        overview: stats[0] || { totalTypes: 0, totalUnits: 0, availableUnits: 0, issuedUnits: 0, totalValue: 0 },
        byType: typeStats,
        byCategory: categoryStats,
        stockStatus: stockStatus
      }
    });
  } catch (error) {
    console.error('Get munition stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching munition statistics'
    });
  }
});

module.exports = router;