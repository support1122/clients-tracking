// node utils/addWindow.test.mjs
//
// Boundary checks for the 22:00 IST add window and windowsSince(), which feeds
// the "No jobs added for N days" alert.
import { addWindowStart, windowsSince } from './addWindow.js';

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got=${got}  want=${want}`);
};
const ist = (s) => Date.parse(`${s}+05:30`);
const DAY = 24 * 60 * 60 * 1000;

console.log('--- addWindowStart ---');
t('10:00 IST -> opened 22:00 IST the day before',
  addWindowStart(ist('2026-08-20T10:00:00')).toISOString(), new Date(ist('2026-08-19T22:00:00')).toISOString());
t('21:59:59 IST -> still yesterday 22:00',
  addWindowStart(ist('2026-08-20T21:59:59')).toISOString(), new Date(ist('2026-08-19T22:00:00')).toISOString());
t('22:00:00 IST -> new window',
  addWindowStart(ist('2026-08-20T22:00:00')).toISOString(), new Date(ist('2026-08-20T22:00:00')).toISOString());
t('23:30 IST -> opened 22:00 same IST day',
  addWindowStart(ist('2026-08-20T23:30:00')).toISOString(), new Date(ist('2026-08-20T22:00:00')).toISOString());

console.log('\n--- windowsSince ---');
const NOW = ist('2026-08-20T10:00:00');            // open window began 2026-08-19 22:00 IST
const start = addWindowStart(NOW).getTime();
t('null -> null',                          windowsSince(null, NOW), 'null');
t('add at 09:00 today -> 0',               windowsSince(new Date(ist('2026-08-20T09:00:00')), NOW), 0);
t('add at 23:00 IST yesterday -> 0 (open window)', windowsSince(new Date(ist('2026-08-19T23:00:00')), NOW), 0);
t('add at exactly window open -> 0',       windowsSince(new Date(start), NOW), 0);
t('add 1ms before window open -> 1',       windowsSince(new Date(start - 1), NOW), 1);
t('add at 21:59 IST yesterday -> 1',       windowsSince(new Date(ist('2026-08-19T21:59:00')), NOW), 1);
t('add exactly one window back -> 1 (was 2)', windowsSince(new Date(start - DAY), NOW), 1);
t('add 1ms past one window back -> 2',     windowsSince(new Date(start - DAY - 1), NOW), 2);
t('add exactly three windows back -> 3',   windowsSince(new Date(start - 3 * DAY), NOW), 3);
// 22:30 IST: the window just rolled, a 23:00 add from the previous night is now 1 back.
const LATE = ist('2026-08-20T22:30:00');
t('22:30 IST, add 23:00 previous night -> 1', windowsSince(new Date(ist('2026-08-19T23:00:00')), LATE), 1);
t('22:30 IST, add 22:10 tonight -> 0',         windowsSince(new Date(ist('2026-08-20T22:10:00')), LATE), 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
