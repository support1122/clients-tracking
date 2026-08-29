// The saved-count rule, locked down.
//
// `currentStatus` is free text: the dashboard stamps an attribution suffix
// every time someone moves a card ("saved by user", "applied by sonali", and
// through repeated moves even "applied by sarah by sarah"). Counting saved
// jobs with `currentStatus: 'saved'` therefore matched only the untouched
// cards - the monitor showed 3 where the client's own Job Tracker showed 19.
//
// The rule below must stay identical to the two other places that bucket the
// same field:
//   flashfire-dashboard-backend  Utils/clientActivityStats.js  /^saved/i
//   flashfire-dashboard-frontend JobTracker.tsx                startsWith('saved')
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// Read the live constant out of index.js rather than restating it, so this
// test fails if someone edits the rule in the server.
const src = readFileSync(new URL("../index.js", import.meta.url), "utf8");
const m = src.match(/const SAVED_STATUS_RE = (\/.+\/[a-z]*);/);
assert.ok(m, "SAVED_STATUS_RE must exist in index.js");
const SAVED_STATUS_RE = eval(m[1]);

test("counts saved cards that carry an attribution suffix", () => {
  for (const s of ["saved", "Saved", "saved by user", "saved by sarah", "saved by sohith"]) {
    assert.ok(SAVED_STATUS_RE.test(s), `should count "${s}" as saved`);
  }
});

test("does not swallow other columns", () => {
  for (const s of ["applied", "applied by sonali", "deleted", "deleted by user",
                   "interviewing by user", "offer received", "rejected by sarah",
                   "applied by sarah by sarah"]) {
    assert.equal(SAVED_STATUS_RE.test(s), false, `"${s}" must not count as saved`);
  }
});

test("is anchored - a status merely mentioning saved does not count", () => {
  assert.equal(SAVED_STATUS_RE.test("removed from saved"), false);
  assert.equal(SAVED_STATUS_RE.test("unsaved"), false);
});

test("matches the dashboard frontend's startsWith('saved') bucketing", () => {
  const frontend = (s) => String(s || "").startsWith("saved");
  for (const s of ["saved", "saved by user", "applied", "deleted by user", "offer"]) {
    assert.equal(SAVED_STATUS_RE.test(s), frontend(s), `disagreement on "${s}"`);
  }
});

test("no exact-equality status comparisons crept back into the server", () => {
  assert.equal(/currentStatus: *['"][a-z]/.test(src), false,
    "compare currentStatus with a regex, never === - it carries an attribution suffix");
});
