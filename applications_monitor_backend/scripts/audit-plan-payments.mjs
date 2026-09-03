/**
 * READ-ONLY diagnostic: where does a client's plan disagree with their payment?
 *
 *   node scripts/audit-plan-payments.mjs          # report only
 *   node scripts/audit-plan-payments.mjs --json   # machine-readable
 *
 * Three records have to agree about a client's plan and they are written by
 * different code paths:
 *
 *   dashboardtrackings.planType   the PLAN badge in Client Job Analysis
 *   dashboardtrackings.planPrice  the payment for that plan, same document
 *   users.planType                what the application cap is enforced from
 *
 * Uses planPaymentMismatch() from utils/planCaps.js, the same function the API
 * and the screen use, so the audit and the UI can never disagree about what
 * counts as a mismatch.
 *
 * Reads MONGODB_URI from the environment. Performs no writes of any kind.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import {
  PLAN_PRICES,
  PLAN_CAPS,
  normalisePlanType,
  planPaymentMismatch,
} from '../utils/planCaps.js';

const JSON_OUT = process.argv.includes('--json');

// MONGODB_URI from the environment, else the backend's own .env — the value
// there is quoted, so strip the quotes rather than making the caller do it.
function resolveUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI.trim().replace(/^["']|["']$/g, '');
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  if (!fs.existsSync(envPath)) return '';
  const line = fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.startsWith('MONGODB_URI=') && !l.startsWith('#'));
  return line ? line.slice('MONGODB_URI='.length).trim().replace(/^["']|["']$/g, '') : '';
}

const uri = resolveUri();
if (!uri) {
  console.error('No MONGODB_URI in the environment or in applications_monitor_backend/.env');
  process.exit(1);
}

await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
const db = mongoose.connection.db;

const lc = (v) => String(v || '').trim().toLowerCase();

const tracking = await db.collection('dashboardtrackings').find({}, {
  projection: {
    email: 1, name: 1, clientNumber: 1, status: 1,
    planType: 1, planPrice: 1, amountPaid: 1, upgradePayments: 1, addons: 1,
  },
}).toArray();

const users = await db.collection('users').find({}, {
  projection: { email: 1, planType: 1, planLimit: 1 },
}).toArray();

const userByEmail = new Map(users.map((u) => [lc(u.email), u]));

const findings = {
  /** planType vs planPrice / upgradePayments on the SAME document. */
  paymentMismatch: [],
  /** The badge and the enforced application cap come from different plans. */
  capMismatch: [],
  /** A tracking row with no users row — nothing enforces a cap for them. */
  noUserRecord: [],
  /** A plan value no consumer can read. */
  unknownPlan: [],
};

for (const t of tracking) {
  const email = lc(t.email);
  const row = {
    email,
    n: t.clientNumber ?? null,
    name: t.name || '',
    status: t.status || '',
    planType: t.planType || '',
    planPrice: t.planPrice ?? null,
  };

  const key = normalisePlanType(t.planType);
  if (!key) {
    findings.unknownPlan.push(row);
    continue; // every other check needs a readable plan
  }

  const reason = planPaymentMismatch(t);
  if (reason) findings.paymentMismatch.push({ ...row, reason, expected: PLAN_PRICES[key] });

  const u = userByEmail.get(email);
  if (!u) {
    findings.noUserRecord.push(row);
  } else {
    const userKey = normalisePlanType(u.planType);
    if (userKey !== key) {
      findings.capMismatch.push({
        ...row,
        userPlan: u.planType || '(none)',
        badgeCap: PLAN_CAPS[key],
        enforcedCap: u.planLimit > 0 ? `${u.planLimit} (planLimit override)` : (userKey ? PLAN_CAPS[userKey] : 'uncapped'),
      });
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify({
    scanned: { tracking: tracking.length, users: users.length },
    counts: Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.length])),
    findings,
  }, null, 2));
} else {
  const section = (title, rows, render) => {
    console.log(`\n=== ${title}: ${rows.length} ===`);
    rows.slice(0, 40).forEach((r) => console.log('  ' + render(r)));
    if (rows.length > 40) console.log(`  … ${rows.length - 40} more (use --json for all)`);
  };

  console.log(`db: ${db.databaseName}`);
  console.log(`dashboardtrackings: ${tracking.length}   users: ${users.length}`);

  section(
    'A. Plan disagrees with the payment on the same document',
    findings.paymentMismatch,
    (r) => `${r.n ?? '?'} ${r.email} — ${r.reason}`,
  );
  section(
    'B. Badge plan != users plan (the cap actually enforced)',
    findings.capMismatch,
    (r) => `${r.n ?? '?'} ${r.email} — badge ${r.planType} (${r.badgeCap}) vs user ${r.userPlan} (${r.enforcedCap})`,
  );
  section(
    'C. Tracking row with no users record',
    findings.noUserRecord,
    (r) => `${r.n ?? '?'} ${r.email} — ${r.planType} [${r.status}]`,
  );
  section(
    'D. Plan value nothing can read',
    findings.unknownPlan,
    (r) => `${r.n ?? '?'} ${r.email} — planType=${JSON.stringify(r.planType)}`,
  );

  const dist = (rows, key) => rows.reduce((m, r) => {
    const k = lc(r[key]) || '(empty)';
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});
  console.log('\ntracking.planType:', JSON.stringify(dist(tracking, 'planType')));
  console.log('users.planType   :', JSON.stringify(dist(users, 'planType')));
  const total = Object.values(findings).reduce((n, v) => n + v.length, 0);
  console.log(`\n${total === 0 ? 'No mismatches.' : `${total} row(s) need attention.`}`);
}

await mongoose.disconnect();
