import { API_BASE } from '../components/ClientOnboarding/constants';
import { clearAuthAndRedirect } from './authUtils';

/**
 * Sliding 30-day session.
 * Tokens are issued with a 30-day hard cap; whenever the stored token is more
 * than REFRESH_AFTER_MS old we silently exchange it for a fresh one, so anyone
 * active at least once every 30 days never sees a login screen again — while a
 * stolen token still dies within 30 days and a deactivated account is cut off
 * at its next refresh.
 */
const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000; // rotate once a day
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000; // re-check every 6 h in long-lived tabs

let checkTimer = null;
let refreshing = false;

// Decode the JWT payload (base64url) — no verification needed client-side,
// we only read iat/exp for scheduling.
function decodePayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export async function refreshTokenIfStale({ force = false } = {}) {
  const token = localStorage.getItem('authToken');
  if (!token || refreshing) return;
  const payload = decodePayload(token);
  if (!payload?.iat) return;

  const ageMs = Date.now() - payload.iat * 1000;
  const expired = payload.exp && Date.now() >= payload.exp * 1000;
  if (expired) {
    // Nothing to exchange — session is over (>30 days idle).
    clearAuthAndRedirect();
    return;
  }
  if (!force && ageMs < REFRESH_AFTER_MS) return;

  refreshing = true;
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
    if (res.status === 401) {
      // Account disabled or removed — end the session now.
      clearAuthAndRedirect();
      return;
    }
    if (!res.ok) return; // transient failure — current token is still valid, retry next check
    const data = await res.json();
    if (data?.token) {
      localStorage.setItem('authToken', data.token);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
    }
  } catch {
    // network hiccup — token still valid, next interval retries
  } finally {
    refreshing = false;
  }
}

export function startTokenRefresh() {
  refreshTokenIfStale();
  clearInterval(checkTimer);
  checkTimer = setInterval(refreshTokenIfStale, CHECK_EVERY_MS);
  // Also refresh when the user returns to a long-backgrounded tab.
  document.addEventListener('visibilitychange', onVisible);
}

function onVisible() {
  if (!document.hidden) refreshTokenIfStale();
}

export function stopTokenRefresh() {
  clearInterval(checkTimer);
  checkTimer = null;
  document.removeEventListener('visibilitychange', onVisible);
}
