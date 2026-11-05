const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Transaction = require('../models/Transaction');
const Officer = require('../models/Officer');
const Armoury = require('../models/Armoury');
const Ammunition = require('../models/Ammunition');
const Munition = require('../models/Munition');
const UsedMaterial = require('../models/UsedMaterial');
const { auth, adminOnly } = require('../middleware/auth');
const { upload, handleMulterError } = require('../middleware/upload');

const router = express.Router();
const TYPES = ['armoury', 'ammunition', 'munition'];
const isWholeNumber = value => Number.isInteger(Number(value)) && Number(value) >= 0;
const makeTransactionNumber = prefix => `${prefix}${Date.now()}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
const parseJson = (value, fallback) => {
  if (typeof value !== 'string') return value ?? fallback;
  try { return JSON.parse(value); } catch { throw new Error('Invalid returnItems JSON payload'); }
};
const removeUploadedFiles = files => (files || []).forEach(file => {
  try { fs.unlinkSync(file.path); } catch (_) {}
});

/**
 * Build issue-line balances. New return records are linked to their exact issue
 * transaction. Legacy return records without that link are allocated FIFO to
 * the oldest matching issue line so older data remains visible during migration.
 */
async function buildOutstandingItems(officerId, session) {
  const filter = officerId ? { officerId } : {};
  const issueQuery = Transaction.find({ ...filter, transactionType: 'issue' }).sort({ createdAt: 1 });
  const returnQuery = Transaction.find({ ...filter, transactionType: 'return' }).sort({ createdAt: 1 });
  if (session) { issueQuery.session(session); returnQuery.session(session); }
  const [issues, returns] = await Promise.all([issueQuery, returnQuery]);
  const rows = [];
  const direct = new Map();
  const legacy = new Map();
  const keyFor = (type, issueId, itemId) => `${type}:${issueId}:${itemId}`;
  const legacyKey = (type, itemId, ownerId) => `${type}:${ownerId}:${itemId}`;

  for (const ret of returns) {
    for (const type of TYPES) {
      const lines = ret.issuedItems?.[type] || [];
      for (const line of lines) {
        const itemId = String(line._id || '');
        if (!itemId) continue;
        const value = {
          returned: Number(line.returnedCount ?? line.count ?? 0),
          consumed: Number(line.consumedCount || 0),
          emptyCases: Number(line.emptyCasesReturned || line.emptyCasesReturnedL || 0),
          missingCases: Number(line.missingCasesCount || 0),
          returnedArm: type === 'armoury' && line.dispositionStatus !== 'pending_approval',
          pendingArm: type === 'armoury' && line.dispositionStatus === 'pending_approval'
        };
        const sourceId = line.sourceIssueTransactionId ? String(line.sourceIssueTransactionId) : null;
        const map = sourceId ? direct : legacy;
        const key = sourceId ? keyFor(type, sourceId, itemId) : legacyKey(type, itemId, ret.officerId);
        const previous = map.get(key) || { returned: 0, consumed: 0, emptyCases: 0, missingCases: 0, returnedArm: false, pendingArm: false };
        previous.returned += value.returned;
        previous.consumed += value.consumed;
        previous.emptyCases += value.emptyCases;
        previous.missingCases += value.missingCases;
        previous.returnedArm = previous.returnedArm || value.returnedArm;
        previous.pendingArm = previous.pendingArm || value.pendingArm;
        map.set(key, previous);
      }
    }
  }

  const legacyRemaining = new Map(legacy);
  for (const issue of issues) {
    for (const type of TYPES) {
      for (const item of issue.issuedItems?.[type] || []) {
        const itemId = String(item._id);
        const directBalance = direct.get(keyFor(type, String(issue._id), itemId)) || { returned: 0, consumed: 0, emptyCases: 0, missingCases: 0, returnedArm: false, pendingArm: false };
        const oldKey = legacyKey(type, itemId, issue.officerId);
        const oldBalance = legacyRemaining.get(oldKey) || { returned: 0, consumed: 0, emptyCases: 0, missingCases: 0, returnedArm: false, pendingArm: false };
        const legacyUsed = type === 'armoury'
          ? (oldBalance.returnedArm ? 1 : 0)
          : Math.min(Number(item.count || 0) - directBalance.returned - directBalance.consumed, oldBalance.returned + oldBalance.consumed);
        if (type === 'armoury' && legacyUsed) oldBalance.returnedArm = false;
        else if (type !== 'armoury' && legacyUsed) {
          let left = legacyUsed;
          const fromReturned = Math.min(left, oldBalance.returned);
          oldBalance.returned -= fromReturned; left -= fromReturned;
          oldBalance.consumed = Math.max(0, oldBalance.consumed - left);
        }
        legacyRemaining.set(oldKey, oldBalance);
        const balance = {
          returned: directBalance.returned + (type === 'armoury' ? 0 : legacyUsed),
          consumed: directBalance.consumed,
          emptyCases: directBalance.emptyCases,
          missingCases: directBalance.missingCases,
          returnedArm: directBalance.returnedArm || (type === 'armoury' && legacyUsed > 0),
          pendingArm: directBalance.pendingArm
        };
        if (type === 'armoury') {
          if (!balance.returnedArm) rows.push({
            key: `${issue._id}:${type}:${itemId}`, issueTransactionId: String(issue._id),
            itemId, itemType: type, name: item.registerNumber || item.type || 'Arm',
            registerNumber: item.registerNumber, buttNumber: item.buttNumber, typeName: item.type,
            issuedCount: 1, outstandingCount: 1, returnedCount: 0, consumedCount: 0, pendingApproval: balance.pendingArm,
            issueTransactionNumber: issue.transactionNumber, issueDate: issue.createdAt
          });
          continue;
        }
        const issuedCount = Number(item.count || 0);
        const returnedCount = balance.returned;
        const consumedCount = balance.consumed;
        const outstandingCount = Math.max(0, issuedCount - returnedCount - consumedCount);
        if (outstandingCount > 0) rows.push({
          key: `${issue._id}:${type}:${itemId}`, issueTransactionId: String(issue._id),
          itemId, itemType: type, name: item.name || 'Inventory item', caliber: item.caliber,
          typeName: item.type, issuedCount, returnedCount, consumedCount, outstandingCount,
          emptyCasesReturned: balance.emptyCases, missingCasesCount: balance.missingCases,
          issueTransactionNumber: issue.transactionNumber, issueDate: issue.createdAt
        });
      }
    }
  }
  return { rows, issues, returns };
}

async function synchronizeIssuedCounters(itemTypeIds, session) {
  const snapshot = await buildOutstandingItems(null, session);
  for (const item of itemTypeIds) {
    const outstanding = snapshot.rows
      .filter(row => row.itemType === item.itemType && String(row.itemId) === String(item.itemId))
      .reduce((sum, row) => sum + Number(row.outstandingCount || 0), 0);
    const Model = item.itemType === 'ammunition' ? Ammunition : Munition;
    const record = await Model.findById(item.itemId).session(session);
    if (record) {
      record.issuedCount = outstanding;
      await record.save({ session });
    }
  }
}

// Separate used-material / empty-case ledger for reporting and reconciliation.
router.get('/used-materials', auth, async (req, res) => {
  try {
    const { officerId, itemType, startDate, endDate, page = 1, limit = 50 } = req.query;
    const query = {};
    if (officerId) query.officerId = officerId;
    if (itemType && ['ammunition', 'munition'].includes(itemType)) query.itemType = itemType;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const [data, total] = await Promise.all([
      UsedMaterial.find(query).populate('officerId', 'name rank metalNo').populate('recordedBy', 'name')
        .sort({ createdAt: -1 }).limit(safeLimit).skip((safePage - 1) * safeLimit),
      UsedMaterial.countDocuments(query)
    ]);
    res.json({ success: true, data, pagination: { current: safePage, pages: Math.ceil(total / safeLimit), total } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to fetch used-material ledger' });
  }
});

// Private document download. A user must be authenticated and the file must be referenced by a transaction.
router.get('/documents/:filename', auth, async (req, res) => {
  try {
    const filename = path.basename(req.params.filename || '');
    if (!filename || filename !== req.params.filename) return res.status(400).json({ success: false, message: 'Invalid document name' });
    const exists = await Transaction.exists({ 'returnDocuments.filePath': filename });
    if (!exists) return res.status(404).json({ success: false, message: 'Document not found' });
    const filePath = path.join(__dirname, '..', 'uploads', 'documents', filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, message: 'Document file is missing' });
    return res.sendFile(filePath);
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Unable to download document' });
  }
});

// List and detail endpoints
router.get('/', auth, async (req, res) => {
  try {
    const { type, status, officerId, startDate, endDate, page = 1, limit = 50 } = req.query;
    const query = {};
    if (type) query.transactionType = type;
    if (status) query.status = status;
    if (officerId) query.officerId = officerId;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const [transactions, total] = await Promise.all([
      Transaction.find(query).populate('officerId', 'name rank metalNo kgidNo').populate('audit.createdBy', 'name')
        .sort({ createdAt: -1 }).limit(safeLimit).skip((safePage - 1) * safeLimit),
      Transaction.countDocuments(query)
    ]);
    res.json({ success: true, data: transactions, pagination: { current: safePage, pages: Math.ceil(total / safeLimit), total } });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Unable to fetch transactions' });
  }
});

router.get('/stats/overview', auth, async (req, res) => {
  try {
    const [stats, daily] = await Promise.all([
      Transaction.aggregate([{ $group: {
        _id: null, total: { $sum: 1 },
        issues: { $sum: { $cond: [{ $eq: ['$transactionType', 'issue'] }, 1, 0] } },
        returns: { $sum: { $cond: [{ $eq: ['$transactionType', 'return'] }, 1, 0] } },
        open: { $sum: { $cond: [{ $in: ['$status', ['open', 'partial', 'overdue']] }, 1, 0] } },
        closed: { $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] } }
      } }]),
      Transaction.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 30 * 86400000) } } },
        { $group: { _id: { date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, type: '$transactionType' }, count: { $sum: 1 } } },
        { $sort: { '_id.date': -1 } }
      ])
    ]);
    res.json({ success: true, data: { overview: stats[0] || { total: 0, issues: 0, returns: 0, open: 0, closed: 0 }, daily } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Unable to calculate transaction statistics' });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid transaction ID' });
    const transaction = await Transaction.findById(req.params.id).populate('officerId', 'name rank metalNo kgidNo phonenumber')
      .populate('audit.createdBy', 'name').populate('audit.lastModifiedBy', 'name');
    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });
    res.json({ success: true, data: transaction });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to fetch transaction' }); }
});

// Issue stock. MongoDB transactions keep inventory and the issue ledger in sync.
router.post('/issue', [auth, adminOnly], async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const { officerId, weaponIds = [], ammunitionIds = [], munitionIds = [], ammunitionCounts = {}, munitionCounts = {}, purpose, location, expectedReturnDate, fingerprintData } = req.body;
    if (!mongoose.Types.ObjectId.isValid(officerId)) return res.status(400).json({ success: false, message: 'Select a valid officer' });
    if (![weaponIds, ammunitionIds, munitionIds].every(Array.isArray)) return res.status(400).json({ success: false, message: 'Invalid item selection' });
    if (!weaponIds.length && !ammunitionIds.length && !munitionIds.length) return res.status(400).json({ success: false, message: 'Select at least one item to issue' });
    let created;
    await session.withTransaction(async () => {
      const officer = await Officer.findOne({ _id: officerId, status: 'active' }).session(session);
      if (!officer) throw new Error('Officer not found or inactive');
      const outstandingBeforeIssue = await buildOutstandingItems(officerId, session);
      if (outstandingBeforeIssue.rows.length) {
        const preview = outstandingBeforeIssue.rows.slice(0, 3)
          .map(row => `${row.name} (${row.itemType === 'armoury' ? 'not returned' : `${row.outstandingCount} pending`})`).join(', ');
        throw new Error(`Cannot issue new equipment. This officer has outstanding items: ${preview}. Complete the return or submit the required supporting documents first.`);
      }
      const issuedItems = { armoury: [], ammunition: [], munition: [] };
      if (weaponIds.length) {
        const weapons = await Armoury.find({ _id: { $in: weaponIds }, status: 'available' }).session(session);
        if (weapons.length !== new Set(weaponIds).size) throw new Error('One or more selected arms are unavailable or already issued');
        for (const weapon of weapons) {
          weapon.status = 'issued'; weapon.currentHolder = officerId;
          await weapon.save({ session });
          issuedItems.armoury.push({ _id: weapon._id, registerNumber: weapon.registerNumber, buttNumber: weapon.buttNumber, type: weapon.type, status: 'issued' });
        }
      }
      if (ammunitionIds.length) {
        const ammunitions = await Ammunition.find({ _id: { $in: ammunitionIds }, status: 'active' }).session(session);
        if (ammunitions.length !== new Set(ammunitionIds).size) throw new Error('One or more ammunition items are unavailable');
        for (const ammo of ammunitions) {
          const qty = Number(ammunitionCounts[ammo._id.toString()]);
          if (!isWholeNumber(qty) || qty < 1) throw new Error(`Enter a valid issue quantity for ${ammo.name}`);
          if (ammo.availableCount < qty) throw new Error(`Insufficient stock for ${ammo.name}. Available: ${ammo.availableCount}`);
          ammo.availableCount -= qty; ammo.issuedCount += qty;
          await ammo.save({ session });
          issuedItems.ammunition.push({ _id: ammo._id, name: ammo.name, caliber: ammo.caliber, count: qty, status: 'issued', batchNumber: ammo.batchNumber, expiryDate: ammo.expiryDate });
        }
      }
      if (munitionIds.length) {
        const munitions = await Munition.find({ _id: { $in: munitionIds }, status: 'active' }).session(session);
        if (munitions.length !== new Set(munitionIds).size) throw new Error('One or more munition items are unavailable');
        for (const mun of munitions) {
          const qty = Number(munitionCounts[mun._id.toString()]);
          if (!isWholeNumber(qty) || qty < 1) throw new Error(`Enter a valid issue quantity for ${mun.name}`);
          if (mun.availableCount < qty) throw new Error(`Insufficient stock for ${mun.name}. Available: ${mun.availableCount}`);
          mun.availableCount -= qty; mun.issuedCount += qty;
          await mun.save({ session });
          issuedItems.munition.push({ _id: mun._id, name: mun.name, type: mun.type, count: qty, status: 'issued', batchNumber: mun.batchNumber, expiryDate: mun.expiryDate });
        }
      }
      const transaction = new Transaction({
        transactionType: 'issue', transactionNumber: makeTransactionNumber('ISS'), officerId, issuedItems,
        purpose: purpose || 'Duty Assignment', location, expectedReturnDate,
        fingerprint: { issueFingerprint: fingerprintData, verificationStatus: fingerprintData ? 'verified' : 'pending' },
        audit: { createdBy: req.user.id, actions: [{ action: 'ISSUE_CREATED', performedBy: req.user.id, details: `Issued to ${officer.name} (${officer.metalNo})`, ipAddress: req.ip }] }
      });
      await transaction.save({ session });
      created = transaction;
      await synchronizeIssuedCounters([
        ...issuedItems.ammunition.map(item => ({ itemType: 'ammunition', itemId: item._id })),
        ...issuedItems.munition.map(item => ({ itemType: 'munition', itemId: item._id }))
      ], session);
    });
    res.status(201).json({ success: true, message: 'Items issued successfully', data: created });
  } catch (error) {
    console.error('Issue transaction error:', error);
    res.status(400).json({ success: false, message: error.message || 'Issue failed' });
  } finally { await session.endSession(); }
});

// Officer's exact outstanding issue lines (not merged only by inventory ID).
router.get('/officer/:officerId/outstanding', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.officerId)) return res.status(400).json({ success: false, message: 'Invalid officer ID' });
    const officer = await Officer.findById(req.params.officerId).select('name rank metalNo kgidNo profilePicture');
    if (!officer) return res.status(404).json({ success: false, message: 'Officer not found' });
    const { rows } = await buildOutstandingItems(officer._id);
    res.json({ success: true, officer, data: rows });
  } catch (error) {
    console.error('Outstanding items error:', error);
    res.status(500).json({ success: false, message: 'Unable to calculate outstanding items' });
  }
});

// Return selected quantities against their original issue transaction.
router.post('/return', [auth, adminOnly, upload.array('documents', 10), body('officerId').isMongoId()], handleMulterError, async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) throw new Error('A valid officer must be selected');
    const officerId = req.body.officerId;
    const returnItems = parseJson(req.body.returnItems, []);
    const remarks = String(req.body.remarks || '').trim();
    const documents = (req.files || []).map(file => ({ fileName: file.originalname, filePath: file.filename, fileType: file.mimetype, fileSize: file.size, description: file.originalname }));
    if (!Array.isArray(returnItems) || !returnItems.length) throw new Error('Select at least one item to process');
    let created;
    await session.withTransaction(async () => {
      const officer = await Officer.findById(officerId).session(session);
      if (!officer) throw new Error('Officer not found');
      const returnedItems = { armoury: [], ammunition: [], munition: [] };
      const shortageDetails = [];
      const usedMaterialEntries = [];
      const outstandingSnapshot = await buildOutstandingItems(officerId, session);
      const outstandingByKey = new Map(outstandingSnapshot.rows.map(row => [row.key, row]));
      let requiresDocuments = false;
      let hasPendingDisposition = false;
      const seen = new Set();
      const submittedKeys = new Set(returnItems.map(entry => `${entry.issueTransactionId}:${entry.itemType}:${entry.itemId}`));
      if (outstandingSnapshot.rows.some(row => !submittedKeys.has(`${row.issueTransactionId}:${row.itemType}:${row.itemId}`))) {
        requiresDocuments = true;
      }

      for (const entry of returnItems) {
        const { issueTransactionId, itemId, itemType } = entry;
        if (!TYPES.includes(itemType) || !mongoose.Types.ObjectId.isValid(issueTransactionId) || !mongoose.Types.ObjectId.isValid(itemId)) throw new Error('Invalid return item reference');
        const unique = `${issueTransactionId}:${itemType}:${itemId}`;
        if (seen.has(unique)) throw new Error('Duplicate item submitted in the same return');
        seen.add(unique);
        const issue = await Transaction.findOne({ _id: issueTransactionId, officerId, transactionType: 'issue' }).session(session);
        if (!issue) throw new Error('Original issue transaction not found for this officer');
        const sourceList = issue.issuedItems?.[itemType] || [];
        const source = sourceList.find(item => String(item._id) === String(itemId));
        if (!source) throw new Error('Item does not belong to the selected issue transaction');
        const balanceRow = outstandingByKey.get(`${issueTransactionId}:${itemType}:${itemId}`);
        if (itemType === 'armoury') {
          const action = entry.action || 'returned';
          if (!balanceRow) throw new Error(`${source.registerNumber || 'Arm'} has already been returned or has no outstanding balance`);
          if (action === 'not_returned') {
            if (balanceRow.pendingApproval) throw new Error(`${source.registerNumber || 'Arm'} already has a non-return report awaiting approval`);
            const reason = String(entry.reason || '').trim();
            if (!reason) throw new Error('Explain why the arm is not being physically returned');
            requiresDocuments = true; hasPendingDisposition = true;
            shortageDetails.push({
              itemType: 'armoury', itemId: source._id,
              itemName: source.registerNumber || source.type || 'Arm',
              expectedQuantity: 1, returnedQuantity: 0, shortageQuantity: 1,
              reason, actionTaken: 'Pending approval', investigationStatus: 'pending'
            });
            returnedItems.armoury.push({ _id: source._id, registerNumber: source.registerNumber, buttNumber: source.buttNumber, type: source.type, status: 'not_returned', dispositionStatus: 'pending_approval', nonReturnReason: reason, sourceIssueTransactionId: issue._id });
          } else {
            const weapon = await Armoury.findOne({ _id: itemId, currentHolder: officerId, status: 'issued' }).session(session);
            if (!weapon) throw new Error(`${source.registerNumber || 'Arm'} is not currently held by this officer`);
            weapon.status = 'available'; weapon.currentHolder = undefined;
            await weapon.save({ session });
            returnedItems.armoury.push({ _id: weapon._id, registerNumber: weapon.registerNumber, buttNumber: weapon.buttNumber, type: weapon.type, status: 'returned', dispositionStatus: 'returned', sourceIssueTransactionId: issue._id });
          }
          continue;
        }

        const unusedReturned = Number(entry.unusedReturnedCount ?? 0);
        const consumed = Number(entry.consumedCount ?? 0);
        const emptyCases = Number(entry.emptyCasesReturned ?? 0);
        const issuedQty = Number(source.count || 0);
        const previousReturned = Number(balanceRow?.returnedCount || 0);
        const previousConsumed = Number(balanceRow?.consumedCount || 0);
        const outstanding = Number(balanceRow?.outstandingCount || 0);
        if (![unusedReturned, consumed, emptyCases].every(isWholeNumber)) throw new Error(`Quantities must be whole numbers for ${source.name}`);
        if (unusedReturned + consumed < 1) throw new Error(`Enter an unused returned quantity or consumed quantity for ${source.name}`);
        if (unusedReturned + consumed > outstanding) throw new Error(`Return/consumption exceeds outstanding quantity for ${source.name}. Outstanding: ${Math.max(0, outstanding)}`);
        if (emptyCases > consumed) throw new Error(`Empty cases cannot exceed consumed quantity for ${source.name}`);
        const missingCases = consumed - emptyCases;
        if (consumed > 0 || emptyCases > 0 || missingCases > 0) requiresDocuments = true;
        const balanceAfter = outstanding - unusedReturned - consumed;
        if (balanceAfter > 0) {
          requiresDocuments = true;
          hasPendingDisposition = true;
          shortageDetails.push({
            itemType, itemId: source._id, itemName: source.name,
            expectedQuantity: outstanding, returnedQuantity: unusedReturned + consumed,
            shortageQuantity: balanceAfter, reason: remarks || 'Quantity remains outstanding',
            actionTaken: 'Pending return with supporting report', investigationStatus: 'pending'
          });
        }
        if (missingCases > 0) hasPendingDisposition = true;
        const line = {
          _id: source._id, name: source.name, type: source.type, caliber: source.caliber,
          count: unusedReturned + consumed, returnedCount: unusedReturned, consumedCount: consumed,
          emptyCasesReturned: emptyCases, missingCasesCount: missingCases,
          sourceIssueTransactionId: issue._id,
          status: balanceAfter === 0 ? 'fully_returned' : 'partially_returned',
          returnTimestamp: new Date(), remarks
        };
        if (itemType === 'ammunition') {
          const ammo = await Ammunition.findById(itemId).session(session);
          if (!ammo) throw new Error(`Ammunition inventory record not found: ${source.name}`);
          ammo.availableCount += unusedReturned;
          ammo.totalCount = Math.max(0, ammo.totalCount - consumed);
          ammo.returnedCount += unusedReturned;
          ammo.consumedCount = Number(ammo.consumedCount || 0) + consumed;
          ammo.emptyCasesCount = Number(ammo.emptyCasesCount || 0) + emptyCases;
          await ammo.save({ session });
          returnedItems.ammunition.push(line);
        } else {
          const mun = await Munition.findById(itemId).session(session);
          if (!mun) throw new Error(`Munition inventory record not found: ${source.name}`);
          mun.availableCount += unusedReturned;
          mun.totalCount = Math.max(0, mun.totalCount - consumed);
          mun.returnedCount += unusedReturned;
          mun.consumedCount = Number(mun.consumedCount || 0) + consumed;
          mun.emptyCasesCount = Number(mun.emptyCasesCount || 0) + emptyCases;
          await mun.save({ session });
          returnedItems.munition.push(line);
        }
        if (missingCases > 0) shortageDetails.push({ itemType, itemId: source._id, itemName: source.name, expectedQuantity: consumed, returnedQuantity: emptyCases, shortageQuantity: missingCases, reason: remarks || 'Empty-case discrepancy reported', investigationStatus: 'pending' });
        if (consumed > 0 || emptyCases > 0 || missingCases > 0) usedMaterialEntries.push({
          officerId, sourceIssueTransactionId: issue._id, itemId: source._id, itemType,
          itemName: source.name, consumedCount: consumed, emptyCasesReceived: emptyCases,
          missingCasesCount: missingCases, remarks
        });
      }
      if (requiresDocuments && documents.length === 0) throw new Error('Supporting report/document is mandatory for consumed items, empty cases or arms not physically returned');
      if (requiresDocuments && !remarks) throw new Error('Enter remarks explaining consumption, empty-case count or arm non-return');

      const transaction = new Transaction({
        transactionType: 'return', transactionNumber: makeTransactionNumber('RET'), officerId,
        issuedItems: returnedItems, actualReturnDate: new Date(), returnDocuments: documents,
        returnRemarks: remarks ? [remarks] : [], shortageDetails,
        status: hasPendingDisposition ? 'partial' : 'closed',
        fingerprint: { returnFingerprint: req.body.fingerprintData, verificationStatus: req.body.fingerprintData ? 'verified' : 'pending' },
        audit: { createdBy: req.user.id, actions: [{ action: 'RETURN_PROCESSED', performedBy: req.user.id, details: `Return processed for ${officer.name} (${officer.metalNo})`, ipAddress: req.ip }] }
      });
      await transaction.save({ session });
      created = transaction;
      if (usedMaterialEntries.length) {
        await UsedMaterial.insertMany(usedMaterialEntries.map(entry => ({ ...entry, returnTransactionId: transaction._id, documents: documents.map(doc => ({ fileName: doc.fileName, filePath: doc.filePath, fileType: doc.fileType })), recordedBy: req.user.id })), { session });
      }
      await synchronizeIssuedCounters([
        ...returnedItems.ammunition.map(item => ({ itemType: 'ammunition', itemId: item._id })),
        ...returnedItems.munition.map(item => ({ itemType: 'munition', itemId: item._id }))
      ], session);

      // Recalculate issue statuses from the same exact outstanding-line calculation used by the Return screen.
      const affectedIssueIds = [...new Set(returnItems.map(item => String(item.issueTransactionId)))];
      const refreshedOutstanding = await buildOutstandingItems(officerId, session);
      for (const issueId of affectedIssueIds) {
        const issue = await Transaction.findById(issueId).session(session);
        const remainingRows = refreshedOutstanding.rows.filter(row => row.issueTransactionId === issueId);
        const outstandingCount = remainingRows.reduce((sum, row) => sum + Number(row.outstandingCount || 0), 0);
        const sourceIds = Object.fromEntries(TYPES.map(type => [type, (issue.issuedItems?.[type] || []).map(line => String(line._id))]));
        const anyProcessed = refreshedOutstanding.returns.some(ret => TYPES.some(type => (ret.issuedItems?.[type] || []).some(line => {
          const sourceIssueId = line.sourceIssueTransactionId ? String(line.sourceIssueTransactionId) : null;
          return sourceIssueId ? sourceIssueId === issueId : sourceIds[type].includes(String(line._id));
        })));
        issue.status = outstandingCount === 0 ? 'closed' : (anyProcessed ? 'partial' : 'open');
        if (outstandingCount === 0) issue.actualReturnDate = new Date();
        await issue.save({ session });
      }
    });
    await created.populate('officerId', 'name rank metalNo kgidNo');
    res.status(201).json({ success: true, message: 'Return recorded and stock ledger updated', data: created });
  } catch (error) {
    removeUploadedFiles(req.files);
    console.error('Return transaction error:', error);
    res.status(400).json({ success: false, message: error.message || 'Return failed' });
  } finally { await session.endSession(); }
});

router.get('/officer/:officerId', auth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.officerId)) return res.status(400).json({ success: false, message: 'Invalid officer ID' });
    const transactions = await Transaction.find({ officerId: req.params.officerId }).populate('officerId', 'name rank metalNo kgidNo').sort({ createdAt: -1 });
    res.json({ success: true, data: transactions });
  } catch (error) { res.status(500).json({ success: false, message: 'Unable to fetch officer transactions' }); }
});

module.exports = router;
