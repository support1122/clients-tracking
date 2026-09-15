// One-click unsubscribe links for the mail THIS service sends.
//
// The opt-out page itself lives in the dashboard backend (GET/POST
// /unsubscribe, Controllers/Unsubscribe.js there). This module only mints the
// signed link that points at it, so a client who has had enough of the
// milestone mail can stop it from their inbox instead of replying and hoping.
//
// WHICH KEY SIGNS THE LINK, AND WHY IT IS NOT OUR JWT SECRET
//
// The dashboard verifies the HMAC. Our JWT_SECRET and its JWT_SECRET are
// different values, so a link signed with ours would be rejected as forged and
// the client would meet a "this link is not valid" page - worse than no link,
// because it reads as deliberate.
//
// CRYPTO_AES_SECRET_SECRET_KEY is the same value in both services already: it
// is the AES key both use over the SAME stored credentials, so it cannot drift
// without breaking logins. That makes it the one secret we can sign with and
// know the other side can check. UNSUBSCRIBE_SECRET takes precedence if anyone
// later wants the two concerns separated.
//
// WHEN NO SHARED KEY IS CONFIGURED
//
// We emit a mailto: opt-out instead of an https one. A dead https link reads as
// a dark pattern; a mailto that reaches support always works, satisfies the
// "clear and conspicuous" opt-out requirement, and is a valid List-Unsubscribe
// value under RFC 2369. It is the honest degradation, not silence.
//
// Keep the token logic byte-compatible with the dashboard's
// Utils/unsubscribe.js - if either side changes, change both.

import crypto from "crypto";

/** Streams a client can opt out of. Mirrors the dashboard's vocabulary. */
export const UNSUB_STREAMS = {
  REMINDERS: "reminders",
  INBOX_ALERTS: "inbox-alerts",
  ONBOARDING: "onboarding",
  ALL: "all"
};

const VALID_STREAMS = new Set(Object.values(UNSUB_STREAMS));

// The live dashboard API that serves /unsubscribe. Env first so a staging
// deploy can point at itself; never empty, so the link never disappears.
const FALLBACK_API_URL = "https://flashfire-dashboard-backend.onrender.com";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@flashfirejobs.com";

/** Keys the DASHBOARD can also verify. Our own JWT secret is deliberately absent. */
function signingKey() {
  const candidates = [process.env.UNSUBSCRIBE_SECRET, process.env.CRYPTO_AES_SECRET_SECRET_KEY]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return candidates[0] || "";
}

export function isUnsubscribeConfigured() {
  return signingKey().length > 0;
}

export function unsubscribeBaseUrl() {
  const raw = String(process.env.DASHBOARD_API_URL || process.env.PUBLIC_API_URL || "").trim();
  return (raw || FALLBACK_API_URL).replace(/\/+$/, "");
}

function normalise(email, stream) {
  return `${String(email || "").trim().toLowerCase()}:${String(stream || "")}`;
}

/** HMAC-SHA256, url-safe base64, truncated to 32 chars - 128 bits of tag. */
export function unsubscribeToken(email, stream = UNSUB_STREAMS.ALL) {
  const key = signingKey();
  if (!key) return "";
  return crypto.createHmac("sha256", key).update(normalise(email, stream)).digest("base64url").slice(0, 32);
}

/** The mailto: opt-out. Always available, used when no shared key is set. */
export function unsubscribeMailto(email) {
  const addr = String(email || "").trim().toLowerCase();
  const q = new URLSearchParams({
    subject: "Unsubscribe",
    body: `Please stop sending me FlashFire update emails${addr ? ` at ${addr}` : ""}.`
  });
  return `mailto:${SUPPORT_EMAIL}?${q.toString()}`;
}

/**
 * The opt-out URL for one client and stream. Never "" - an https link when the
 * shared key is configured, a mailto: otherwise.
 *
 * @returns {{url: string, kind: "https"|"mailto"}}
 */
export function unsubscribeLink(email, stream = UNSUB_STREAMS.ALL) {
  const addr = String(email || "").trim().toLowerCase();
  const token = unsubscribeToken(addr, stream);
  if (!addr || !token || !VALID_STREAMS.has(stream)) {
    return { url: unsubscribeMailto(addr), kind: "mailto" };
  }
  const q = new URLSearchParams({ e: addr, s: stream, t: token });
  return { url: `${unsubscribeBaseUrl()}/unsubscribe?${q.toString()}`, kind: "https" };
}

/** Convenience: just the URL. */
export function unsubscribeUrl(email, stream = UNSUB_STREAMS.ALL) {
  return unsubscribeLink(email, stream).url;
}

/**
 * RFC 8058 headers. List-Unsubscribe-Post is only ever sent with an https URL:
 * one-click POST against a mailto: is meaningless and providers penalise it.
 */
export function unsubscribeHeaders(email, stream = UNSUB_STREAMS.ALL) {
  const { url, kind } = unsubscribeLink(email, stream);
  if (!url) return {};
  if (kind !== "https") return { "List-Unsubscribe": `<${url}>` };
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
  };
}
