/**
 * Clear auth storage and redirect to login. Use when token is expired or invalid
 * so the user is not left on a broken screen (e.g. "Failed to fetch users").
 */
export function clearAuthAndRedirect() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('user');
  localStorage.removeItem('ff_admin_jwt');
  window.location.href = '/';
}

/**
 * Returns true if the response indicates auth failure (expired/invalid token).
 * Backend: 401 = no token / access denied; 400 with "Invalid token." = expired or malformed.
 */
export function isAuthFailure(response, data = null) {
  if (response.status === 401) return true;
  if (response.status === 400 && data?.error) {
    const msg = String(data.error).toLowerCase();
    if (msg.includes('invalid token') || msg.includes('token')) return true;
  }
  return false;
}

/**
 * Check if response indicates auth failure; if so, clears storage and redirects.
 * Call after fetch when !response.ok: parse body once, then call this with (response, data).
 * Returns true if auth was invalid (caller should return); false otherwise.
 */
export function handleAuthFailure(response, data = null) {
  if (isAuthFailure(response, data)) {
    clearAuthAndRedirect();
    return true;
  }
  return false;
}
