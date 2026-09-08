// Mirror client-facing milestone mail into the client's own Mattermost channel.
//
// WHERE THE WEBHOOK COMES FROM
//
// Operations types it into the dashboard's Operations > Client Reminders tab,
// which stores it on the `clientreminderconfigs` collection. Both services
// point at the same Mongo cluster, so this app reads that collection directly
// through the raw driver rather than duplicating the Mongoose model - the
// dashboard owns the schema and must stay the only thing that writes it.
//
// WHY A RAW COLLECTION READ AND NOT A MODEL
//
// Registering a second Mongoose model for a collection another service owns is
// how schemas silently diverge: this app would start enforcing its own idea of
// the shape and reject documents the dashboard writes perfectly legally. A
// projection over two fields cannot drift.
//
// FAIL SOFT, ALWAYS. A missing webhook, an unreachable Mattermost, a dead
// cluster - none of it may affect whether the email went out. The email is the
// product promise; the channel post is a convenience on top.

import mongoose from "mongoose";
import { sendToMattermost, isValidWebhookUrl, normalizeWebhookUrl } from "./mattermostSender.js";

const LOG = "[client-mattermost]";
const COLLECTION = "clientreminderconfigs";

/**
 * The client's saved Mattermost webhook, or "" when there is none.
 *
 * @param {string} clientEmail the client's dashboard login email, which is the
 *        key the dashboard stores these under
 * @returns {Promise<string>}
 */
export async function webhookForClient(clientEmail) {
  const email = String(clientEmail || "").trim().toLowerCase();
  if (!email) return "";
  try {
    const db = mongoose.connection?.db;
    if (!db) return "";
    const doc = await db
      .collection(COLLECTION)
      .findOne({ clientEmail: email }, { projection: { mattermostWebhookUrl: 1 } });
    return normalizeWebhookUrl(doc?.mattermostWebhookUrl || "");
  } catch (err) {
    console.warn(`${LOG} webhook lookup failed for ${email}:`, err?.message || err);
    return "";
  }
}

/** Escape Mattermost markdown. Same rules as the dashboard's templates. */
function mmEscape(v) {
  return String(v ?? "").replace(/([\\`*_{}[\]()<>#+\-.!|~])/g, "\\$1");
}

const DEFAULT_DASHBOARD_URL = "https://portal.flashfirejobs.com";

function fmt(n) {
  return Number(n || 0).toLocaleString("en-US");
}

/**
 * The channel message for one milestone. Pure, so it is unit-testable.
 *
 * Carries the numbers the client actually asks about ("how many so far?",
 * "is my plan done?") because that is the whole point of a channel ping. It
 * does NOT argue about quotas or percentages beyond the plan count itself.
 *
 * @param {object} a
 * @param {"started"|"count_milestone"|"completed"} a.type
 * @param {string} [a.name]
 * @param {string} [a.planLabel]
 * @param {number} [a.planCap]
 * @param {number} [a.currentCount]
 * @param {number} [a.threshold]
 * @param {string} [a.subject]       email subject, the fallback heading
 * @param {string} [a.dashboardUrl]
 * @returns {string}
 */
export function buildMilestoneMattermostText({
  type,
  name,
  planLabel,
  planCap,
  currentCount,
  threshold,
  subject,
  dashboardUrl
} = {}) {
  const who = mmEscape(String(name || "").trim() || "there");
  const plan = mmEscape(planLabel || "your");
  const cap = Number(planCap) || 0;
  const count = Number(currentCount) || 0;
  const step = Number(threshold) || 0;

  let heading;
  let body;
  if (type === "started") {
    heading = "Your resume is ready and applications are going out";
    body = cap
      ? `Hi ${who}, your new resume is done and we have started sending applications today. Your ${plan} plan covers **${fmt(cap)}** roles.`
      : `Hi ${who}, your new resume is done and we have started sending applications today.`;
  } else if (type === "count_milestone") {
    heading = `${fmt(step)} applications submitted`;
    body = cap
      ? `Hi ${who}, we have crossed **${fmt(step)} applications** on your ${plan} plan (${fmt(count)} of ${fmt(cap)} so far). Replies usually start around this stage, so keep an eye on your inbox and LinkedIn.`
      : `Hi ${who}, we have crossed **${fmt(step)} applications** on your ${plan} plan. Replies usually start around this stage, so keep an eye on your inbox and LinkedIn.`;
  } else if (type === "completed") {
    heading = `All ${fmt(cap || step)} applications done`;
    body = `Hi ${who}, that is a wrap on all **${fmt(cap || step)} applications** under your ${plan} plan. We are now tracking replies and lining up interviews.`;
  } else {
    heading = subject || "An update from FlashFire";
    body = "We have just emailed you about this.";
  }

  const lines = [`#### ${mmEscape(heading)}`, "", body, "", "We have also emailed you the details."];
  const url = String(dashboardUrl || DEFAULT_DASHBOARD_URL).trim();
  if (url) lines.push("", `[Open your dashboard](${url})`);
  return lines.join("\n");
}

/**
 * Post one milestone to the client's channel.
 *
 * @param {object} a
 * @param {object} a.client          tracking record; `email` is the lookup key
 * @param {string} [a.type]          started | count_milestone | completed
 * @param {object} [a.ctx]           {name, planLabel, planCap, currentCount, threshold}
 * @param {string} [a.subject]       email subject, used only as a fallback heading
 * @param {string} [a.dashboardUrl]
 * @returns {Promise<{ok: boolean, skipped?: string, error?: string}>}
 */
export async function postMilestoneToMattermost({ client, type, ctx = {}, subject, dashboardUrl }) {
  const clientEmail = String(client?.email || "").trim().toLowerCase();
  if (!clientEmail) return { ok: false, skipped: "no_client_email" };

  const webhookUrl = await webhookForClient(clientEmail);
  if (!isValidWebhookUrl(webhookUrl)) return { ok: false, skipped: "no_webhook" };

  const text = buildMilestoneMattermostText({ type, subject, dashboardUrl, ...ctx });

  const res = await sendToMattermost({ webhookUrl, text, username: "FlashFire" });

  if (!res.ok) {
    // sendToMattermost has already redacted the webhook out of the message.
    console.warn(`${LOG} post failed for ${clientEmail}: ${res.error}`);
  }
  return res;
}
