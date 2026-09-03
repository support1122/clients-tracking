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

/**
 * Post one milestone to the client's channel.
 *
 * Deliberately terse: the email carries the detail, this is the nudge that
 * makes them go read it. No plan cap, no percentages - a channel post arguing
 * about quota is a support thread waiting to happen.
 *
 * @returns {Promise<{ok: boolean, skipped?: string, error?: string}>}
 */
export async function postMilestoneToMattermost({ client, subject, dashboardUrl }) {
  const clientEmail = String(client?.email || "").trim().toLowerCase();
  if (!clientEmail) return { ok: false, skipped: "no_client_email" };

  const webhookUrl = await webhookForClient(clientEmail);
  if (!isValidWebhookUrl(webhookUrl)) return { ok: false, skipped: "no_webhook" };

  const lines = [
    `#### ${mmEscape(subject || "An update from FlashFire")}`,
    "",
    "We have just emailed you about this.",
    dashboardUrl ? `\n[Open your dashboard](${dashboardUrl})` : ""
  ].filter(Boolean);

  const res = await sendToMattermost({
    webhookUrl,
    text: lines.join("\n"),
    username: "FlashFire"
  });

  if (!res.ok) {
    // sendToMattermost has already redacted the webhook out of the message.
    console.warn(`${LOG} post failed for ${clientEmail}: ${res.error}`);
  }
  return res;
}
