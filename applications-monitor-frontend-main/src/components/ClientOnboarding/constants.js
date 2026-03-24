/**
 * Production builds must set VITE_BASE to your API origin. Empty string breaks onboarding
 * (requests go to the static host, not the Node API).
 */
const rawBase = import.meta.env.VITE_BASE;
const trimmed = rawBase != null ? String(rawBase).trim() : '';
export const API_BASE =
  trimmed ||
  (import.meta.env.DEV ? 'http://localhost:8001' : 'https://clients-tracking-backend.onrender.com');

export const LOG = (msg, ...args) => {
  if (import.meta.env.DEV) console.log('[ClientOnboarding]', msg, ...args);
};

export const AUTH_HEADERS = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
});

export const LONG_PRESS_MS = 3500;
