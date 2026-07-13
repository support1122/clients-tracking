// node utils/analysisCachePolicy.test.mjs
//
// Guards two things that are invisible until they bite:
//   * a cached removedByAI must never be served on a different IST day
//   * an operator Refresh must never be answered from the stale cache
import { istDayStamp, decideAnalysisCacheAction } from './analysisCachePolicy.js';

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got=${got}  want=${want}`);
};

const TODAY = '2026-07-10';
const YDAY = '2026-07-09';
const val = (istDay) => ({ istDay, rows: [] });
const decide = (o) => decideAnalysisCacheAction({ istDay: TODAY, ...o });

console.log('--- istDayStamp (IST = UTC+5:30) ---');
t('23:30 IST -> that day', istDayStamp(Date.parse('2026-07-10T18:00:00Z')), '2026-07-10');
t('00:01 IST -> next day', istDayStamp(Date.parse('2026-07-10T18:31:00Z')), '2026-07-11');
t('05:29 UTC same IST day', istDayStamp(Date.parse('2026-07-10T05:29:00Z')), '2026-07-10');

console.log('\n--- normal load (no Refresh) ---');
t('L1 same day                     -> l1',       decide({ memHit: val(TODAY) }), 'l1');
t('L2 fresh, same day              -> l2-fresh', decide({ entry: { val: val(TODAY), fresh: true } }), 'l2-fresh');
t('L2 stale, same day              -> l2-stale', decide({ entry: { val: val(TODAY), fresh: false } }), 'l2-stale');
t('cold miss                       -> compute',  decide({}), 'compute');

console.log('\n--- the midnight bug: cached "today" from yesterday ---');
t('L1 from YESTERDAY               -> compute',  decide({ memHit: val(YDAY) }), 'compute');
t('L2 FRESH but from YESTERDAY     -> compute',  decide({ entry: { val: val(YDAY), fresh: true } }), 'compute');
t('L2 stale and from YESTERDAY     -> compute',  decide({ entry: { val: val(YDAY), fresh: false } }), 'compute');
t('L1 yesterday + L2 fresh today   -> l2-fresh', decide({ memHit: val(YDAY), entry: { val: val(TODAY), fresh: true } }), 'l2-fresh');
t('legacy entry with no istDay     -> compute',  decide({ entry: { val: { rows: [] }, fresh: true } }), 'compute');

console.log('\n--- operator Refresh (refresh: true) ---');
t('Refresh ignores L1                    -> compute',  decide({ forceFresh: true, memHit: val(TODAY) }), 'compute');
t('Refresh reuses a FRESH L2 (<=120s)    -> l2-fresh', decide({ forceFresh: true, entry: { val: val(TODAY), fresh: true } }), 'l2-fresh');
t('Refresh REFUSES a stale L2            -> compute',  decide({ forceFresh: true, entry: { val: val(TODAY), fresh: false } }), 'compute');
t('Refresh on yesterday-fresh L2         -> compute',  decide({ forceFresh: true, entry: { val: val(YDAY), fresh: true } }), 'compute');

console.log('\n--- the pre-fix behaviour these replace ---');
console.log('  old: stale L2 of ANY age was served on Refresh, then refreshed in the background');
console.log('  old: a fresh L2 computed at 23:59 IST answered requests until 00:01 IST');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
