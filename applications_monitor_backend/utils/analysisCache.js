/**
 * Shared TTL cache for /api/analytics/client-job-analysis (and related).
 * Must be invalidated when client fields that affect analysis rows change (e.g. dashboard manager).
 */
const _analysisCacheStore = new Map();
export const ANALYSIS_CACHE_TTL = 120_000;
export const LAST_APPLIED_CACHE_TTL = 300_000;

export function getAnalysisCache(key) {
  const e = _analysisCacheStore.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) {
    _analysisCacheStore.delete(key);
    return null;
  }
  return e.val;
}

export function setAnalysisCache(key, val, ttl) {
  _analysisCacheStore.set(key, { val, exp: Date.now() + (ttl || ANALYSIS_CACHE_TTL) });
}

export function clearAnalysisCache() {
  _analysisCacheStore.clear();
}
