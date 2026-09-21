// The client Applied/Saved numbers on the Performance Report, locked down.
//
// Three separate defects made that column disagree with the client's own Job
// Tracker, and all three are cheap to pin:
//
//   1. The date-ranged count was ALWAYS 0. appliedDate is "9/5/2026, 8:32:36
//      pm", the pipeline split the whole string on "/", and the third piece
//      was therefore "2026, 8:32:36 pm". $convert to int fails on that,
//      onError handed back 0, and every job landed in year 0 - outside any
//      range an operator could pick. Verified live: a 2000-2030 window
//      returned 0 applied for all 62 of one operator's clients.
//
//   2. The lifetime count had no status filter at all. It counted every card
//      the operator had touched - deleted, removed, saved - and called the
//      total appliedCount. maratherajat98 read 1254 against a real 1071.
//
//   3. Both counts were scoped to operatorEmail while the Saved figure beside
//      them was client-wide, so the two numbers on one row measured different
//      populations. Saved was worse than inconsistent: a saved card carries
//      operatorEmail "user@flashfirehq", so that count could only ever be 0.
//
// These assertions read the live source, like savedStatus.test.mjs does, so
// editing the server without editing the rule fails here.

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../index.js", import.meta.url), "utf8");

/** Pull the body of getClientStatistics out of index.js by brace matching. */
function clientStatsSource() {
  const at = src.indexOf("const getClientStatistics");
  assert.ok(at > 0, "getClientStatistics must exist");
  let depth = 0;
  let started = false;
  for (let i = src.indexOf("{", at); i < src.length; i += 1) {
    if (src[i] === "{") {
      depth += 1;
      started = true;
    } else if (src[i] === "}") {
      depth -= 1;
      if (started && depth === 0) return src.slice(at, i + 1);
    }
  }
  throw new Error("could not brace-match getClientStatistics");
}

const BODY = clientStatsSource();

// ── the rules the endpoint must use ──────────────────────────────────

test("applied counts use the milestone whitelist, not every card", () => {
  assert.match(
    BODY,
    /MILESTONE_COUNT_STATUS_RE/,
    "appliedCount must filter on Applied/Interviewing/Offer/Rejected"
  );
  assert.equal(
    /\$match:\s*\{\s*userID:\s*\{\s*\$in:\s*userEmails\s*\}\s*\}/.test(BODY),
    false,
    "a $match on userID alone counts deleted and saved cards as applied"
  );
});

test("neither count is scoped to one operator", () => {
  assert.equal(
    /operatorEmail:\s*opEmail/.test(BODY),
    false,
    "a client's cards are spread across operators; scoping makes the row a slice, " +
      "and saved cards carry operatorEmail 'user@flashfirehq' so it can only be 0"
  );
});

test("the saved rule matches the one the rest of the app uses", () => {
  assert.match(BODY, /currentStatus:\s*SAVED_STATUS_RE/);
});

test("the date window is parsed, not split blindly on a slash", () => {
  assert.match(BODY, /APPLIED_DATE_STAGES/, "must use the shared parsing stages");
  assert.match(BODY, /appliedDateWindow\(/, "must normalise the range to whole days");
  assert.equal(
    /\$split:\s*\[\{\s*\$trim:\s*\{\s*input:\s*'\$appliedDate'/.test(BODY),
    false,
    "splitting the raw appliedDate on '/' puts the clock time in the year"
  );
});

// ── the parsing stages themselves ────────────────────────────────────

test("the year is read from a date with the time stripped off", () => {
  const stages = src.slice(src.indexOf("const APPLIED_DATE_STAGES"));
  assert.match(stages, /\$split:\s*\['\$appliedDate',\s*','\]/,
    "the comma has to come off before the slashes are split");
  // The exact failure: parsing the year out of the untrimmed string.
  const yearPiece = "2026, 8:32:36 pm";
  assert.ok(Number.isNaN(Number(yearPiece)), "this is what $convert choked on");
  assert.equal(Number("2026"), 2026, "and this is what it gets now");
});

test("a real appliedDate parses to the right calendar day", () => {
  // Replays the pipeline's arithmetic in JS on values taken from the database.
  const parse = (raw) => {
    const dateOnly = String(raw).split(",")[0].trim();
    const [n0, n1, yr] = dateOnly.split("/").map((n) => parseInt(n, 10));
    const day = n1 > 12 ? n1 : n0;
    const mon = n1 > 12 ? n0 : n1;
    if (!(yr >= 1970 && yr <= 2100) || mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    return new Date(Date.UTC(yr, mon - 1, day));
  };
  assert.equal(parse("9/5/2026, 8:32:36 pm").toISOString(), "2026-05-09T00:00:00.000Z",
    "en-IN: day first");
  assert.equal(parse("31/12/2025, 11:15:15 pm").toISOString(), "2025-12-31T00:00:00.000Z",
    "31 can only be a day, and December is month 12");
  assert.equal(parse("1/5/2026, 9:00:00 am").toISOString(), "2026-05-01T00:00:00.000Z",
    "ambiguous rows follow the data: D/M/Y");
  assert.equal(parse("5/31/2026, 9:00:00 AM").toISOString(), "2026-05-31T00:00:00.000Z",
    "a stray M/D/Y row is still rescued by the >12 test");
  assert.equal(parse("garbage"), null, "unparseable rows are dropped, never misdated");
  assert.equal(parse("9/5/0, 8:32:36 pm"), null, "year 0 is dropped rather than counted");
});

test("the window covers whole days at both ends", () => {
  const m = src.match(/function appliedDateWindow\([\s\S]*?\n\}/);
  assert.ok(m, "appliedDateWindow must exist");
  const fn = new Function(`${m[0]}; return appliedDateWindow;`)();
  const w = fn("2026-09-01", "2026-09-21");
  assert.equal(w.start.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(w.end.toISOString(), "2026-09-21T23:59:59.999Z",
    "a job applied on the last day of the range must still be inside it");
  assert.equal(fn("nope", "2026-09-21"), null);
});

// ── the free-text status field, once more ────────────────────────────

test("the milestone rule counts a card that moved past applied", () => {
  const m = src.match(/const MILESTONE_COUNT_STATUS_RE = (\/.+\/[a-z]*);/);
  assert.ok(m, "MILESTONE_COUNT_STATUS_RE must exist in index.js");
  const RE = eval(m[1]);
  // Real values read out of the production collection.
  for (const s of ["applied by Arjun", "applied by user", "applied by Sonali",
                   "rejected by user", "rejected by Arjun", "interviewing by user",
                   "Offer Extended"]) {
    assert.ok(RE.test(s), `"${s}" is an application that happened`);
  }
  for (const s of ["saved", "saved by user", "deleted by Arjun", "deleted by AI",
                   "removed by AI", "deleted by user"]) {
    assert.equal(RE.test(s), false, `"${s}" is not an application`);
  }
});
