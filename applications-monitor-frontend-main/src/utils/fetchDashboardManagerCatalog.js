/**
 * Same roster as Manager Dashboard: GET /api/managers → `dashboard_managers`, active only.
 * Single source of truth with routes that create/edit managers under /manager-dashboard.
 */
export async function fetchDashboardManagerFullNames(apiBase, getHeaders) {
  const base = String(apiBase || '').replace(/\/$/, '');
  if (!base) return [];

  const headers =
    typeof getHeaders === 'function' ? getHeaders() : { ...getHeaders };

  const res = await fetch(`${base}/api/managers`, { headers });

  if (!res.ok) return [];

  const data = await res.json().catch(() => ({}));
  const list = Array.isArray(data.managers) ? data.managers : [];
  const names = list
    .map((m) => (m && m.fullName ? String(m.fullName).trim() : ''))
    .filter(Boolean);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}
