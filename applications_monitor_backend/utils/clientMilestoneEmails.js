import sgMail from "@sendgrid/mail";
import { ClientEmailLogModel } from "../ClientEmailLogModel.js";
import { getPlanLabel } from "./planCaps.js";

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY_1 || process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.SENDGRID_FROM_EMAIL || "noreply@flashfirehq.com";
const FROM_NAME = "FlashFire Team";

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
}

function shell({ kicker, title, bodyHtml, ctaLabel, ctaHref }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#1f2937;border-radius:12px 12px 0 0;padding:20px 24px;">
      <div style="color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">${kicker}</div>
      <div style="color:#fff;font-size:20px;font-weight:700;margin-top:4px;">${title}</div>
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
      ${bodyHtml}
      ${ctaHref ? `<div style="text-align:center;margin-top:24px;"><a href="${ctaHref}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;font-size:14px;">${ctaLabel || "Open Dashboard"}</a></div>` : ""}
    </div>
    <div style="text-align:center;padding:16px 0;">
      <span style="color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} FlashFire</span>
    </div>
  </div>
</body>
</html>`;
}

function progressBlock({ planLabel, currentCount, planCap, percent }) {
  const safePct = Math.max(0, Math.min(100, percent));
  return `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px 20px;margin:20px 0;">
      <div style="display:flex;justify-content:space-between;font-size:13px;color:#7c2d12;font-weight:600;margin-bottom:8px;">
        <span>${planLabel} plan</span>
        <span>${currentCount} / ${planCap}</span>
      </div>
      <div style="background:#ffedd5;height:8px;border-radius:999px;overflow:hidden;">
        <div style="background:#ea580c;height:8px;width:${safePct}%;border-radius:999px;"></div>
      </div>
      <div style="text-align:right;color:#ea580c;font-size:12px;font-weight:700;margin-top:6px;">${safePct.toFixed(0)}% complete</div>
    </div>`;
}

const TEMPLATES = {
  resume_ready: ({ name, planLabel }) => ({
    subject: "Your FlashFire resume is ready — next stage begins",
    html: shell({
      kicker: "FLASHFIRE PORTAL",
      title: "Your resume is ready",
      bodyHtml: `
        <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi ${name},</p>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Good news — your tailored FlashFire resume is complete. We're moving to the next stage of your <strong>${planLabel}</strong> plan: LinkedIn optimization, portfolio prep, and getting your job applications queued.</p>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Sit tight. Your dedicated team is locking in the targeting and you'll hear from us the moment applications kick off.</p>
        <p style="margin:0;color:#6b7280;font-size:13px;">Questions? Reply to this email — we read every one.</p>`
    })
  }),

  apps_started: ({ name, planLabel, planCap }) => ({
    subject: "Your job applications have started",
    html: shell({
      kicker: "FLASHFIRE PORTAL",
      title: "Applications are live",
      bodyHtml: `
        <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi ${name},</p>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Your <strong>${planLabel}</strong> plan is now in motion. We've started submitting applications on your behalf — <strong>${planCap}</strong> targeted roles included in your plan.</p>
        <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">You'll get milestone updates at 30%, 50%, 75%, and 100% so you always know where things stand. Track everything live in your dashboard.</p>
        <p style="margin:0;color:#6b7280;font-size:13px;">Stay sharp on interview prep — momentum builds fast from here.</p>`
    })
  }),

  pct30: (ctx) => milestonePct(ctx, 30, "Strong start", "30% of your plan is done. Early applications are out and tracking — keep an eye on responses landing this week."),
  pct50: (ctx) => milestonePct(ctx, 50, "Halfway there", "Half your plan is complete. Recruiter outreach typically peaks around this point — expect interview invites picking up."),
  pct75: (ctx) => milestonePct(ctx, 75, "Three-quarters done", "75% of your applications are live. Final stretch — focus on interview prep and follow-ups for the strongest signals."),
  pct100: (ctx) => milestonePct(ctx, 100, "Plan complete", "All applications under your plan are submitted. Your team continues tracking responses, scheduling interviews, and supporting follow-up. Let's land the offer.")
};

function milestonePct({ name, planLabel, planCap, currentCount, percent }, tier, title, line) {
  return {
    subject: `Milestone: ${tier}% of your ${planLabel} plan complete (${currentCount}/${planCap})`,
    html: shell({
      kicker: "FLASHFIRE PORTAL",
      title,
      bodyHtml: `
        <p style="margin:0 0 12px;color:#374151;font-size:16px;">Hi ${name},</p>
        <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">${line}</p>
        ${progressBlock({ planLabel, currentCount, planCap, percent })}
        <p style="margin:0;color:#6b7280;font-size:13px;">Your dedicated team keeps pushing. Reply if you want to shift focus or add target companies.</p>`
    })
  };
}

export async function sendMilestoneEmail({ client, type, snapshot = {} }) {
  const toEmail = (client.paymentEmail || "").trim();
  if (!toEmail) {
    console.warn(`[Milestone] skip ${type} for ${client.email} — no paymentEmail`);
    return { skipped: true, reason: "no_payment_email" };
  }

  const planLabel = getPlanLabel(client.planType);
  const ctx = {
    name: client.name || "there",
    planLabel,
    planCap: snapshot.planCap || 0,
    currentCount: snapshot.currentCount || 0,
    percent: snapshot.percent || 0
  };

  const tplFn = TEMPLATES[type];
  if (!tplFn) throw new Error(`Unknown milestone email type: ${type}`);
  const { subject, html } = tplFn(ctx);

  const logBase = {
    clientEmail: client.email,
    paymentEmail: toEmail,
    type,
    subject,
    snapshot: {
      planType: client.planType || "",
      planCap: ctx.planCap,
      currentCount: ctx.currentCount,
      percent: ctx.percent
    }
  };

  if (!SENDGRID_API_KEY) {
    console.log(`[Milestone] ${type} -> ${toEmail} (SendGrid not configured — logging only)`);
    await ClientEmailLogModel.create({ ...logBase, status: "failed", errorMessage: "sendgrid_not_configured" });
    return { skipped: true, reason: "sendgrid_not_configured" };
  }

  try {
    await sgMail.send({
      to: toEmail,
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      html
    });
    await ClientEmailLogModel.create({ ...logBase, status: "success" });
    console.log(`[Milestone] sent ${type} to ${toEmail} for client ${client.email}`);
    return { success: true };
  } catch (err) {
    const msg = err?.response?.body?.errors?.[0]?.message || err?.message || "send_failed";
    console.error(`[Milestone] ${type} failed for ${client.email}:`, msg);
    await ClientEmailLogModel.create({ ...logBase, status: "failed", errorMessage: msg });
    return { success: false, error: msg };
  }
}
