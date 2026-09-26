import test from 'node:test';
import assert from 'node:assert/strict';

import {
     PERKS_DORMANT_DAYS,
     PERKS_REASON_DORMANT,
     isInactiveStatus,
     perksDisabled,
     shouldDisablePerks,
     sweepDormantClientPerks,
} from './clientPerks.js';

// ── The rule ────────────────────────────────────────────────────────────────

test('inactive with no activity is flagged', () => {
     assert.equal(shouldDisablePerks({ status: 'inactive', activeInLookback: false }), true);
});

test('inactive but still worked on is NOT flagged', () => {
     // The loose definition of activity earning its keep: a stale status field
     // must not lock out a client whose operator is still adding cards.
     assert.equal(shouldDisablePerks({ status: 'inactive', activeInLookback: true }), false);
});

test('active client is never flagged, however quiet', () => {
     assert.equal(shouldDisablePerks({ status: 'active', activeInLookback: false }), false);
});

test('an already-flagged client is not re-stamped', () => {
     // Re-stamping would overwrite the date it actually happened, destroying the
     // only record of when the client lost the perks.
     const at = new Date('2026-01-01T00:00:00Z');
     assert.equal(shouldDisablePerks({ status: 'inactive', activeInLookback: false, perksDisabledAt: at }), false);
});

test('status is matched case- and whitespace-insensitively', () => {
     for (const status of ['inactive', 'Inactive', 'INACTIVE', '  inactive  ']) {
          assert.equal(isInactiveStatus(status), true, status);
          assert.equal(shouldDisablePerks({ status, activeInLookback: false }), true, status);
     }
     for (const status of ['active', 'Active', '', null, undefined, 'paused']) {
          assert.equal(isInactiveStatus(status), false, String(status));
          assert.equal(shouldDisablePerks({ status, activeInLookback: false }), false, String(status));
     }
});

test('paused is not inactive', () => {
     // isPaused is a separate field. A paused client is still a live account and
     // keeps the buttons.
     assert.equal(shouldDisablePerks({ status: 'active', activeInLookback: false, isPaused: true }), false);
});

// ── The accessor ────────────────────────────────────────────────────────────

test('perksDisabled reads the presence of the date', () => {
     assert.equal(perksDisabled({ perksDisabledAt: new Date() }), true);
     assert.equal(perksDisabled({ perksDisabledAt: null }), false);
     assert.equal(perksDisabled({}), false);
     assert.equal(perksDisabled(null), false);
     assert.equal(perksDisabled(undefined), false);
});

test('the window is the 14 days that were asked for', () => {
     assert.equal(PERKS_DORMANT_DAYS, 14);
     assert.equal(PERKS_REASON_DORMANT, 'inactive_no_activity_14d');
});

// ── The sweep, against fakes ────────────────────────────────────────────────

/**
 * Minimal stand-ins. The sweep's own queries are exercised for shape, and the
 * decision is delegated to shouldDisablePerks, which is covered above.
 */
function fakeClientModel(rows) {
     const updates = [];
     return {
          updates,
          find: () => ({
               lean: async () => rows.filter((r) => /^inactive$/i.test(String(r.status || '')) && !r.perksDisabledAt),
          }),
          updateMany: async (filter, update) => {
               updates.push({ filter, update });
               return { modifiedCount: filter?.email?.$in?.length || 0 };
          },
     };
}

function fakeJobModel({ addedBy = [], appliedBy = [] } = {}) {
     let call = 0;
     return {
          aggregate: async () => {
               call += 1;
               // First call is the adds query, second is the applies query.
               const src = call === 1 ? addedBy : appliedBy;
               return src.map((e) => ({ _id: e }));
          },
     };
}

test('sweep flags only the dormant inactive clients', async () => {
     const ClientModel = fakeClientModel([
          { email: 'dormant@x.com', status: 'inactive', perksDisabledAt: null },
          { email: 'busy@x.com', status: 'inactive', perksDisabledAt: null },
          { email: 'live@x.com', status: 'active', perksDisabledAt: null },
          { email: 'already@x.com', status: 'inactive', perksDisabledAt: new Date() },
     ]);
     const JobModel = fakeJobModel({ addedBy: ['busy@x.com'], appliedBy: [] });

     const res = await sweepDormantClientPerks({ ClientModel, JobModel });

     assert.deepEqual(res.flagged, ['dormant@x.com']);
     assert.deepEqual(res.skippedActive, ['busy@x.com']);
     // 'live@x.com' is active and 'already@x.com' is flagged, so neither is even
     // a candidate: the find() filter drops them before the rule runs.
     assert.equal(res.scanned, 2);
     assert.equal(ClientModel.updates.length, 1);
     assert.deepEqual(ClientModel.updates[0].filter.email.$in, ['dormant@x.com']);
     assert.equal(ClientModel.updates[0].update.$set.perksDisabledReason, PERKS_REASON_DORMANT);
     assert.ok(ClientModel.updates[0].update.$set.perksDisabledAt instanceof Date);
});

test('an apply alone counts as activity', async () => {
     const ClientModel = fakeClientModel([
          { email: 'applied@x.com', status: 'inactive', perksDisabledAt: null },
     ]);
     const JobModel = fakeJobModel({ addedBy: [], appliedBy: ['applied@x.com'] });

     const res = await sweepDormantClientPerks({ ClientModel, JobModel });
     assert.deepEqual(res.flagged, []);
     assert.deepEqual(res.skippedActive, ['applied@x.com']);
     assert.equal(ClientModel.updates.length, 0);
});

test('the update filter re-checks perksDisabledAt, so a race cannot overwrite a date', async () => {
     const ClientModel = fakeClientModel([
          { email: 'dormant@x.com', status: 'inactive', perksDisabledAt: null },
     ]);
     const JobModel = fakeJobModel();
     await sweepDormantClientPerks({ ClientModel, JobModel });
     assert.equal(ClientModel.updates[0].filter.perksDisabledAt, null);
});

test('dry run decides but writes nothing', async () => {
     const ClientModel = fakeClientModel([
          { email: 'dormant@x.com', status: 'inactive', perksDisabledAt: null },
     ]);
     const JobModel = fakeJobModel();

     const res = await sweepDormantClientPerks({ ClientModel, JobModel, apply: false });
     assert.deepEqual(res.flagged, ['dormant@x.com']);
     assert.equal(res.applied, false);
     assert.equal(ClientModel.updates.length, 0);
});

test('no candidates means no job queries at all', async () => {
     const ClientModel = fakeClientModel([{ email: 'live@x.com', status: 'active' }]);
     const JobModel = { aggregate: async () => { throw new Error('should not be queried'); } };

     const res = await sweepDormantClientPerks({ ClientModel, JobModel });
     assert.equal(res.scanned, 0);
     assert.deepEqual(res.flagged, []);
});

test('a candidate with a junk email is skipped rather than flagged', async () => {
     const ClientModel = fakeClientModel([
          { email: '', status: 'inactive', perksDisabledAt: null },
          { email: 'dormant@x.com', status: 'inactive', perksDisabledAt: null },
     ]);
     const JobModel = fakeJobModel();

     const res = await sweepDormantClientPerks({ ClientModel, JobModel });
     assert.deepEqual(res.flagged, ['dormant@x.com']);
});
