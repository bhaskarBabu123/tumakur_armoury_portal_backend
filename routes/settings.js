const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { auth, adminOnly } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/settings/system
// @desc    Get system settings
// @access  Private (Admin only)
router.get('/system', auth, adminOnly, async (req, res) => {
  try {
    // For now, return default settings
    // In a real application, you might store these in a separate Settings collection
    const settings = {
      autoLogoutTime: 30,
      enableNotifications: true,
      enableAuditLog: true,
      maxLoginAttempts: 3,
      sessionTimeout: 60,
      minimumPasswordLength: 6,
      requireFingerprint: true,
      backupFrequency: 'daily',
      dataRetentionPeriod: 365
    };

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching system settings'
    });
  }
});

// @route   PUT /api/settings/system
// @desc    Update system settings
// @access  Private (Admin only)
router.put('/system', [
  auth,
  adminOnly,
  body('autoLogoutTime').optional().isInt({ min: 5, max: 120 }),
  body('sessionTimeout').optional().isInt({ min: 15, max: 240 }),
  body('maxLoginAttempts').optional().isInt({ min: 3, max: 10 }),
  body('enableNotifications').optional().isBoolean(),
  body('enableAuditLog').optional().isBoolean()
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

    // In a real application, you would save these to a Settings collection
    // For now, we'll just return success
    const updatedSettings = req.body;

    res.json({
      success: true,
      message: 'System settings updated successfully',
      data: updatedSettings
    });
  } catch (error) {
    console.error('Update system settings error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating system settings'
    });
  }
});

// @route   GET /api/settings/users
// @desc    Get all users
// @access  Private (Admin only)
router.get('/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: users
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users'
    });
  }
});

// @route   POST /api/settings/users
// @desc    Create new user
// @access  Private (Admin only)
router.post('/users', [
  auth,
  adminOnly,
  body('name').isLength({ min: 2, max: 100 }).trim(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
  body('role').isIn(['admin', 'operator'])
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

    const { name, email, password, role } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    const user = new User({
      name,
      email,
      password,
      role
    });

    await user.save();

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: user
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating user'
    });
  }
});

// @route   PUT /api/settings/users/:id
// @desc    Update user
// @access  Private (Admin only)
router.put('/users/:id', [
  auth,
  adminOnly,
  body('name').optional().isLength({ min: 2, max: 100 }).trim(),
  body('email').optional().isEmail().normalizeEmail(),
  body('role').optional().isIn(['admin', 'operator']),
  body('isActive').optional().isBoolean()
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

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent admin from deactivating themselves
    if (req.params.id === req.user.id && req.body.isActive === false) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    Object.assign(user, req.body);
    await user.save();

    res.json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Update user error:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Email already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error while updating user'
    });
  }
});

// @route   DELETE /api/settings/users/:id
// @desc    Delete user
// @access  Private (Admin only)
router.delete('/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Prevent admin from deleting themselves
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting user'
    });
  }
});

// @route   GET /api/settings/backup
// @desc    Get backup information
// @access  Private (Admin only)
router.get('/backup', auth, adminOnly, async (req, res) => {
  try {
    // In a real application, you would implement actual backup functionality
    const backupInfo = {
      lastBackup: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
      backupSize: '25.6 MB',
      status: 'completed',
      nextScheduledBackup: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
      backupLocation: '/backups/ksrp_armoury',
      retentionPeriod: '30 days'
    };

    res.json({
      success: true,
      data: backupInfo
    });
  } catch (error) {
    console.error('Get backup info error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching backup information'
    });
  }
});

// @route   POST /api/settings/backup
// @desc    Create manual backup
// @access  Private (Admin only)
router.post('/backup', auth, adminOnly, async (req, res) => {
  try {
    // In a real application, you would implement actual backup creation
    // This is a placeholder response
    res.json({
      success: true,
      message: 'Backup initiated successfully',
      data: {
        backupId: 'backup_' + Date.now(),
        status: 'in_progress',
        startTime: new Date()
      }
    });
  } catch (error) {
    console.error('Create backup error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating backup'
    });
  }
});

module.exports = router;