export const API_BASE = import.meta.env.VITE_BASE || '';

export const LOG = (msg, ...args) => {
  if (import.meta.env.DEV) console.log('[ClientOnboarding]', msg, ...args);
};

export const AUTH_HEADERS = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
});

export const LONG_PRESS_MS = 3500;
