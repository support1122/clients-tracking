// node utils/clientAddStats.test.mjs
//
// Guards the derivation that the shortfall report and the Client Job Analysis
// "Added" columns both read from. Models are stubbed, so no Mongo is needed.
import { computeClientAddStats, emptyAddStat } from './clientAddStats.js';
import { addWindowStart, addWindowStartNBack } from './addWindow.js';

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got=${got}  want=${want}`);
};

const NOW = Date.parse('2026-08-20T21:00:00+05:30');   // window opened 22:00 IST Aug 19

// Stub models. aggregate() returns whatever the fixture says, but the pipeline
// is captured so the shape can be asserted too.
const captured = [];
const makeJobModel = (windowed, lastAdds) => ({
  aggregate: (pipeline) => {
    captured.push(pipeline);
    // The windowed pipeline is the one carrying an _id range bound.
    const isWindowed = JSON.stringify(pipeline).includes('addedToday');
    return Promise.resolve(isWindowed ? windowed : lastAdds);
  },
});
const makeProfileModel = (docs) => ({ find: () => ({ lean: () => Promise.resolve(docs) }) });

const run = (windowed, lastAdds, profiles) => computeClientAddStats({
  JobModel: makeJobModel(windowed, lastAdds),
  ProfileModel: makeProfileModel(profiles),
  nowMs: NOW,
});

const oid = (d) => ({ getTimestamp: () => d });

console.log('--- derivation ---');
{
  const m = await run(
    [{ _id: 'a@x.com', addedToday: 4, addedYesterday: 28, addedPrev7Total: 140, todayOperators: ['Priya', null, ''] }],
    [{ _id: 'a@x.com', lastAddId: oid(new Date(Date.parse('2026-08-20T15:00:00+05:30'))) }],
    [{ email: 'a@x.com', targetJobCount: 30 }],
  );
  const r = m.get('a@x.com');
  t('addedToday',        r.addedToday, 4);
  t('addedYesterday',    r.addedYesterday, 28);
  t('added7dAvg',        r.added7dAvg, 20);       // 140/7
  t('dailyTarget',       r.dailyTarget, 30);
  t('addShortfall',      r.addShortfall, 26);
  t('addFulfillmentPct', r.addFulfillmentPct, 13); // round(4/30*100)
  t('isUnderTarget',     r.isUnderTarget, 'true');
  t('daysSinceLastAdd',  r.daysSinceLastAdd, 0);
  t('operators cleaned', JSON.stringify(r.todayOperators), '["Priya"]');
}

console.log('\n--- target met exactly is NOT under target ---');
{
  const m = await run(
    [{ _id: 'b@x.com', addedToday: 30, addedYesterday: 0, addedPrev7Total: 0, todayOperators: [] }],
    [], [{ email: 'b@x.com', targetJobCount: 30 }],
  );
  const r = m.get('b@x.com');
  t('30/30 not under',   r.isUnderTarget, 'false');
  t('30/30 shortfall 0', r.addShortfall, 0);
  t('30/30 pct 100',     r.addFulfillmentPct, 100);
}

console.log('\n--- a client with NO windowed row is the loudest case ---');
// Added nothing for 7+ days: no row in the windowed aggregation at all. Dropping
// them would hide exactly the clients the report exists to surface.
{
  const lastAdd = new Date(Date.parse('2026-08-14T11:00:00+05:30'));
  const m = await run([], [{ _id: 'c@x.com', lastAddId: oid(lastAdd) }], [{ email: 'c@x.com', targetJobCount: 45 }]);
  const r = m.get('c@x.com');
  t('present despite no window row', !!r, 'true');
  t('addedToday 0',        r.addedToday, 0);
  t('shortfall = target',  r.addShortfall, 45);
  t('daysSinceLastAdd 6',  r.daysSinceLastAdd, 6);
  t('isUnderTarget',       r.isUnderTarget, 'true');
}

console.log('\n--- a client who has NEVER had a job added ---');
{
  const m = await run([], [], [{ email: 'd@x.com', targetJobCount: null }]);
  const r = m.get('d@x.com');
  t('present from profile',  !!r, 'true');
  t('target falls back to 30', r.dailyTarget, 30);
  t('isDefaultTarget',       r.isDefaultTarget, 'true');
  t('daysSinceLastAdd null', r.daysSinceLastAdd, 'null');  // never, not "very long ago"
  t('lastAddedAt null',      r.lastAddedAt, 'null');
}

console.log('\n--- a typo target of 0 must not disable the target ---');
{
  const m = await run([{ _id: 'e@x.com', addedToday: 1, addedYesterday: 0, addedPrev7Total: 0, todayOperators: [] }], [], [{ email: 'e@x.com', targetJobCount: 0 }]);
  const r = m.get('e@x.com');
  t('target 0 -> 30',   r.dailyTarget, 30);
  t('still under',      r.isUnderTarget, 'true');
}

console.log('\n--- email case and whitespace must not split a client ---');
{
  const m = await run(
    [{ _id: 'f@x.com', addedToday: 5, addedYesterday: 0, addedPrev7Total: 0, todayOperators: [] }],
    [], [{ email: '  F@X.com ', targetJobCount: 20 }],
  );
  t('one row only',  m.size, 1);
  t('keyed lowercase', m.get('f@x.com').dailyTarget, 20);
}

console.log('\n--- pipeline shape ---');
{
  captured.length = 0;
  await run([], [], []);
  const windowed = captured.find((p) => JSON.stringify(p).includes('addedToday'));
  const lastAdd  = captured.find((p) => JSON.stringify(p).includes('lastAddId'));
  t('windowed matches ops only', JSON.stringify(windowed[0].$match.createdByRole), '"operations"');
  t('windowed has _id lower bound', !!windowed[0].$match._id?.$gte, 'true');
  // The lower bound MUST be the 7-windows-back boundary, not today: the average
  // needs the history, and a bound of "today" would silently zero it.
  t('lower bound = 7 windows back',
    windowed[0].$match._id.$gte.getTimestamp().toISOString(),
    addWindowStartNBack(7, NOW).toISOString());
  // Last-add is deliberately UNBOUNDED. A range bound here would report a client
  // silent for 30 days identically to one silent for 8.
  t('last-add is unbounded', lastAdd[0].$match._id === undefined, 'true');
}

console.log('\n--- emptyAddStat ---');
{
  const e = emptyAddStat(50);
  t('empty target',    e.dailyTarget, 50);
  t('empty shortfall', e.addShortfall, 50);
  t('empty under',     e.isUnderTarget, 'true');
  t('empty days null', e.daysSinceLastAdd, 'null');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
