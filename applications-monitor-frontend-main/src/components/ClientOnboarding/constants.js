/**
 * Production builds must set VITE_BASE to your API origin. Empty string breaks onboarding
 * (requests go to the static host, not the Node API).
 */
const rawBase = import.meta.env.VITE_BASE;
const trimmed = rawBase != null ? String(rawBase).trim() : '';
export const API_BASE =
  trimmed ||
  (import.meta.env.DEV ? 'http://localhost:8001' : 'https://clients-tracking-backend-580t.onrender.com');

export const LOG = (msg, ...args) => {
  if (import.meta.env.DEV) console.log('[ClientOnboarding]', msg, ...args);
};

export const AUTH_HEADERS = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
});

export const LONG_PRESS_MS = 3500;

/**
 * FlashFire dashboard backend — a DIFFERENT service from API_BASE above.
 * It owns ProfileModel and OnboardingMailState, so the AI summary and the
 * onboarding email sequence (base résumé / cover letter / LinkedIn) are read
 * from here, not from the clients-tracking API. Same value ClientAiSummary.jsx
 * uses, kept in one place so the two can't drift.
 */
export const DASHBOARD_BASE = (
  import.meta.env.VITE_DASHBOARD_BASE ||
  (import.meta.env.DEV ? 'http://localhost:8086' : 'https://dashboard-api.flashfirejobs.com')
).replace(/\/+$/, '');
