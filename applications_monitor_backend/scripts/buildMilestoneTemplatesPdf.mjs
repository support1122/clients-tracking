// Renders all 6 milestone email templates into one HTML preview, then converts
// to PDF via headless Chrome. Run: `node scripts/buildMilestoneTemplatesPdf.mjs`
// Output: ./milestone-email-templates.pdf and ./milestone-email-templates.html
//
// Requires Chrome / Chromium installed locally (we shell out to it for PDF render).

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

// ── Sample data per scenario ─────────────────────────────────────────────────
const SCENARIOS = [
  { type: "resume_ready",  name: "Anisha Agarwal", planType: "ignite",       currentCount: 12,   percent: 0 },
  { type: "apps_started",  name: "Anisha Agarwal", planType: "ignite",       currentCount: 12,   percent: 0 },
  { type: "pct30",         name: "Rajat Mehta",    planType: "professional", currentCount: 150,  percent: 30 },
  { type: "pct50",         name: "Priya Sharma",   planType: "executive",    currentCount: 600,  percent: 50 },
  { type: "pct75",         name: "Karan Singh",    planType: "executive",    currentCount: 900,  percent: 75 },
  { type: "pct100",        name: "Ananya Patel",   planType: "prime",        currentCount: 160,  percent: 100 }
];

// ── Inline copy of the template module (so we can render without env / SendGrid) ─
const PLAN_LABELS = { ignite: "Ignite", professional: "Professional", executive: "Executive", prime: "Prime" };
const PLAN_CAPS   = { ignite: 250, professional: 500, executive: 1200, prime: 160 };

function shell({ kicker, title, bodyHtml }) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#1f2937;border-radius:12px 12px 0 0;padding:20px 24px;">
      <div style="color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;">${kicker}</div>
      <div style="color:#fff;font-size:20px;font-weight:700;margin-top:4px;">${title}</div>
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:24px;">
      ${bodyHtml}
    </div>
    <div style="text-align:center;padding:16px 0;">
      <span style="color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} FlashFire</span>
    </div>
  </div>
</body></html>`;
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

// ── Build combined preview ───────────────────────────────────────────────────
const sections = SCENARIOS.map((s) => {
  const planLabel = PLAN_LABELS[s.planType] || s.planType;
  const planCap = PLAN_CAPS[s.planType] || 0;
  const ctx = { name: s.name, planLabel, planCap, currentCount: s.currentCount, percent: s.percent };
  const { subject, html } = TEMPLATES[s.type](ctx);
  const innerBody = html
    .replace(/^[\s\S]*?<body[^>]*>/i, "")
    .replace(/<\/body>[\s\S]*$/i, "");
  return { type: s.type, subject, body: innerBody, scenario: s, planLabel, planCap };
});

const titleByType = {
  resume_ready: "Resume Ready",
  apps_started: "Applications Started",
  pct30: "30% Milestone",
  pct50: "50% Milestone",
  pct75: "75% Milestone",
  pct100: "100% Milestone"
};

const cover = `
<div class="cover">
  <div class="cover-kicker">FLASHFIRE · CLIENT MILESTONE EMAILS</div>
  <h1>Email Templates Reference</h1>
  <p class="cover-sub">Sample renders of the six client notifications sent from the Application Tracking Portal. Generated ${new Date().toLocaleDateString()}.</p>
  <ul class="cover-list">
    <li><strong>Resume Ready</strong> — fires when client crosses 10 jobs after resume is complete</li>
    <li><strong>Applications Started</strong> — fires once when client enters Applications In Progress</li>
    <li><strong>30 / 50 / 75 / 100% milestones</strong> — fired by 00:00 IST cron based on plan cap</li>
  </ul>
  <table class="cover-table">
    <thead><tr><th>Plan</th><th>Application cap</th></tr></thead>
    <tbody>
      <tr><td>Prime</td><td>160</td></tr>
      <tr><td>Ignite</td><td>250</td></tr>
      <tr><td>Professional</td><td>500</td></tr>
      <tr><td>Executive</td><td>1200</td></tr>
    </tbody>
  </table>
</div>`;

const body = sections.map((s) => `
<section class="page">
  <div class="meta">
    <div class="badge">${titleByType[s.type]}</div>
    <div class="meta-row"><span>Recipient:</span> ${s.scenario.name} (sample)</div>
    <div class="meta-row"><span>Plan:</span> ${s.planLabel}${s.planCap ? ` · cap ${s.planCap}` : ""}</div>
    <div class="meta-row"><span>Subject:</span> ${escapeHtml(s.subject)}</div>
  </div>
  <div class="preview">${s.body}</div>
</section>`).join("\n");

function escapeHtml(s) { return String(s || "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }

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
  .cover-list { color: #374151; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0 0 28px; }
  .cover-table { width: 100%; border-collapse: collapse; max-width: 360px; margin-top: 8px; }
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

// Try several known Chrome binaries
const candidates = [
  process.env.CHROME_BIN,
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser"
].filter(Boolean);

let success = false;
for (const bin of candidates) {
  try {
    execFileSync(bin, [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-pdf-header-footer",
      `--print-to-pdf=${pdfPath}`,
      `file://${htmlPath}`
    ], { stdio: "inherit" });
    success = true;
    console.log(`PDF written via ${bin}: ${pdfPath}`);
    break;
  } catch (e) {
    // try next
  }
}

if (!success) {
  console.error("Could not find a Chrome/Chromium binary. Open the HTML in a browser and Print → Save as PDF:");
  console.error(`  ${htmlPath}`);
  process.exit(2);
}
