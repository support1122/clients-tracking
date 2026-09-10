/**
 * stripePlanCheck.js
 *
 * Fetches the most recent succeeded Stripe charge for a set of emails and
 * returns a map of email → { stripePlan, stripeAmount, stripeCurrency, chargeDate }.
 *
 * Used by client-job-analysis to flag rows where the registered planType does
 * not match what the client actually paid for on Stripe.
 *
 * Design constraints:
 * - One Stripe list call per email would be too slow at 294 clients. Instead we
 *   fetch the last N charges in a single paginated call and index by email.
 * - Stripe charges go back months so we cap at MAX_CHARGES to bound latency.
 * - Results are cached in-process for CACHE_TTL_MS so repeated analysis loads
 *   within the same server lifetime don't burn Stripe rate limits.
 */

import Stripe from 'stripe';
import { normalisePlanType } from './planCaps.js';

const MAX_CHARGES = 500;   // covers ~6 months of FlashFire volume
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _cache = null;
let _cacheAt = 0;

/**
 * Normalise a Stripe charge description into a canonical plan key.
 * Stripe descriptions look like:
 *   "Executive Plan – 1200+ Applications"
 *   "Prime Plan - 160 Applications"
 *   "Professional Plan – Mid-Level Professionals"
 *   "Ignite Plan - 250 Applications"
 *   "Upgrade: Prime to Professional Plan – 500 Applications"
 */
function normalisePlanFromDescription(desc) {
  if (!desc) return null;
  const s = desc.toLowerCase();
  // Order matters: check longer/more specific names first
  if (s.includes('executive')) return 'executive';
  if (s.includes('professional')) return 'professional';
  if (s.includes('ignite')) return 'ignite';
  if (s.includes('prime')) return 'prime';
  return null;
}

/**
 * Build email → stripe payment info map by fetching recent charges from Stripe.
 * Returns a Map<string, { stripePlan, stripeAmount, stripeCurrency, chargeDate, isUpgrade }>.
 *
 * Only the MOST RECENT non-upgrade charge per email is kept (latest = current plan).
 */
async function fetchStripePaymentMap(stripeSecret) {
  const stripe = new Stripe(stripeSecret);
  const emailMap = new Map(); // email (lowercase) → best charge info

  let hasMore = true;
  let startingAfter = undefined;
  let fetched = 0;

  while (hasMore && fetched < MAX_CHARGES) {
    const limit = Math.min(100, MAX_CHARGES - fetched);
    const params = { limit, expand: ['data.payment_intent'] };
    if (startingAfter) params.starting_after = startingAfter;

    const charges = await stripe.charges.list(params);

    for (const charge of charges.data) {
      if (charge.status !== 'succeeded') continue;
      const email = (charge.billing_details?.email || charge.receipt_email || '').toLowerCase().trim();
      if (!email) continue;

      const desc = charge.description || '';
      const isUpgrade = desc.toLowerCase().includes('upgrade');
      const plan = normalisePlanFromDescription(desc);

      // Skip if we can't determine a plan
      if (!plan) continue;

      // Keep only the most recent charge per email that is NOT an upgrade,
      // unless the only charge we have is an upgrade.
      const existing = emailMap.get(email);
      if (!existing) {
        emailMap.set(email, {
          stripePlan: plan,
          stripeAmount: charge.amount / 100,
          stripeCurrency: (charge.currency || '').toUpperCase(),
          chargeDate: new Date(charge.created * 1000).toISOString(),
          isUpgrade
        });
      } else if (!isUpgrade && existing.isUpgrade) {
        // Replace upgrade-only entry with a base plan charge
        emailMap.set(email, {
          stripePlan: plan,
          stripeAmount: charge.amount / 100,
          stripeCurrency: (charge.currency || '').toUpperCase(),
          chargeDate: new Date(charge.created * 1000).toISOString(),
          isUpgrade: false
        });
      }
      // If both are non-upgrade, keep the first one seen (most recent, since
      // Stripe returns newest-first).
    }

    fetched += charges.data.length;
    hasMore = charges.has_more;
    if (charges.data.length > 0) {
      startingAfter = charges.data[charges.data.length - 1].id;
    } else {
      break;
    }
  }

  return emailMap;
}

/**
 * Returns cached stripe payment map, refreshing if stale.
 * Returns empty Map on any error (never throws — a Stripe outage must not
 * break the analysis endpoint).
 */
export async function getStripePaymentMap(stripeSecret) {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL_MS) return _cache;

  try {
    _cache = await fetchStripePaymentMap(stripeSecret);
    _cacheAt = now;
    console.log(`[stripePlanCheck] fetched ${_cache.size} stripe payment records`);
    return _cache;
  } catch (err) {
    console.error('[stripePlanCheck] failed to fetch stripe data:', err?.message || err);
    return _cache || new Map(); // serve stale on error rather than crashing
  }
}

/**
 * Invalidate the in-process cache (call after webhook updates, if needed).
 */
export function invalidateStripePaymentCache() {
  _cache = null;
  _cacheAt = 0;
}

/**
 * Cross-check a single client's registered plan against Stripe.
 *
 * @param {object} client  - dashboardtrackings doc (needs email, paymentEmail, crmEmail, planType)
 * @param {Map}    stripeMap - result of getStripePaymentMap()
 * @returns {{ status, registeredPlan, stripePlan, stripeAmount, stripeCurrency, chargeDate, matchedEmail } | null}
 *   null when the internal planPaymentMismatch (price vs planType) already caught it —
 *   this function only adds the STRIPE cross-check layer.
 */
export function checkClientStripePlan(client, stripeMap) {
  const registeredPlan = normalisePlanType(client?.planType);

  // Try payment email first, then crm email, then dashboard email
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
    return {
      status: 'not_found',
      registeredPlan,
      stripePlan: null,
      stripeAmount: null,
      stripeCurrency: null,
      chargeDate: null,
      matchedEmail: null
    };
  }

  const { stripePlan, stripeAmount, stripeCurrency, chargeDate } = stripeEntry;

  if (stripePlan && registeredPlan && stripePlan !== registeredPlan) {
    return {
      status: 'mismatch',
      registeredPlan,
      stripePlan,
      stripeAmount,
      stripeCurrency,
      chargeDate,
      matchedEmail
    };
  }

  return {
    status: 'ok',
    registeredPlan,
    stripePlan,
    stripeAmount,
    stripeCurrency,
    chargeDate,
    matchedEmail
  };
}
