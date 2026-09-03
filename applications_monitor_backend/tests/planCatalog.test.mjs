// Plan / payment consistency.
//
// dashboardtrackings.planType is what the PLAN badge in Client Job Analysis
// shows. planPrice on the SAME document is the payment side of it, and
// users.planType is what the application cap is actually enforced from. All
// three used to be written independently, in four places, from three separate
// copies of the price table — so they drifted, and the screen showed a plan the
// client had not paid for.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  PLAN_PRICES,
  PLAN_CAPS,
  PLAN_LABELS,
  normalisePlanType,
  getPlanPrice,
  planWriteFields,
  planPaymentMismatch,
  applyPlanToClientUpdate,
} from "../utils/planCaps.js";

test("every plan we sell has a price, a cap and a label", () => {
  const plans = Object.keys(PLAN_CAPS);
  assert.deepEqual(plans.sort(), ["executive", "ignite", "prime", "professional"]);
  for (const p of plans) {
    assert.equal(typeof PLAN_PRICES[p], "number", `${p} has no price`);
    assert.ok(PLAN_PRICES[p] > 0, `${p} price must be positive`);
    assert.equal(typeof PLAN_LABELS[p], "string", `${p} has no label`);
  }
});

test("normalisePlanType canonicalises case, padding and the legacy Free Trial label", () => {
  assert.equal(normalisePlanType("Executive"), "executive");
  assert.equal(normalisePlanType("  PROFESSIONAL "), "professional");
  assert.equal(normalisePlanType("Free Trial"), "prime"); // same 160 cap
  assert.equal(normalisePlanType("prime"), "prime");
});

test("normalisePlanType never guesses at an unknown value", () => {
  assert.equal(normalisePlanType(""), null);
  assert.equal(normalisePlanType(null), null);
  assert.equal(normalisePlanType(undefined), null);
  assert.equal(normalisePlanType("enterprise"), null);
  assert.equal(normalisePlanType("exec"), null, "a partial name is not a plan");
});

test("planWriteFields hands back the plan, its price and its label together", () => {
  assert.deepEqual(planWriteFields("Executive"), {
    planType: "executive",
    planPrice: 599,
    planLabel: "Executive",
  });
  assert.deepEqual(planWriteFields("prime"), {
    planType: "prime",
    planPrice: 119,
    planLabel: "Prime",
  });
  assert.equal(planWriteFields("nonsense"), null);
  assert.equal(planWriteFields(""), null);
});

test("the tracking plan and the users plan resolve from one source", () => {
  // The bug: the tracking row defaulted to "ignite" (250 cap on the badge)
  // while the user row defaulted to "Free Trial" (160 enforced).
  for (const plan of Object.keys(PLAN_CAPS)) {
    const f = planWriteFields(plan);
    assert.equal(f.planType, plan);
    assert.equal(normalisePlanType(f.planLabel), plan, `${f.planLabel} must round-trip to ${plan}`);
  }
});

test("getPlanPrice matches the catalogue and is null for an unknown plan", () => {
  assert.equal(getPlanPrice("Ignite"), 199);
  assert.equal(getPlanPrice("professional"), 349);
  assert.equal(getPlanPrice("Executive"), 599);
  assert.equal(getPlanPrice("Prime"), 119);
  assert.equal(getPlanPrice("Free Trial"), 119);
  assert.equal(getPlanPrice("whatever"), null);
});

// ── planPaymentMismatch ───────────────────────────────────────────────────

test("a client whose price matches their plan is not flagged", () => {
  assert.equal(planPaymentMismatch({ planType: "executive", planPrice: 599 }), null);
  assert.equal(planPaymentMismatch({ planType: "Professional", planPrice: 349 }), null);
});

test("a plan upgraded without its price is flagged", () => {
  // Exactly what a partial update used to leave behind: badge says Executive,
  // the payment on the document still says Professional.
  const reason = planPaymentMismatch({ planType: "executive", planPrice: 349 });
  assert.ok(reason, "must be flagged");
  assert.match(reason, /349/);
  assert.match(reason, /Executive/);
});

test("a missing or unreadable price is flagged", () => {
  assert.ok(planPaymentMismatch({ planType: "prime" }));
  assert.ok(planPaymentMismatch({ planType: "prime", planPrice: null }));
  assert.ok(planPaymentMismatch({ planType: "prime", planPrice: "119" }) === null,
    "a numeric string is still the right price");
});

test("an unknown or absent plan is flagged rather than passed over", () => {
  assert.match(planPaymentMismatch({ planType: "enterprise", planPrice: 599 }), /unknown plan/);
  assert.match(planPaymentMismatch({ planType: "", planPrice: 599 }), /no plan set/);
  assert.match(planPaymentMismatch({}), /no plan set/);
});

test("the newest plan_upgrade payment has to name the plan the client is on", () => {
  const base = { planType: "professional", planPrice: 349 };
  assert.equal(
    planPaymentMismatch({
      ...base,
      upgradePayments: [
        { amount: 150, currency: "USD", for: "plan_upgrade_to_professional", paidAt: "x" },
      ],
    }),
    null,
  );
  const reason = planPaymentMismatch({
    ...base,
    upgradePayments: [
      { amount: 150, currency: "USD", for: "plan_upgrade_to_professional", paidAt: "x" },
      { amount: 250, currency: "USD", for: "plan_upgrade_to_executive", paidAt: "y" },
    ],
  });
  assert.ok(reason, "the client paid to move to Executive but is still on Professional");
  assert.match(reason, /Executive/);
});

test("addon payments never look like a plan mismatch", () => {
  assert.equal(
    planPaymentMismatch({
      planType: "executive",
      planPrice: 599,
      upgradePayments: [
        { amount: 99, currency: "USD", for: "addon_250", paidAt: "x" },
        { amount: 199, currency: "USD", for: "addon_500", paidAt: "y" },
      ],
    }),
    null,
  );
});

test("a stale upgrade payment under the current plan does not flag", () => {
  // Upgraded to Executive, then bought an addon. The newest PLAN upgrade is
  // still the Executive one, so the row is consistent.
  assert.equal(
    planPaymentMismatch({
      planType: "executive",
      planPrice: 599,
      upgradePayments: [
        { for: "plan_upgrade_to_professional", amount: 150, paidAt: "a" },
        { for: "plan_upgrade_to_executive", amount: 250, paidAt: "b" },
        { for: "addon_250", amount: 99, paidAt: "c" },
      ],
    }),
    null,
  );
});

// ── applyPlanToClientUpdate ───────────────────────────────────────────────
// POST /api/clients writes the request body onto the document as-is. This is
// the guard that stops planType moving on its own.

test("an update that does not touch the plan is left alone", () => {
  const update = { isPaused: true, onboardingPhase: false };
  assert.equal(applyPlanToClientUpdate(update), null);
  assert.deepEqual(update, { isPaused: true, onboardingPhase: false });
});

test("changing the plan rewrites planPrice in the same update", () => {
  const update = { planType: "Executive", isPaused: false };
  const fields = applyPlanToClientUpdate(update);
  assert.equal(update.planType, "executive", "stored lowercase, matching the ClientModel enum");
  assert.equal(update.planPrice, 599, "the payment side moves with the badge");
  assert.equal(fields.planLabel, "Executive", "caller mirrors this to users.planType");
  assert.equal(update.isPaused, false, "unrelated fields survive");
});

test("a planPrice supplied by the caller cannot contradict the plan", () => {
  const update = { planType: "professional", planPrice: 9 };
  applyPlanToClientUpdate(update);
  assert.equal(update.planPrice, 349);
});

test("an unknown plan is dropped rather than written", () => {
  // ClientModel is updated with runValidators:false, so the enum would not
  // catch it — an "Enterprise" badge would just render as unknown forever.
  const update = { planType: "Enterprise", status: "active" };
  assert.equal(applyPlanToClientUpdate(update), null);
  assert.equal("planType" in update, false);
  assert.equal("planPrice" in update, false);
  assert.equal(update.status, "active");
});

test("the round trip leaves no mismatch behind", () => {
  for (const plan of ["ignite", "Professional", "EXECUTIVE", "prime", "Free Trial"]) {
    const update = { planType: plan };
    applyPlanToClientUpdate(update);
    assert.equal(planPaymentMismatch(update), null, `${plan} still mismatched after the update`);
  }
});
