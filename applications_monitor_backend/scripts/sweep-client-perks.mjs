/**
 * Withdraw Upgrade and Refer n Earn from dormant clients, or preview which ones
 * would lose them.
 *
 *   node scripts/sweep-client-perks.mjs            # DRY RUN, writes nothing
 *   node scripts/sweep-client-perks.mjs --apply    # writes perksDisabledAt
 *
 * A client is dormant when their tracking status is "inactive" AND no job card
 * has been applied or added for them in the last 14 days. See
 * utils/clientPerks.js for why activity is the looser of the two definitions.
 *
 * THE FLAG IS WRITE-ONCE. Nothing in this repo clears perksDisabledAt, so
 * --apply is not reversible by any code path here; undoing it means clearing the
 * field by hand. Run the dry run first and read the list.
 *
 * The daily cron in index.js does exactly the same thing at 3:30 AM IST. This
 * script exists for the first run against production and for spot checks.
 *
 * Reads MONGODB_URI from the environment.
 */

import mongoose from 'mongoose';
import { ClientModel } from '../ClientModel.js';
import { JobModel } from '../JobModel.js';
import { sweepDormantClientPerks, PERKS_DORMANT_DAYS } from '../utils/clientPerks.js';

const APPLY = process.argv.includes('--apply');

const uri = process.env.MONGODB_URI;
if (!uri) {
     console.error('MONGODB_URI is not set. Export it first, e.g.\n  export $(grep -m1 ^MONGODB_URI .env)');
     process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });

console.log(
     `${APPLY ? 'APPLYING' : 'DRY RUN'}: inactive clients with no add and no apply ` +
     `in ${PERKS_DORMANT_DAYS} days\n`,
);

const res = await sweepDormantClientPerks({ ClientModel, JobModel, apply: APPLY });

console.log(`inactive clients not already flagged : ${res.scanned}`);
console.log(`still had activity, left alone       : ${res.skippedActive.length}`);
console.log(`dormant, perks withdrawn             : ${res.flagged.length}\n`);

if (res.flagged.length) {
     console.log(APPLY ? 'Withdrawn from:' : 'Would withdraw from:');
     for (const e of res.flagged) console.log(`  ${e}`);
     console.log('');
}

if (!APPLY && res.flagged.length) {
     console.log('Nothing was written. Re-run with --apply to commit this list.');
     console.log('Reminder: there is no code path that undoes it.');
}

await mongoose.disconnect();
