// The call the "JobRight: Yes" toggle makes into the dashboard backend.
//
// The controller on the other side has its own tests. What is tested here is
// the part that lives in THIS service and is easy to get quietly wrong: the
// header, the URL, the timeout, and above all the failure mapping — because
// the whole point of provisioning on the toggle is that a client marked Yes is
// actually ready to scrape. A provisioning call that fails silently would
// leave a client looking set up and never running, which is worse than the
// manual step it replaces.
//
// provisionAutopilotJrCreds is lifted out of index.js by brace matching rather
// than copied, so it cannot drift from the shipped code. index.js itself opens
// a Mongo connection on import, so it cannot simply be imported.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const src = readFileSync(new URL("../index.js", import.meta.url), "utf8");

function lift(name) {
  const at = src.indexOf(`async function ${name}(`);
  assert.ok(at > 0, `${name} must exist in index.js`);
  let depth = 0, started = false;
  for (let i = src.indexOf("{", at); i < src.length; i += 1) {
    if (src[i] === "{") { depth += 1; started = true; }
    else if (src[i] === "}") { depth -= 1; if (started && depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error(`could not brace-match ${name}`);
}

const dir = mkdtempSync(join(tmpdir(), "ff-provision-"));
const mod = join(dir, "provision.mjs");

/** Build a callable copy bound to a given base URL and ops key. */
async function loadWith(base, key) {
  writeFileSync(mod, `
const FLASHFIRE_API_BASE_URL = ${JSON.stringify(base)};
const FLASHFIRE_OPS_KEY = ${JSON.stringify(key)};
${lift("provisionAutopilotJrCreds")}
export { provisionAutopilotJrCreds };
`);
  // Cache-bust so each test gets its own binding.
  const m = await import(pathToFileURL(mod).href + `?v=${Math.random()}`);
  return m.provisionAutopilotJrCreds;
}

/** A stand-in dashboard backend. `handler(req, body)` returns [status, json]. */
async function withStub(handler, fn) {
  const seen = [];
  const server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => { raw += c; });
    req.on("end", async () => {
      const body = raw ? JSON.parse(raw) : {};
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      const [status, payload] = await handler(req, body);
      if (status === 0) return; // hang on purpose (timeout test)
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base, seen);
  } finally {
    server.close();
    server.closeAllConnections?.();
  }
}

const OK = () => [200, { success: true, created: true, filled: ["jrEmail", "jrPassword"], autoLoginReady: true }];

// ── the happy path ────────────────────────────────────────────────────

test("posts to the provision route with the ops key header", async () => {
  await withStub(OK, async (base, seen) => {
    const fn = await loadWith(base, "secret-key-123");
    const out = await fn("client@example.com", "clients-tracking:jobright-toggle:admin@x");
    assert.equal(seen.length, 1);
    assert.equal(seen[0].method, "POST");
    assert.equal(seen[0].url, "/autopilot/creds/client%40example.com/provision");
    assert.equal(seen[0].headers["x-ops-key"], "secret-key-123");
    assert.equal(seen[0].body.updatedBy, "clients-tracking:jobright-toggle:admin@x");
    assert.deepEqual(out, { provisioned: true, created: true, filled: ["jrEmail", "jrPassword"], autoLoginReady: true });
  });
});

test("an email with characters that need escaping still reaches the right route", async () => {
  await withStub(OK, async (base, seen) => {
    const fn = await loadWith(base, "k");
    await fn("first+tag@example.co.uk");
    assert.equal(seen[0].url, "/autopilot/creds/first%2Btag%40example.co.uk/provision",
      "an unescaped + would arrive as a space and provision the wrong row");
  });
});

test("a trailing slash on the base URL does not produce a double slash", async () => {
  await withStub(OK, async (base, seen) => {
    const fn = await loadWith(base + "///", "k");
    await fn("client@example.com");
    assert.equal(seen[0].url, "/autopilot/creds/client%40example.com/provision");
  });
});

test("an already-provisioned client reports no change rather than an error", async () => {
  await withStub(() => [200, { success: true, created: false, filled: [], autoLoginReady: true }], async (base) => {
    const fn = await loadWith(base, "k");
    const out = await fn("client@example.com");
    assert.equal(out.provisioned, true);
    assert.equal(out.created, false);
    assert.deepEqual(out.filled, []);
  });
});

// ── failures must be visible, and must never throw ────────────────────

test("a rejected ops key says exactly that, instead of a bare 401", async () => {
  await withStub(() => [401, { success: false, message: "unauthorised" }], async (base) => {
    const fn = await loadWith(base, "wrong-key");
    const out = await fn("client@example.com");
    assert.equal(out.provisioned, false);
    assert.match(out.reason, /OPS_SECRET_KEY must match/,
      "the operator needs the cause, not the status code");
  });
});

test("a server error is surfaced with the backend's own message", async () => {
  await withStub(() => [500, { success: false, message: "connection reset" }], async (base) => {
    const fn = await loadWith(base, "k");
    const out = await fn("client@example.com");
    assert.deepEqual(out, { provisioned: false, reason: "connection reset" });
  });
});

test("a route that is not deployed yet reports the status, not a crash", async () => {
  await withStub(() => [404, { error: "Route not found" }], async (base) => {
    const fn = await loadWith(base, "k");
    const out = await fn("client@example.com");
    assert.equal(out.provisioned, false);
    assert.equal(out.reason, "HTTP 404");
  });
});

test("an unreachable backend never throws into the toggle", async () => {
  // Port 1 is reserved and refuses immediately.
  const fn = await loadWith("http://127.0.0.1:1", "k");
  const out = await fn("client@example.com");
  assert.equal(out.provisioned, false);
  assert.ok(out.reason, "a reason is always reported");
});

test("a hung backend times out instead of holding the toggle open", async () => {
  await withStub(() => [0, null], async (base) => {
    const fn = await loadWith(base, "k");
    const t0 = Date.now();
    const out = await fn("client@example.com");
    const ms = Date.now() - t0;
    assert.equal(out.provisioned, false);
    assert.match(out.reason, /timed out/);
    assert.ok(ms < 20000, `should give up near the 15s deadline, took ${ms}ms`);
  });
});

test("a non-JSON response body does not blow up the parse", async () => {
  const server = createServer((req, res) => {
    res.writeHead(502, { "content-type": "text/html" });
    res.end("<html>bad gateway</html>");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const fn = await loadWith(`http://127.0.0.1:${server.address().port}`, "k");
    const out = await fn("client@example.com");
    assert.equal(out.provisioned, false);
    assert.equal(out.reason, "HTTP 502");
  } finally {
    server.close();
    server.closeAllConnections?.();
  }
});

// ── the shipped wiring ────────────────────────────────────────────────

test("the toggle awaits provisioning and reports it, and only on Yes", async () => {
  const at = src.indexOf("const updateClientJobright");
  const body = src.slice(at, src.indexOf("\n};", at));
  assert.match(body, /if \(value === true\)/, "turning the flag OFF must not touch credentials");
  assert.match(body, /await provisionAutopilotJrCreds\(/, "fire-and-forget would hide a failure");
  assert.match(body, /autopilotCreds,/, "the result has to reach the operator's screen");
});

test("the ops key default matches the dashboard backend's own default", async () => {
  // If these two drift, every provisioning call 401s on a box where
  // OPS_SECRET_KEY was never set - which is most of them.
  const here = src.match(/const FLASHFIRE_OPS_KEY = process\.env\.OPS_SECRET_KEY \|\| '([^']+)'/);
  assert.ok(here, "FLASHFIRE_OPS_KEY must exist");
  const there = readFileSync(
    new URL("../../../flashfire-dashboard-backend-main/Middlewares/RequireOpsKey.js", import.meta.url), "utf8",
  ).match(/const DEFAULT_OPS_KEY = "([^"]+)"/);
  assert.ok(there, "the dashboard backend's default must be readable");
  assert.equal(here[1], there[1], "the two defaults must be the same string");
});
