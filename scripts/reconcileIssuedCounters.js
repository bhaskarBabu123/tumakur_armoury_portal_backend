/**
 * Rebuild the current issuedCount counters from the transaction ledger.
 * Run only after taking a database backup and reviewing the legacy FIFO note.
 * This script does not modify availableCount, totalCount, consumedCount or emptyCasesCount.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const Transaction = require('../models/Transaction');
const Ammunition = require('../models/Ammunition');
const Munition = require('../models/Munition');

const TYPES = ['ammunition', 'munition'];
const key = (type, officerId, itemId) => `${type}:${officerId}:${itemId}`;
const directKey = (type, issueId, itemId) => `${type}:${issueId}:${itemId}`;

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is missing in backend/.env');
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const [issues, returns] = await Promise.all([
    Transaction.find({ transactionType: 'issue' }).sort({ createdAt: 1 }),
    Transaction.find({ transactionType: 'return' }).sort({ createdAt: 1 })
  ]);
  const direct = new Map();
  const legacy = new Map();
  const add = (map, id, returned, consumed) => {
    const current = map.get(id) || { returned: 0, consumed: 0 };
    current.returned += returned;
    current.consumed += consumed;
    map.set(id, current);
  };

  for (const transaction of returns) {
    for (const type of TYPES) {
      for (const line of transaction.issuedItems?.[type] || []) {
        const itemId = String(line._id);
        const returned = Number(line.returnedCount ?? line.count ?? 0);
        const consumed = Number(line.consumedCount || 0);
        if (line.sourceIssueTransactionId) add(direct, directKey(type, String(line.sourceIssueTransactionId), itemId), returned, consumed);
        else add(legacy, key(type, String(transaction.officerId), itemId), returned, consumed);
      }
    }
  }

  const legacyRemaining = new Map(legacy);
  const totals = { ammunition: new Map(), munition: new Map() };
  for (const issue of issues) {
    for (const type of TYPES) {
      for (const line of issue.issuedItems?.[type] || []) {
        const itemId = String(line._id);
        const linked = direct.get(directKey(type, String(issue._id), itemId)) || { returned: 0, consumed: 0 };
        const oldKey = key(type, String(issue.officerId), itemId);
        const old = legacyRemaining.get(oldKey) || { returned: 0, consumed: 0 };
        const room = Math.max(0, Number(line.count || 0) - linked.returned - linked.consumed);
        const legacyUsed = Math.min(room, old.returned + old.consumed);
        let left = legacyUsed;
        const fromReturned = Math.min(left, old.returned);
        old.returned -= fromReturned;
        left -= fromReturned;
        old.consumed = Math.max(0, old.consumed - left);
        legacyRemaining.set(oldKey, old);
        const outstanding = Math.max(0, Number(line.count || 0) - linked.returned - linked.consumed - legacyUsed);
        totals[type].set(itemId, (totals[type].get(itemId) || 0) + outstanding);
      }
    }
  }

  await Promise.all([
    Ammunition.updateMany({}, { $set: { issuedCount: 0 } }),
    Munition.updateMany({}, { $set: { issuedCount: 0 } })
  ]);
  for (const [itemId, issuedCount] of totals.ammunition) await Ammunition.updateOne({ _id: itemId }, { $set: { issuedCount } });
  for (const [itemId, issuedCount] of totals.munition) await Munition.updateOne({ _id: itemId }, { $set: { issuedCount } });

  console.log(`Reconciled current issued counters: ${totals.ammunition.size} ammunition records, ${totals.munition.size} munition records.`);
  console.log('No totalCount, availableCount, consumedCount or empty-case values were changed. Review legacy consumption separately.');
  await mongoose.disconnect();
}

main().catch(async error => {
  console.error('Issued-counter reconciliation failed:', error.message);
  await mongoose.disconnect().catch(() => {});
  process.exitCode = 1;
});
