/**
 * READ-ONLY diagnostic: how many job cards were added per operator day.
 *
 *   node scripts/check-add-rate.mjs [days]
 *
 * Answers "has anything actually been added?" without trusting dateAdded,
 * which is written in mixed day-first/month-first orientations and cannot be
 * bucketed by day. Buckets on ObjectId creation time instead, against the same
 * 22:00 IST window the push cap and the shortfall report use.
 *
 * Reads MONGODB_URI from the environment (or from .env if dotenv is loaded by
 * your shell). Performs no writes of any kind.
 */

import mongoose from 'mongoose';
import { addWindowStartNBack, objectIdAt, addWindowDayStamp } from '../utils/addWindow.js';

const DAYS = Math.min(Math.max(parseInt(process.argv[2], 10) || 14, 1), 90);

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI is not set. Export it first, e.g.\n  export $(grep -m1 ^MONGODB_URI .env)');
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
const jobs = mongoose.connection.db.collection('jobdbs');

const since = addWindowStartNBack(DAYS);
const lowId = objectIdAt(since);

// Bucket by window rather than by calendar day: shift the creation time back by
// 22 hours so a window that opens at 22:00 IST lands wholly inside one label.
const WINDOW_SHIFT_MS = -22 * 60 * 60 * 1000;

const rows = await jobs.aggregate([
  { $match: { _id: { $gte: lowId } } },
  {
    $addFields: {
      _window: {
        $dateToString: {
          format: '%Y-%m-%d',
          date: { $add: [{ $toDate: '$_id' }, WINDOW_SHIFT_MS] },
          timezone: 'Asia/Kolkata',
        },
      },
    },
  },
  {
    $group: {
      _id: { window: '$_window', role: { $ifNull: ['$createdByRole', '(unset)'] } },
      jobs: { $sum: 1 },
      clients: { $addToSet: '$userID' },
      operators: { $addToSet: '$operatorEmail' },
    },
  },
  {
    $project: {
      _id: 0,
      window: '$_id.window',
      role: '$_id.role',
      jobs: 1,
      clients: { $size: '$clients' },
      operators: { $size: '$operators' },
    },
  },
  { $sort: { window: -1, role: 1 } },
], { allowDiskUse: true }).toArray();

console.log(`Add window currently open: ${addWindowDayStamp()} (opens 22:00 IST)\n`);
console.log('window      role          jobs  clients  operators');
console.log('----------  ------------  ----  -------  ---------');
for (const r of rows) {
  console.log(
    `${r.window}  ${String(r.role).padEnd(12)}  ${String(r.jobs).padStart(4)}  ` +
    `${String(r.clients).padStart(7)}  ${String(r.operators).padStart(9)}`
  );
}
if (!rows.length) console.log(`(nothing added in the last ${DAYS} windows)`);

// A silent day is not always slacking. These three refuse every push without
// the operator necessarily reporting it, so rule them out before drawing
// conclusions about anyone's effort.
const newest = await jobs
  .find({}, { projection: { _id: 1, userID: 1, operatorEmail: 1, createdByRole: 1, currentStatus: 1 } })
  .sort({ _id: -1 })
  .limit(5)
  .toArray();
console.log('\nMost recent 5 job cards:');
for (const d of newest) {
  console.log(`  ${d._id.getTimestamp().toISOString()}  role=${d.createdByRole ?? '(unset)'}  client=${d.userID}  op=${d.operatorEmail}`);
}
console.log(
  '\nIf adds stopped abruptly, check these before assuming under-delivery:\n' +
  '  1. Lifetime plan cap reached — PLAN_CAPS in dailyCapGuard.js (prime 160, ignite 250,\n' +
  '     professional 500, executive 1200). Every push 403s with PLAN_LIMIT_REACHED.\n' +
  '  2. CAP_CHECK_FAILED — the cap guard fails CLOSED, so a Mongo blip refuses all pushes.\n' +
  '  3. Expired extension session keys (Operations.sessionKeys[].expiresAt).'
);

await mongoose.disconnect();
