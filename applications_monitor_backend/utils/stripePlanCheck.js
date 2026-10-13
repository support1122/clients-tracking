/**
 * stripePlanCheck.js
 *
 * Cross-checks a client's registered planType against what they actually
 * paid for on Stripe, by fetching checkout sessions and reading the plan
 * name from line item descriptions.
 *
 * Only the plan NAME is compared — amounts, currencies and prices are
 * intentionally ignored. The single question is:
 *   "Was this client registered on the wrong plan?"
 *
 * Results are cached in-process for CACHE_TTL_MS so repeated analysis
 * loads don't burn Stripe rate limits.
 */

import Stripe from 'stripe';
import { normalisePlanType } from './planCaps.js';

const MAX_SESSIONS = 2000;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _cache = null;
let _cacheAt = 0;

/**
 * Extract a canonical plan key from a Stripe line item description.
 * Examples:
 *   "Executive Plan – 1200+ Applications"       → 'executive'
 *   "Professional Plan – Mid-Level Professionals"→ 'professional'
 *   "Prime Plan - 160 Applications"              → 'prime'
 *   "Ignite Plan - 250 Applications"             → 'ignite'
 */
function normalisePlanFromDesc(desc) {
  if (!desc) return null;
  const s = desc.toLowerCase();
  if (s.includes('executive')) return 'executive';
  if (s.includes('professional')) return 'professional';
  if (s.includes('ignite')) return 'ignite';
  if (s.includes('prime')) return 'prime';
  return null;
}

/**
 * Fetch up to MAX_SESSIONS paid checkout sessions from Stripe.
 * Returns Map<email, { stripePlan, stripePlanDesc, isUpgrade }>.
 *
 * Plan name comes from the line item description — the only reliable
 * source. Charge descriptions are null in this Stripe account.
 * Only the most recent non-upgrade session per email is kept.
 */
async function fetchStripeSessionMap(stripeSecret) {
  const stripe = new Stripe(stripeSecret);
  const emailMap = new Map();

  let hasMore = true;
  let startingAfter = undefined;
  let fetched = 0;

  while (hasMore && fetched < MAX_SESSIONS) {
    const limit = Math.min(100, MAX_SESSIONS - fetched);
    const params = { limit, expand: ['data.line_items'] };
    if (startingAfter) params.starting_after = startingAfter;

    const sessions = await stripe.checkout.sessions.list(params);

    for (const session of sessions.data) {
      if (session.payment_status !== 'paid') continue;

      const email = (
        session.customer_details?.email ||
        session.customer_email ||
        ''
      ).toLowerCase().trim();
      if (!email) continue;

      // Plan name comes only from line item descriptions
      const lineItems = session.line_items?.data || [];
      let stripePlan = null;
      let stripePlanDesc = null;
      for (const item of lineItems) {
        const plan = normalisePlanFromDesc(item.description || '');
        if (plan) { stripePlan = plan; stripePlanDesc = item.description; break; }
      }
      if (!stripePlan) continue;

      const isUpgrade = (stripePlanDesc || '').toLowerCase().includes('upgrade');

      // Keep the most recent non-upgrade session per email
      const existing = emailMap.get(email);
      if (!existing || (existing.isUpgrade && !isUpgrade)) {
        emailMap.set(email, { stripePlan, stripePlanDesc, isUpgrade });
      }
    }

    fetched += sessions.data.length;
    hasMore = sessions.has_more;
    if (sessions.data.length > 0) {
      startingAfter = sessions.data[sessions.data.length - 1].id;
    } else {
      break;
    }
  }

  return emailMap;
}

/**
 * Returns cached session map, refreshing if stale.
 * Never throws — a Stripe outage must not break the analysis endpoint.
 */
export async function getStripePaymentMap(stripeSecret) {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL_MS) return _cache;

  try {
    _cache = await fetchStripeSessionMap(stripeSecret);
    _cacheAt = now;
    console.log(`[stripePlanCheck] fetched ${_cache.size} stripe session records`);
    // Debug: log specific emails we care about
    const debugEmails = ['shreya.bhise@gmail.com', 'shrutipandey.01@gmail.com', 'bhiseshreeya438@gmail.com', 'shrutipan.0101@gmail.com'];
    for (const em of debugEmails) {
      console.log(`[stripePlanCheck] ${em}:`, _cache.has(em) ? JSON.stringify(_cache.get(em)) : 'NOT FOUND');
    }
    return _cache;
  } catch (err) {
    console.error('[stripePlanCheck] failed to fetch stripe data:', err?.message || err);
    return _cache || new Map();
  }
}

export function invalidateStripePaymentCache() {
  _cache = null;
  _cacheAt = 0;
}

/**
 * Cross-check one client's registered planType against Stripe.
 * Lookup order: paymentEmail → crmEmail → email
 *
 * Returns:
 *   { status: 'mismatch',   registeredPlan, stripePlan, stripePlanDesc, matchedEmail }
 *   { status: 'ok',         registeredPlan, stripePlan, stripePlanDesc, matchedEmail }
 *   { status: 'not_found',  registeredPlan, stripePlan: null, ... }
 */
export function checkClientStripePlan(client, stripeMap) {
  const registeredPlan = normalisePlanType(client?.planType);

  const candidates = [client?.paymentEmail, client?.crmEmail, client?.email]
    .map(e => (e || '').toLowerCase().trim())
    .filter(Boolean);

  let stripeEntry = null;
  let matchedEmail = null;
  for (const em of candidates) {
    if (stripeMap.has(em)) {
      stripeEntry = stripeMap.get(em);
      matchedEmail = em;
      break;
    }
  }

  if (!stripeEntry) {
    return { status: 'not_found', registeredPlan, stripePlan: null, stripePlanDesc: null, matchedEmail: null };
  }

  const { stripePlan, stripePlanDesc } = stripeEntry;

  if (stripePlan && registeredPlan && stripePlan !== registeredPlan) {
    return { status: 'mismatch', registeredPlan, stripePlan, stripePlanDesc, matchedEmail };
  }

  return { status: 'ok', registeredPlan, stripePlan, stripePlanDesc, matchedEmail };
}
