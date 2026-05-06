// Renders all milestone email templates into one HTML preview, then converts
// to PDF via headless Chrome. Run: `node scripts/buildMilestoneTemplatesPdf.mjs`
// Output: ./milestone-email-templates.pdf and ./milestone-email-templates.html

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PLAN_LABELS = { ignite: "Ignite", professional: "Professional", executive: "Executive", prime: "Prime" };
const PLAN_CAPS   = { ignite: 250, professional: 500, executive: 1200, prime: 160 };

// Sample renders — one per email type per plan family
const SCENARIOS = [
  { type: "started",        planType: "prime",        name: "Anisha Agarwal", currentCount: 12,   threshold: 10 },
  { type: "started",        planType: "ignite",       name: "Rohit Verma",    currentCount: 12,   threshold: 10 },
  { type: "started",        planType: "professional", name: "Priya Sharma",   currentCount: 12,   threshold: 10 },
  { type: "started",        planType: "executive",    name: "Karan Singh",    currentCount: 12,   threshold: 10 },
  { type: "count_milestone",planType: "professional", name: "Priya Sharma",   currentCount: 250,  threshold: 250 },
  { type: "count_milestone",planType: "executive",    name: "Karan Singh",    currentCount: 350,  threshold: 350 },
  { type: "count_milestone",planType: "executive",    name: "Karan Singh",    currentCount: 700,  threshold: 700 },
  { type: "completed",      planType: "prime",        name: "Anisha Agarwal", currentCount: 160,  threshold: 160 },
  { type: "completed",      planType: "ignite",       name: "Rohit Verma",    currentCount: 250,  threshold: 250 },
  { type: "completed",      planType: "professional", name: "Priya Sharma",   currentCount: 500,  threshold: 500 },
  { type: "completed",      planType: "executive",    name: "Karan Singh",    currentCount: 1200, threshold: 1200 }
];

const SUPPORT_EMAIL = "support@flashfirehq.com";
const WEBSITE_URL   = "https://www.flashfirejobs.com";
const DASHBOARD_URL = "https://portal.flashfirejobs.com/";

function shell({ kicker, title, bodyHtml }) {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f3f4f6;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="text-align:center;padding:8px 0 16px;">
      <span style="display:inline-block;font-size:22px;font-weight:800;letter-spacing:0.5px;color:#ea580c;">FLASH<span style="color:#1f2937;">FIRE</span></span>
      <div style="font-size:11px;color:#6b7280;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;margin-top:2px;">Land your next role, faster</div>
    </div>
    <div style="background:#1f2937;border-radius:12px 12px 0 0;padding:22px 26px;">
      <div style="color:#fbbf24;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;font-weight:700;">${kicker}</div>
      <div style="color:#fff;font-size:22px;font-weight:700;margin-top:6px;line-height:1.3;">${title}</div>
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:28px;">
      ${bodyHtml}
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #f3f4f6;text-align:center;">
        <a href="${DASHBOARD_URL}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:600;padding:11px 22px;border-radius:8px;font-size:13px;">Open your dashboard →</a>
        <div style="font-size:11px;color:#9ca3af;margin-top:10px;">Need help? Reply to this email or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:#ea580c;text-decoration:none;">${SUPPORT_EMAIL}</a>.</div>
      </div>
    </div>
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
    <div style="text-align:center;padding:14px 8px 4px;font-size:11px;color:#9ca3af;line-height:1.6;">
      © ${year} FlashFire. All rights reserved.<br>
      You're getting this because your FlashFire plan is active.
      If you'd rather not receive these milestone updates, just reply with "unsubscribe" and we'll stop.
    </div>
  </div>
</body></html>`;
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
  throw new Error(`Unknown type: ${type}`);
}

const titleByType = {
  started: "Applications Started + Resume",
  count_milestone: "Mid-plan Checkpoint",
  completed: "Plan Complete"
};

const sections = SCENARIOS.map((s) => {
  const planLabel = PLAN_LABELS[s.planType] || s.planType;
  const planCap = PLAN_CAPS[s.planType] || 0;
  const ctx = { name: s.name, planLabel, planCap, currentCount: s.currentCount, threshold: s.threshold };
  const { subject, html } = buildEmail(s.type, ctx);
  const innerBody = html.replace(/^[\s\S]*?<body[^>]*>/i, "").replace(/<\/body>[\s\S]*$/i, "");
  return { type: s.type, subject, body: innerBody, scenario: s, planLabel, planCap };
});

function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

const cover = `
<div class="cover">
  <div class="cover-kicker">FLASHFIRE · CLIENT MILESTONE EMAILS</div>
  <h1>Email Templates Reference</h1>
  <p class="cover-sub">Per-plan email schedule sent from the Client Tracking Portal. Generated ${new Date().toLocaleDateString()}.</p>

  <h2 style="font-size:14px;color:#374151;margin:18px 0 8px;">Per-plan schedule</h2>
  <table class="cover-table">
    <thead><tr><th>Plan</th><th>Cap</th><th>Emails</th></tr></thead>
    <tbody>
      <tr><td>Prime</td><td>160</td><td>Started + Resume · Completed (2)</td></tr>
      <tr><td>Ignite</td><td>250</td><td>Started + Resume · Completed (2)</td></tr>
      <tr><td>Professional</td><td>500</td><td>Started + Resume · 250 done · Completed (3)</td></tr>
      <tr><td>Executive</td><td>1200</td><td>Started + Resume · 350 done · 700 done · Completed (4)</td></tr>
    </tbody>
  </table>

  <h2 style="font-size:14px;color:#374151;margin:18px 0 8px;">Trigger rules</h2>
  <ul class="cover-list">
    <li><strong>Started</strong> — fires once per client when: resume done + Apps-In-Progress + count ≥ 10 jobs in dashboard</li>
    <li><strong>Count milestones</strong> — fires when raw count (excluding "removed") crosses each threshold</li>
    <li><strong>Completed</strong> — fires when count reaches plan cap</li>
    <li><strong>Cron</strong> — runs hourly (top of every hour, IST)</li>
    <li><strong>Plan upgrade</strong> — clears count/completed flags so new plan thresholds re-evaluate. "Started" stays once-only.</li>
  </ul>
</div>`;

const body = sections.map((s) => `
<section class="page">
  <div class="meta">
    <div class="badge">${titleByType[s.type]}</div>
    <div class="meta-row"><span>Plan:</span> ${s.planLabel}${s.planCap ? ` · cap ${s.planCap}` : ""}</div>
    <div class="meta-row"><span>Recipient:</span> ${s.scenario.name} (sample)</div>
    <div class="meta-row"><span>Threshold:</span> ${s.scenario.threshold} applications</div>
    <div class="meta-row"><span>Subject:</span> ${escapeHtml(s.subject)}</div>
  </div>
  <div class="preview">${s.body}</div>
</section>`).join("\n");

const finalHtml = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8">
<title>FlashFire Milestone Email Templates</title>
<style>
  @page { size: A4; margin: 18mm; }
  html, body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; }
  .cover { padding: 40px 0 60px; border-bottom: 1px solid #e5e7eb; margin-bottom: 32px; page-break-after: always; }
  .cover-kicker { color: #ea580c; font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .cover h1 { font-size: 32px; margin: 8px 0 12px; color: #1f2937; }
  .cover-sub { color: #6b7280; font-size: 14px; margin-bottom: 24px; }
  .cover-list { color: #374151; font-size: 13px; line-height: 1.8; padding-left: 20px; margin: 0 0 14px; }
  .cover-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .cover-table th, .cover-table td { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: left; font-size: 13px; }
  .cover-table th { background: #fff7ed; color: #7c2d12; font-weight: 700; }
  section.page { page-break-inside: avoid; page-break-after: always; padding: 18px 0; }
  section.page:last-child { page-break-after: auto; }
  .meta { padding: 14px 18px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; margin-bottom: 16px; }
  .badge { display: inline-block; background: #ea580c; color: #fff; font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; padding: 4px 10px; border-radius: 999px; margin-bottom: 8px; }
  .meta-row { font-size: 13px; color: #374151; margin-top: 3px; }
  .meta-row span { color: #6b7280; font-weight: 600; margin-right: 4px; }
  .preview { border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: #fff; }
</style>
</head><body>
${cover}
${body}
</body></html>`;

const htmlPath = path.join(ROOT, "milestone-email-templates.html");
const pdfPath  = path.join(ROOT, "milestone-email-templates.pdf");
fs.writeFileSync(htmlPath, finalHtml, "utf8");
console.log(`HTML written: ${htmlPath}`);

const candidates = [process.env.CHROME_BIN, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean);

let success = false;
for (const bin of candidates) {
  try {
    execFileSync(bin, [
      "--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`, `file://${htmlPath}`
    ], { stdio: "inherit" });
    success = true;
    console.log(`PDF written via ${bin}: ${pdfPath}`);
    break;
  } catch {}
}
if (!success) {
  console.error("No Chrome found. Open HTML and Print → Save as PDF:", htmlPath);
  process.exit(2);
}
