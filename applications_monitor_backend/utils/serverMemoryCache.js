/**
 * In-memory caches are per Node process. With multiple instances (Render/Railway/Fly/etc.),
 * a write on instance A does not invalidate caches on B — users see stale data (e.g. dashboard manager).
 *
 * Default: memory cache ON in development, OFF in production. Opt in for single-instance prod:
 *   SERVER_USE_MEMORY_CACHE=1
 * Opt out everywhere:
 *   SERVER_USE_MEMORY_CACHE=0
 */
export function useServerMemoryCache() {
  const v = process.env.SERVER_USE_MEMORY_CACHE;
  if (v === '1' || v === 'true' || v === 'yes') return true;
  if (v === '0' || v === 'false' || v === 'no') return false;
  return process.env.NODE_ENV !== 'production';
}
