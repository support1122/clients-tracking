import { sendGmailEmail } from "./gmailSender.js";
import { getPlanLabel } from "./planCaps.js";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || "support@flashfirehq.com";
const WEBSITE_URL   = process.env.WEBSITE_URL   || "https://www.flashfirejobs.com";
const DASHBOARD_URL = process.env.DASHBOARD_URL || "https://portal.flashfirejobs.com/";

function shell({ kicker, title, bodyHtml }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">

    <!-- Brand bar -->
    <div style="text-align:center;padding:8px 0 16px;">
      <span style="display:inline-block;font-size:22px;font-weight:800;letter-spacing:0.5px;color:#ea580c;">FLASH<span style="color:#1f2937;">FIRE</span></span>
      <div style="font-size:11px;color:#6b7280;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-top:2px;">Land your next role, faster</div>
    </div>

    <!-- Header card -->
    <div style="background:#1f2937;border-radius:12px 12px 0 0;padding:22px 26px;">
      <div style="color:#fbbf24;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">${kicker}</div>
      <div style="color:#fff;font-size:22px;font-weight:700;margin-top:6px;line-height:1.3;">${title}</div>
    </div>

    <!-- Body card -->
    <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px;">
      ${bodyHtml}

      <!-- Inline CTA divider -->
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f3f4f6;text-align:center;">
        <a href="${DASHBOARD_URL}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:8px;font-size:13px;">Open your dashboard →</a>
        <div style="font-size:11px;color:#9ca3af;margin-top:10px;">Need help? Reply to this email or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#ea580c;text-decoration:none;">${SUPPORT_EMAIL}</a>.</div>
      </div>
    </div>

    <!-- Footer -->
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;margin-top:14px;padding:18px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:top;font-size:12px;color:#6b7280;line-height:1.6;">
            <div style="font-weight:700;color:#1f2937;font-size:13px;margin-bottom:4px;">FlashFire</div>
            Application-tracking & job-search concierge<br>
            <a href="${WEBSITE_URL}" style="color:#ea580c;text-decoration:none;">${WEBSITE_URL.replace(/^https?:\/\//, "")}</a>
          </td>
          <td style="vertical-align:top;text-align:right;font-size:12px;color:#6b7280;line-height:1.6;">
            <a href="mailto:${SUPPORT_EMAIL}" style="color:#374151;text-decoration:none;">${SUPPORT_EMAIL}</a><br>
            <a href="${DASHBOARD_URL}" style="color:#374151;text-decoration:none;">Client portal</a>
          </td>
        </tr>
      </table>
    </div>

    <!-- Legal -->
    <div style="text-align:center;padding:14px 8px 4px;font-size:11px;color:#9ca3af;line-height:1.6;">
      © ${year} FlashFire. All rights reserved.<br>
      You're getting this because your FlashFire plan is active.
      If you'd rather not receive these milestone updates, just reply with "unsubscribe" and we'll stop.
    </div>
  </div>
</body>
</html>`;
}

function progressBlock({ planLabel, currentCount, planCap }) {
  const safePct = planCap ? Math.max(0, Math.min(100, (currentCount / planCap) * 100)) : 0;
  return `
    <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:16px 20px;margin:20px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:10px;">
        <tr>
          <td align="left" style="font-size:13px;color:#7c2d12;font-weight:600;">${planLabel} plan</td>
          <td align="right" style="font-size:13px;color:#7c2d12;font-weight:600;">${currentCount} / ${planCap}</td>
        </tr>
      </table>
      <div style="background:#ffedd5;height:8px;border-radius:999px;overflow:hidden;">
        <div style="background:#ea580c;height:8px;width:${safePct}%;border-radius:999px;"></div>
      </div>
      <div style="text-align:right;color:#ea580c;font-size:12px;font-weight:700;margin-top:6px;">${safePct.toFixed(0)}% complete</div>
    </div>`;
}

// Build the email per type.
function buildEmail(type, ctx) {
  const { name, planLabel, planCap, currentCount, threshold } = ctx;

  if (type === 'started') {
    return {
      subject: "Your FlashFire applications have started — resume is ready",
      html: shell({
        kicker: "FLASHFIRE PORTAL",
        title: "We're live — resume done, applications underway",
        bodyHtml: `
          <p style="margin:0 0 16px;color:#374151;font-size:16px;">Hi ${name},</p>
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Two big steps complete in one go: your tailored FlashFire <strong>resume is ready</strong>, and we've <strong>started submitting applications</strong> on your behalf.</p>
          <p style="margin:0 0 16px;color:#374151;font-size:15px;line-height:1.6;">Your <strong>${planLabel}</strong> plan covers <strong>${planCap}</strong> targeted roles. We'll send you a clear checkpoint when key milestones land — and a final note once everything is delivered.</p>
          <p style="margin:0;color:#6b7280;font-size:13px;">Sharpen your interview prep — momentum builds fast from here. Reply with any focus shifts or target companies.</p>`
      })
    };
  }

  if (type === 'count_milestone') {
    return {
      subject: `Update: ${threshold} applications submitted on your ${planLabel} plan`,
      html: shell({
        kicker: "FLASHFIRE PORTAL",
        title: `${threshold} applications submitted`,
        bodyHtml: `
          <p style="margin:0 0 12px;color:#374151;font-size:16px;">Hi ${name},</p>
          <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">Quick checkpoint — we've completed <strong>${threshold} applications</strong> for you under the <strong>${planLabel}</strong> plan. Recruiter responses typically pick up around this point.</p>
          ${progressBlock({ planLabel, currentCount, planCap })}
          <p style="margin:0;color:#6b7280;font-size:13px;">Stay responsive on email and LinkedIn — your team keeps pushing the rest. Reply if you want to retarget.</p>`
      })
    };
  }

  if (type === 'completed') {
    return {
      subject: `Applications complete — your ${planLabel} plan is fully delivered`,
      html: shell({
        kicker: "FLASHFIRE PORTAL",
        title: "Plan complete — all applications delivered",
        bodyHtml: `
          <p style="margin:0 0 12px;color:#374151;font-size:16px;">Hi ${name},</p>
          <p style="margin:0 0 8px;color:#374151;font-size:15px;line-height:1.6;">All <strong>${planCap} applications</strong> under your <strong>${planLabel}</strong> plan are now submitted. Your team continues tracking responses, scheduling interviews, and supporting follow-up.</p>
          ${progressBlock({ planLabel, currentCount: planCap, planCap })}
          <p style="margin:0;color:#6b7280;font-size:13px;">Final stretch — let's land the offer. Reply with any updates, scheduling needs, or new priorities.</p>`
      })
    };
  }

  throw new Error(`Unknown milestone email type: ${type}`);
}

export async function sendMilestoneEmail({ client, type, snapshot = {}, milestoneKey = null }) {
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
    threshold: snapshot.threshold || 0
  };

  const { subject, html } = buildEmail(type, ctx);

  const logSnapshot = {
    planType: client.planType || "",
    planCap: ctx.planCap,
    currentCount: ctx.currentCount,
    percent: ctx.planCap ? Math.round((ctx.currentCount / ctx.planCap) * 100) : 0
  };

  return sendGmailEmail({
    to: toEmail,
    subject,
    html,
    category: "milestone",
    type: milestoneKey || type,
    clientEmail: client.email,
    snapshot: logSnapshot,
    meta: { milestoneType: type, milestoneKey }
  });
}
