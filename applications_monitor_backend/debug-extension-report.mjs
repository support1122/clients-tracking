import 'dotenv/config';
import mongoose from 'mongoose';
import { JobModel } from './JobModel.js';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);

  const latestRows = await JobModel.find({ addedBy: { $nin: [null, ''] } })
    .select('dateAdded createdAt addedBy userID jobTitle')
    .sort({ _id: -1 })
    .limit(12)
    .lean();

  const totalWithAdder = await JobModel.countDocuments({ addedBy: { $nin: [null, ''] } });
  const grouped = await JobModel.aggregate([
    { $match: { addedBy: { $nin: [null, ''] } } },
    {
      $addFields: {
        dayKey: {
          $let: {
            vars: {
              parts: {
                $regexFind: {
                  input: '$dateAdded',
                  regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})/,
                },
              },
            },
            in: {
              $cond: [
                { $ne: ['$$parts', null] },
                {
                  $concat: [
                    { $arrayElemAt: ['$$parts.captures', 2] },
                    '-',
                    { $cond: [{ $lt: [{ $toInt: { $arrayElemAt: ['$$parts.captures', 1] } }, 10] }, '0', ''] },
                    { $arrayElemAt: ['$$parts.captures', 1] },
                    '-',
                    { $cond: [{ $lt: [{ $toInt: { $arrayElemAt: ['$$parts.captures', 0] } }, 10] }, '0', ''] },
                    { $arrayElemAt: ['$$parts.captures', 0] },
                  ],
                },
                null,
              ],
            },
          },
        },
      },
    },
    { $match: { dayKey: { $gte: '2026-03-24', $lte: '2026-03-30' } } },
    { $group: { _id: '$dayKey', count: { $sum: 1 }, operators: { $addToSet: '$addedBy' } } },
    { $sort: { _id: 1 } },
  ]).allowDiskUse(true);

  console.log(JSON.stringify({ totalWithAdder, grouped, latestRows }, null, 2));
  await mongoose.disconnect();
}

run().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
