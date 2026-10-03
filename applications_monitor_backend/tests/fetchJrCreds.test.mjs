// Reading a client's autopilot credentials back out of the dashboard backend.
//
// Added 2026-10-03. Managers flip "JobRight: Yes", which provisions the
// credentials, and then had no way to confirm it: the only sign was a toast.
// The reported symptom was "managers did Yes but the creds never came" — the
// credentials were in fact there (120 of 121 clients had them), there was just
// nothing anywhere that showed it.
//
// What matters here is the same thing that mattered for the provisioning call:
// the header, the URL, and the failure mapping. A credentials panel that
// quietly renders "nothing on file" when the real answer is "the ops key is
// wrong" would send a manager off to re-provision a client that is already
// fine — or worse, leave a genuinely missing one looking identical to it.
//
// 404 is singled out because the dashboard backend answers that way for "no
// credentials on file", which is an ordinary state, not an error.
//
// fetchAutopilotJrCreds is lifted out of index.js by brace matching rather than
// copied, so it cannot drift from the shipped code. index.js opens a Mongo
// connection on import, so it cannot simply be imported.

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

const dir = mkdtempSync(join(tmpdir(), "ff-jrcreds-"));
const mod = join(dir, "fetch.mjs");

async function loadWith(base, key) {
  writeFileSync(mod, `
const FLASHFIRE_API_BASE_URL = ${JSON.stringify(base)};
const FLASHFIRE_OPS_KEY = ${JSON.stringify(key)};
${lift("fetchAutopilotJrCreds")}
export { fetchAutopilotJrCreds };
`);
  const m = await import(`${pathToFileURL(mod).href}?v=${Date.now()}`);
  return m.fetchAutopilotJrCreds;
}

/** A stand-in dashboard backend. Returns the server plus what it received. */
async function serve(handler) {
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ url: req.url, method: req.method, opsKey: req.headers["x-ops-key"] });
    handler(req, res);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, seen, close: () => new Promise((r) => server.close(r)) };
}

const FULL = {
  success: true,
  data: {
    clientEmail: "c@example.com",
    jrEmail: "c@example.com",
    jrPassword: "Jobhunt@2026",
    extEmail: "ops@flashfirehq",
    extPassword: "panelpw",
    extCode: "12345",
    hcSearch: "Data Analyst",
    dailyCap: 30,
  },
};

test("sends the ops key and the client email in the path", async () => {
  const s = await serve((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(FULL));
  });
  try {
    const fetchCreds = await loadWith(s.base, "secret-key");
    await fetchCreds("Mixed.Case@Example.com");
    assert.equal(s.seen.length, 1);
    assert.equal(s.seen[0].opsKey, "secret-key", "the ops key must travel in x-ops-key");
    assert.equal(s.seen[0].method, "GET");
    // Encoded, so an address with a + or a space cannot break the path.
    assert.equal(s.seen[0].url, "/autopilot/creds/Mixed.Case%40Example.com");
  } finally { await s.close(); }
});

test("maps a full record, including the autoLoginReady conclusion", async () => {
  const s = await serve((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(FULL));
  });
  try {
    const fetchCreds = await loadWith(s.base, "k");
    const out = await fetchCreds("c@example.com");
    assert.equal(out.onFile, true);
    assert.equal(out.creds.jrEmail, "c@example.com");
    assert.equal(out.creds.jrPassword, "Jobhunt@2026");
    assert.equal(out.creds.extCode, "12345");
    assert.equal(out.creds.hcSearch, "Data Analyst");
    assert.equal(out.creds.autoLoginReady, true);
    // Only the fields the panel renders travel on; cap numbers belong to the
    // autopilot and have their own view.
    assert.equal(out.creds.dailyCap, undefined);
  } finally { await s.close(); }
});

test("a row missing the password is reported as NOT ready to auto-login", async () => {
  // This is the case that matters: a row exists, so "has credentials" would be
  // true, yet the autopilot stops at the login step. Reporting it as fine is
  // precisely the silent failure this panel exists to expose.
  const s = await serve((_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: true, data: { jrEmail: "c@example.com", jrPassword: "   " } }));
  });
  try {
    const fetchCreds = await loadWith(s.base, "k");
    const out = await fetchCreds("c@example.com");
    assert.equal(out.onFile, true);
    assert.equal(out.creds.autoLoginReady, false);
  } finally { await s.close(); }
});

test("404 is 'no credentials on file', not an error", async () => {
  const s = await serve((_req, res) => {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: false, message: "no credentials on file" }));
  });
  try {
    const fetchCreds = await loadWith(s.base, "k");
    const out = await fetchCreds("c@example.com");
    assert.equal(out.onFile, false);
    assert.equal(out.creds, null);
    assert.match(out.reason, /no credentials on file/i);
  } finally { await s.close(); }
});

test("a rejected ops key says so, rather than looking like an empty client", async () => {
  const s = await serve((_req, res) => {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ success: false }));
  });
  try {
    const fetchCreds = await loadWith(s.base, "wrong");
    const out = await fetchCreds("c@example.com");
    assert.equal(out.onFile, false);
    assert.match(out.reason, /ops key/i, "the reason must name the ops key so it is actionable");
    assert.match(out.reason, /OPS_SECRET_KEY/);
  } finally { await s.close(); }
});

test("never throws when the dashboard backend is unreachable", async () => {
  // Nothing is listening on this port.
  const fetchCreds = await loadWith("http://127.0.0.1:1", "k");
  const out = await fetchCreds("c@example.com");
  assert.equal(out.onFile, false);
  assert.equal(out.creds, null);
  assert.ok(out.reason, "a failure must carry a reason the UI can show");
});

test("a non-JSON body degrades to a reported failure, not a crash", async () => {
  const s = await serve((_req, res) => {
    res.writeHead(502, { "content-type": "text/html" });
    res.end("<html>bad gateway</html>");
  });
  try {
    const fetchCreds = await loadWith(s.base, "k");
    const out = await fetchCreds("c@example.com");
    assert.equal(out.onFile, false);
    assert.match(out.reason, /502/);
  } finally { await s.close(); }
});
