// Who may move the JobRight toggle, and in which direction.
//
// The two directions are not equally risky, which is the whole point of the
// rule:
//
//   No -> Yes   routine. The team lead has just created the account as part of
//               onboarding, and marking it also provisions the autopilot
//               credentials. Making them wait for an admin is friction for no
//               safety gain.
//   Yes -> No   destructive. It hides the client from every "who still needs an
//               account" view, and the damage is invisible until scheduled runs
//               quietly stop producing jobs. Admins only.
//
// The middleware is lifted out of index.js rather than copied, because index.js
// opens a Mongo connection on import and a copied middleware would drift.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../index.js", import.meta.url), "utf8");

function lift(name) {
  const at = src.indexOf(`const ${name} = (`);
  assert.ok(at > 0, `${name} must exist in index.js`);
  let depth = 0, started = false;
  for (let i = src.indexOf("{", at); i < src.length; i += 1) {
    if (src[i] === "{") { depth += 1; started = true; }
    else if (src[i] === "}") { depth -= 1; if (started && depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error(`could not brace-match ${name}`);
}

const verifyJobrightToggle = new Function(
  `${lift("verifyJobrightToggle")}; return verifyJobrightToggle;`,
)();

/** Run the middleware; returns 'allowed' or { status, error }. */
function run(role, jobrightCreated) {
  let outcome = null;
  const res = {
    status(code) { this._code = code; return this; },
    json(body) { outcome = { status: this._code, error: body.error }; return this; },
  };
  verifyJobrightToggle({ user: { role }, body: { jobrightCreated } }, res, () => { outcome = "allowed"; });
  return outcome;
}

// ── No -> Yes: the routine direction ──────────────────────────────────

test("a team lead can mark a client Yes", () => {
  assert.equal(run("team_lead", true), "allowed");
});

test("an admin can mark a client Yes", () => {
  assert.equal(run("admin", true), "allowed");
});

// ── Yes -> No: admins only ────────────────────────────────────────────

test("a team lead cannot revert a client to No", () => {
  const out = run("team_lead", false);
  assert.equal(out.status, 403);
  assert.match(out.error, /Only admins can change JobRight back to No/);
});

test("an admin can revert a client to No", () => {
  assert.equal(run("admin", false), "allowed");
});

// ── everyone else, both directions ────────────────────────────────────

test("no other role can move the toggle at all", () => {
  for (const role of ["csm", "operations_intern", "onboarding_team", "operations", "", undefined]) {
    for (const value of [true, false]) {
      const out = run(role, value);
      assert.equal(out?.status, 403, `${role || "(none)"} should not set ${value}`);
    }
  }
});

test("the refusal names the direction, so the message is actionable", () => {
  assert.match(run("csm", false).error, /back to No/);
  assert.match(run("csm", true).error, /admins and team leads/);
});

// ── the value has to be a real boolean ────────────────────────────────

test("a non-boolean is never treated as the permissive direction", () => {
  // The handler itself rejects a non-boolean with a 400, but the gate must not
  // wave it through first: "false" and 1 are both truthy in JS, and a gate that
  // read them as `true` would hand a team lead the admin-only direction.
  for (const value of ["true", "false", 1, 0, null, undefined, {}]) {
    const out = run("team_lead", value);
    assert.equal(out?.status, 403, `team_lead must not pass with ${JSON.stringify(value)}`);
  }
});

test("an admin is unaffected by the value's shape", () => {
  for (const value of ["true", 1, null, undefined]) {
    assert.equal(run("admin", value), "allowed");
  }
});

// ── the route actually uses it ────────────────────────────────────────

test("the jobright route is mounted behind this gate, not verifyAdmin", () => {
  const line = src.match(/app\.patch\('\/api\/clients\/:email\/jobright'[^\n]*/);
  assert.ok(line, "the route must exist");
  assert.match(line[0], /verifyToken/, "still authenticated");
  assert.match(line[0], /verifyJobrightToggle/);
  assert.equal(/verifyAdmin/.test(line[0]), false,
    "verifyAdmin would lock team leads out of the direction they are meant to have");
});
