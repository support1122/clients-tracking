// node utils/clientAlerts.test.mjs
//
// Guards the two rules the attention panel on Client Job Analysis renders, plus
// the boundary that keeps it trustworthy: it must stay silent for clients we do
// not owe work to, or operators learn to ignore it.
import { deriveClientAlerts, summariseAlerts, ALERT, owesWork } from './clientAlerts.js';
import { computeClientApplyStats, istDayPatterns, emptyApplyStat } from './clientApplyStats.js';

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got=${got}  want=${want}`);
};

const base = {
  status: 'active', isPaused: false, onboardingPhase: false,
  saved: 0, appliedToday: 0, daysSinceLastAdd: 0, daysSinceLastApply: 0, dailyTarget: 30,
};
const codes = (r) => deriveClientAlerts(r).map(a => a.code).join(',');
const sev = (r, code) => deriveClientAlerts(r).find(a => a.code === code)?.severity;

console.log('--- silence for clients we do not owe work to ---');
t('paused client',      codes({ ...base, isPaused: true,  daysSinceLastAdd: 5, saved: 40 }), '');
t('onboarding client',  codes({ ...base, onboardingPhase: true, daysSinceLastAdd: 5, saved: 40 }), '');
t('inactive client',    codes({ ...base, status: 'inactive', daysSinceLastAdd: 5, saved: 40 }), '');
t('owesWork active',    owesWork(base), 'true');
t('owesWork paused',    owesWork({ ...base, isPaused: true }), 'false');

console.log('\n--- NO_ADDS ---');
t('added today -> silent',    codes({ ...base, daysSinceLastAdd: 0 }), '');
t('1 day  -> warning',        sev({ ...base, daysSinceLastAdd: 1 }, ALERT.NO_ADDS), 'warning');
t('2 days -> critical',       sev({ ...base, daysSinceLastAdd: 2 }, ALERT.NO_ADDS), 'critical');
t('never added -> critical',  sev({ ...base, daysSinceLastAdd: null }, ALERT.NO_ADDS), 'critical');
t('never added wording',
  deriveClientAlerts({ ...base, daysSinceLastAdd: null }).find(a => a.code === ALERT.NO_ADDS).label,
  'No job card ever added');
t('1 day wording',
  deriveClientAlerts({ ...base, daysSinceLastAdd: 1 }).find(a => a.code === ALERT.NO_ADDS).label,
  'No jobs added in the last day');

console.log('\n--- NOT_APPLIED ---');
// Needs a backlog to act on. Zero saved is the NO_ADDS problem, not this one.
t('0 saved -> silent',            codes({ ...base, saved: 0, appliedToday: 0 }), '');
t('saved + applied -> silent',    codes({ ...base, saved: 12, appliedToday: 3 }), '');
t('saved + none today -> fires',  codes({ ...base, saved: 12, appliedToday: 0 }), ALERT.NOT_APPLIED);
t('applied yesterday -> warning', sev({ ...base, saved: 12, appliedToday: 0, daysSinceLastApply: 1 }, ALERT.NOT_APPLIED), 'warning');
t('2 days -> critical',           sev({ ...base, saved: 12, appliedToday: 0, daysSinceLastApply: 2 }, ALERT.NOT_APPLIED), 'critical');
t('beyond lookback -> critical',  sev({ ...base, saved: 12, appliedToday: 0, daysSinceLastApply: null }, ALERT.NOT_APPLIED), 'critical');
t('beyond lookback wording',
  deriveClientAlerts({ ...base, saved: 12, appliedToday: 0, daysSinceLastApply: null }).find(a => a.code === ALERT.NOT_APPLIED).detail,
  '12 job cards waiting and no application in the last 14 days.');
t('singular saved',
  deriveClientAlerts({ ...base, saved: 1, appliedToday: 0, daysSinceLastApply: 3 }).find(a => a.code === ALERT.NOT_APPLIED).detail,
  '1 job card waiting. Last application was 3 days ago.');

console.log('\n--- both at once ---');
t('two alerts', codes({ ...base, daysSinceLastAdd: 3, saved: 20, appliedToday: 0, daysSinceLastApply: 4 }),
  `${ALERT.NO_ADDS},${ALERT.NOT_APPLIED}`);

console.log('\n--- summariseAlerts ---');
{
  const rows = [
    { alerts: deriveClientAlerts({ ...base, daysSinceLastAdd: 3, saved: 20, appliedToday: 0, daysSinceLastApply: 4 }) }, // 2 crit
    { alerts: deriveClientAlerts({ ...base, daysSinceLastAdd: 1 }) },                                                    // 1 warn
    { alerts: deriveClientAlerts({ ...base }) },                                                                          // none
    { alerts: deriveClientAlerts({ ...base, isPaused: true, daysSinceLastAdd: 9 }) },                                     // none
  ];
  const s = summariseAlerts(rows);
  t('total',      s.total, 3);
  t('clients',    s.clients, 2);   // the two silent rows must not be counted
  t('critical',   s.critical, 2);
  t('no_adds',    s.byCode[ALERT.NO_ADDS], 2);
  t('not_applied',s.byCode[ALERT.NOT_APPLIED], 1);
  t('empty input', JSON.stringify(summariseAlerts([])), '{"total":0,"clients":0,"critical":0,"byCode":{"no_adds":0,"not_applied":0}}');
}

console.log('\n--- istDayPatterns: index IS the age in days ---');
{
  const NOW = Date.parse('2026-08-20T11:00:00+05:30');
  const p = istDayPatterns(3, NOW);
  t('today ymd',      p[0].ymd, '2026-08-20');
  t('yesterday ymd',  p[1].ymd, '2026-08-19');
  t('2 days ago ymd', p[2].ymd, '2026-08-18');
  // Day-first, both padded and unpadded, and "1/8" must not swallow "11/8".
  const re = new RegExp(istDayPatterns(1, Date.parse('2026-08-01T11:00:00+05:30'))[0].source);
  t('matches 1/8/2026',            re.test('1/8/2026, 3:45:12 pm'), 'true');
  t('matches 01/08/2026',          re.test('01/08/2026'), 'true');
  t('does NOT match 11/8/2026',    re.test('11/8/2026, 3:45:12 pm'), 'false');
  t('does NOT match 1/8/2027',     re.test('1/8/2027'), 'false');
  // Month-first would be a silent months-long error, so prove we reject it.
  t('does NOT match 8/1/2026',     re.test('8/1/2026'), 'false');
  // Crossing IST midnight must roll the day.
  t('00:30 IST rolls the day', istDayPatterns(1, Date.parse('2026-08-21T00:30:00+05:30'))[0].ymd, '2026-08-21');
  t('23:30 IST stays',         istDayPatterns(1, Date.parse('2026-08-20T23:30:00+05:30'))[0].ymd, '2026-08-20');
}

console.log('\n--- computeClientApplyStats derivation ---');
{
  const NOW = Date.parse('2026-08-20T11:00:00+05:30');
  const JobModel = { aggregate: () => Promise.resolve([
    { _id: 'a@x.com', appliedToday: 7, appliedLookback: 30, minDayIdx: 0 },
    { _id: ' B@X.com ', appliedToday: 0, appliedLookback: 5, minDayIdx: 3 },
  ]) };
  const m = await computeClientApplyStats({ JobModel, nowMs: NOW });
  t('applied today',        m.get('a@x.com').appliedToday, 7);
  t('same-day index 0',     m.get('a@x.com').daysSinceLastApply, 0);
  t('beyondLookback false', m.get('a@x.com').beyondLookback, 'false');
  t('email normalised',     !!m.get('b@x.com'), 'true');
  t('3 days ago',           m.get('b@x.com').daysSinceLastApply, 3);
  t('lastAppliedYmd',       m.get('b@x.com').lastAppliedYmd, '2026-08-17');
  t('absent client -> undefined', m.get('zzz@x.com'), 'undefined');
  const e = emptyApplyStat();
  t('empty beyondLookback', e.beyondLookback, 'true');
  t('empty days null',      e.daysSinceLastApply, 'null');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
