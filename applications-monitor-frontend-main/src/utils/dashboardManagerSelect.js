/**
 * HTML <select> only shows the current value if it matches an <option>.
 * Catalog should come from GET /api/managers (same as Manager Dashboard). Assigned
 * values may still be missing from that list (inactive/legacy/typo) — merge fixes display.
 */

export function buildDashboardManagerSelectOptions(catalogNames, extraAssigned) {
  const byLower = new Map();
  for (const n of catalogNames || []) {
    const t = (n || '').trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (!byLower.has(k)) byLower.set(k, t);
  }
  for (const a of extraAssigned || []) {
    const t = (a || '').trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (!byLower.has(k)) byLower.set(k, t);
  }
  return Array.from(byLower.values()).sort((a, b) => a.localeCompare(b));
}

export function selectValueMatchingOption(stored, options) {
  const t = (stored || '').trim();
  if (!t) return '';
  if (options.includes(t)) return t;
  const hit = options.find((o) => (o || '').trim().toLowerCase() === t.toLowerCase());
  return hit || t;
}
