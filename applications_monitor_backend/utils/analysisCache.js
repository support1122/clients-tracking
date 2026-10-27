/**
 * Shared TTL cache for /api/analytics/client-job-analysis (and related).
 * Must be invalidated when client fields that affect analysis rows change (e.g. dashboard manager).
 * Disabled in production by default (see utils/serverMemoryCache.js) for multi-instance correctness.
 */
import { useServerMemoryCache } from './serverMemoryCache.js';

const _analysisCacheStore = new Map();
// 30s (was 120s): the team reads these numbers to decide who needs attention, so
// two minutes of lag was visible. Not lower, because every miss is a
// full-collection aggregation; with in-flight dedupe in the route this caps the
// scan at roughly two per minute per key regardless of how many people look.
export const ANALYSIS_CACHE_TTL = 30_000;
// 60s (was 300s): the last-applied $sort over every applied job is the heaviest
// stage, so it keeps a longer TTL than the main payload, but 5 minutes made the
// "last applied operator" column lag even after a forced Refresh. Refresh now
// bypasses it entirely (see the route); this bounds the lag for normal loads.
export const LAST_APPLIED_CACHE_TTL = 60_000;

export function getAnalysisCache(key) {
  if (!useServerMemoryCache()) return null;
  const e = _analysisCacheStore.get(key);
  if (!e) return null;
  if (Date.now() > e.exp) {
    _analysisCacheStore.delete(key);
    return null;
  }
  return e.val;
}

export function setAnalysisCache(key, val, ttl) {
  if (!useServerMemoryCache()) return;
  _analysisCacheStore.set(key, { val, exp: Date.now() + (ttl || ANALYSIS_CACHE_TTL) });
}

// Bumped on every clear. A compute that started before a clear compares it on
// finish and skips storing, so an edit made mid-compute cannot be overwritten by
// the pre-edit payload for a whole TTL.
let _generation = 0;
export const analysisCacheGeneration = () => _generation;

export function clearAnalysisCache() {
  _generation += 1;
  _analysisCacheStore.clear();
}
