const express = require('express');
const Officer = require('../models/Officer');
const Armoury = require('../models/Armoury');
const Ammunition = require('../models/Ammunition');
const Munition = require('../models/Munition');
const Transaction = require('../models/Transaction');
const { auth } = require('../middleware/auth');

const router = express.Router();

// @route   GET /api/dashboard/stats
// @desc    Get dashboard statistics
// @access  Private
router.get('/stats', auth, async (req, res) => {
  try {
    // Get current date for today's stats
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    // Parallel execution of all queries for better performance
    const [
      armouryStats,
      ammunitionStats,
      munitionStats,
      officerStats,
      todayTransactions,
      pendingReturns,
      shortageCount
    ] = await Promise.all([
      // Armoury statistics
      Armoury.aggregate([
        {
          $group: {
            _id: null,
            totalArms: { $sum: 1 },
            availableArms: { $sum: { $cond: [{ $eq: ['$status', 'available'] }, 1, 0] } },
            issuedArms: { $sum: { $cond: [{ $eq: ['$status', 'issued'] }, 1, 0] } },
            maintenanceArms: { $sum: { $cond: [{ $eq: ['$status', 'maintenance'] }, 1, 0] } }
          }
        }
      ]),

      // Ammunition statistics
      Ammunition.aggregate([
        {
          $group: {
            _id: null,
            totalAmmunition: { $sum: '$totalCount' },
            availableAmmunition: { $sum: '$availableCount' },
            issuedAmmunition: { $sum: '$issuedCount' },
            consumedAmmunition: { $sum: '$consumedCount' },
            emptyAmmunitionCases: { $sum: '$emptyCasesCount' },
            totalTypes: { $sum: 1 }
          }
        }
      ]),

      // Munition statistics
      Munition.aggregate([
        {
          $group: {
            _id: null,
            totalMunitions: { $sum: '$totalCount' },
            availableMunitions: { $sum: '$availableCount' },
            issuedMunitions: { $sum: '$issuedCount' },
            consumedMunitions: { $sum: '$consumedCount' },
            emptyMunitionCases: { $sum: '$emptyCasesCount' },
            totalTypes: { $sum: 1 }
          }
        }
      ]),

      // Officer statistics
      Officer.aggregate([
        {
          $group: {
            _id: null,
            totalOfficers: { $sum: 1 },
            activeOfficers: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
            inactiveOfficers: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } }
          }
        }
      ]),

      // Today's transactions
      Transaction.aggregate([
        {
          $match: {
            createdAt: { $gte: startOfDay, $lt: endOfDay }
          }
        },
        {
          $group: {
            _id: '$transactionType',
            count: { $sum: 1 }
          }
        }
      ]),

      // Pending returns (open transactions)
      Transaction.countDocuments({ status: { $in: ['open', 'partial', 'overdue'] } }),

      // Shortage count (transactions with shortage details)
      Transaction.countDocuments({ 
        shortageDetails: { $exists: true, $ne: [] } 
      })
    ]);

    // Process today's transactions
    const todayIssues = todayTransactions.find(t => t._id === 'issue')?.count || 0;
    const todayReturns = todayTransactions.find(t => t._id === 'return')?.count || 0;

    // Compile final statistics
    const stats = {
      // Arms
      totalArms: armouryStats[0]?.totalArms || 0,
      availableArms: armouryStats[0]?.availableArms || 0,
      issuedArms: armouryStats[0]?.issuedArms || 0,
      maintenanceArms: armouryStats[0]?.maintenanceArms || 0,

      // Ammunition
      totalAmmunition: ammunitionStats[0]?.totalAmmunition || 0,
      availableAmmunition: ammunitionStats[0]?.availableAmmunition || 0,
      issuedAmmunition: ammunitionStats[0]?.issuedAmmunition || 0,
      consumedAmmunition: ammunitionStats[0]?.consumedAmmunition || 0,
      emptyAmmunitionCases: ammunitionStats[0]?.emptyAmmunitionCases || 0,
      ammunitionTypes: ammunitionStats[0]?.totalTypes || 0,

      // Munitions
      totalMunitions: munitionStats[0]?.totalMunitions || 0,
      availableMunitions: munitionStats[0]?.availableMunitions || 0,
      issuedMunitions: munitionStats[0]?.issuedMunitions || 0,
      consumedMunitions: munitionStats[0]?.consumedMunitions || 0,
      emptyMunitionCases: munitionStats[0]?.emptyMunitionCases || 0,
      munitionTypes: munitionStats[0]?.totalTypes || 0,

      // Officers
      totalOfficers: officerStats[0]?.totalOfficers || 0,
      activeOfficers: officerStats[0]?.activeOfficers || 0,
      inactiveOfficers: officerStats[0]?.inactiveOfficers || 0,

      // Activity
      todayIssues,
      todayReturns,
      pendingReturns,
      shortages: shortageCount
    };

    res.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard statistics'
    });
  }
});

// @route   GET /api/dashboard/recent-transactions
// @desc    Get recent transactions for dashboard
// @access  Private
router.get('/recent-transactions', auth, async (req, res) => {
  try {
    const recentTransactions = await Transaction.find()
      .populate('officerId', 'name rank metalNo')
      .sort({ createdAt: -1 })
      .limit(10)
      .select('transactionType officerId createdAt status issuedItems');

    // Format transactions for dashboard display
    const formattedTransactions = recentTransactions.map(transaction => {
      const itemsCount = 
        (transaction.issuedItems?.armoury?.length || 0) +
        (transaction.issuedItems?.ammunition?.length || 0) +
        (transaction.issuedItems?.munition?.length || 0);

      return {
        id: transaction._id,
        type: transaction.transactionType,
        officerName: transaction.officerId?.name || 'Unknown',
        officerRank: transaction.officerId?.rank || 'Unknown',
        date: transaction.createdAt,
        status: transaction.status,
        itemsCount
      };
    });

    res.json(formattedTransactions);
  } catch (error) {
    console.error('Recent transactions error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching recent transactions'
    });
  }
});

// @route   GET /api/dashboard/alerts
// @desc    Get dashboard alerts (low stock, expiring items, etc.)
// @access  Private
router.get('/alerts', auth, async (req, res) => {
  try {
    const alerts = [];

    // Low stock ammunition
    const lowStockAmmunition = await Ammunition.find({
      $expr: { $lte: ['$availableCount', '$minimumStockLevel'] },
      status: 'active'
    }).select('name availableCount minimumStockLevel');

    lowStockAmmunition.forEach(ammo => {
      alerts.push({
        type: 'low_stock',
        category: 'ammunition',
        title: `Low Stock: ${ammo.name}`,
        message: `Only ${ammo.availableCount} rounds remaining (minimum: ${ammo.minimumStockLevel})`,
        severity: ammo.availableCount === 0 ? 'critical' : 'warning',
        timestamp: new Date()
      });
    });

    // Low stock munitions
    const lowStockMunitions = await Munition.find({
      $expr: { $lte: ['$availableCount', '$minimumStockLevel'] },
      status: 'active'
    }).select('name availableCount minimumStockLevel');

    lowStockMunitions.forEach(munition => {
      alerts.push({
        type: 'low_stock',
        category: 'munition',
        title: `Low Stock: ${munition.name}`,
        message: `Only ${munition.availableCount} units remaining (minimum: ${munition.minimumStockLevel})`,
        severity: munition.availableCount === 0 ? 'critical' : 'warning',
        timestamp: new Date()
      });
    });

    // Expiring ammunition (next 30 days)
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    const expiringAmmunition = await Ammunition.find({
      expiryDate: {
        $lte: thirtyDaysFromNow,
        $gte: new Date()
      },
      status: 'active'
    }).select('name expiryDate availableCount');

    expiringAmmunition.forEach(ammo => {
      const daysUntilExpiry = Math.ceil((ammo.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
      alerts.push({
        type: 'expiring',
        category: 'ammunition',
        title: `Expiring: ${ammo.name}`,
        message: `${ammo.availableCount} rounds expire in ${daysUntilExpiry} days`,
        severity: daysUntilExpiry <= 7 ? 'critical' : 'warning',
        timestamp: new Date()
      });
    });

    // Expiring munitions (next 30 days)
    const expiringMunitions = await Munition.find({
      expiryDate: {
        $lte: thirtyDaysFromNow,
        $gte: new Date()
      },
      status: 'active'
    }).select('name expiryDate availableCount');

    expiringMunitions.forEach(munition => {
      const daysUntilExpiry = Math.ceil((munition.expiryDate - new Date()) / (1000 * 60 * 60 * 24));
      alerts.push({
        type: 'expiring',
        category: 'munition',
        title: `Expiring: ${munition.name}`,
        message: `${munition.availableCount} units expire in ${daysUntilExpiry} days`,
        severity: daysUntilExpiry <= 7 ? 'critical' : 'warning',
        timestamp: new Date()
      });
    });

    // Overdue returns
    const overdueTransactions = await Transaction.find({
      status: 'open',
      expectedReturnDate: { $lt: new Date() }
    })
    .populate('officerId', 'name rank metalNo')
    .select('officerId expectedReturnDate transactionNumber');

    overdueTransactions.forEach(transaction => {
      const daysOverdue = Math.ceil((new Date() - transaction.expectedReturnDate) / (1000 * 60 * 60 * 24));
      alerts.push({
        type: 'overdue',
        category: 'transaction',
        title: `Overdue Return: ${transaction.officerId?.name}`,
        message: `Transaction ${transaction.transactionNumber} is ${daysOverdue} days overdue`,
        severity: daysOverdue > 7 ? 'critical' : 'warning',
        timestamp: new Date()
      });
    });

    // Sort alerts by severity and timestamp
    alerts.sort((a, b) => {
      const severityOrder = { critical: 3, warning: 2, info: 1 };
      if (severityOrder[a.severity] !== severityOrder[b.severity]) {
        return severityOrder[b.severity] - severityOrder[a.severity];
      }
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    res.json({
      success: true,
      data: alerts.slice(0, 20) // Limit to 20 most important alerts
    });
  } catch (error) {
    console.error('Dashboard alerts error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard alerts'
    });
  }
});

// @route   GET /api/dashboard/activity
// @desc    Get recent activity for dashboard
// @access  Private
router.get('/activity', auth, async (req, res) => {
  try {
    const activities = [];

    // Recent transactions
    const recentTransactions = await Transaction.find()
      .populate('officerId', 'name rank')
      .populate('audit.createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(5);

    recentTransactions.forEach(transaction => {
      activities.push({
        type: 'transaction',
        action: transaction.transactionType === 'issue' ? 'issued' : 'returned',
        description: `Items ${transaction.transactionType === 'issue' ? 'issued to' : 'returned by'} ${transaction.officerId?.name}`,
        user: transaction.audit.createdBy?.name || 'System',
        timestamp: transaction.createdAt
      });
    });

    // Recent officer additions
    const recentOfficers = await Officer.find()
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(3);

    recentOfficers.forEach(officer => {
      activities.push({
        type: 'officer',
        action: 'added',
        description: `New officer ${officer.name} (${officer.rank}) added`,
        user: officer.createdBy?.name || 'System',
        timestamp: officer.createdAt
      });
    });

    // Recent weapon additions
    const recentWeapons = await Armoury.find()
      .populate('createdBy', 'name')
      .sort({ createdAt: -1 })
      .limit(3);

    recentWeapons.forEach(weapon => {
      activities.push({
        type: 'weapon',
        action: 'added',
        description: `New weapon ${weapon.type} (${weapon.registerNumber}) added`,
        user: weapon.createdBy?.name || 'System',
        timestamp: weapon.createdAt
      });
    });

    // Sort all activities by timestamp
    activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json({
      success: true,
      data: activities.slice(0, 10) // Limit to 10 most recent activities
    });
  } catch (error) {
    console.error('Dashboard activity error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching dashboard activity'
    });
  }
});


// Searchable inventory detail used by the dashboard's clickable summary cards.
router.get('/inventory-breakdown', auth, async (req, res) => {
  try {
    const [arms, ammunition, munitions] = await Promise.all([
      Armoury.find().select('registerNumber buttNumber type category status storageLocation').sort({ type: 1, registerNumber: 1 }).lean(),
      Ammunition.find().select('name type caliber totalCount availableCount issuedCount consumedCount emptyCasesCount status').sort({ name: 1 }).lean(),
      Munition.find().select('name type category totalCount availableCount issuedCount consumedCount emptyCasesCount status').sort({ name: 1 }).lean()
    ]);
    res.json({ success: true, data: { arms, ammunition, munitions } });
  } catch (error) {
    console.error('Inventory breakdown error:', error);
    res.status(500).json({ success: false, message: 'Unable to load inventory breakdown' });
  }
});

module.exports = router;