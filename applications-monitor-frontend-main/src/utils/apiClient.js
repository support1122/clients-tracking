/**
 * Lightweight, dependency-free data-fetching layer.
 *
 * Solves three recurring problems in this app:
 *   1. Race conditions  — `apiFetch` accepts an AbortSignal so callers can cancel
 *      stale in-flight requests (e.g. when the selected client changes).
 *   2. Refetch storms    — `getCached` adds a short TTL cache + in-flight dedupe so
 *      the same GET/POST-read fired by multiple components (or remounts) hits the
 *      network once.
 *   3. Bulk fan-out      — `promisePool` runs many requests with a concurrency cap
 *      instead of one-at-a-time or all-at-once.
 *
 * This is intentionally NOT a full data layer (react-query). It is a thin helper
 * that existing components opt into call-by-call, so behavior stays predictable.
 */

const API_BASE = import.meta.env.VITE_BASE || 'https://clients-tracking-backend.onrender.com';

function authHeaders(extra) {
  return {
    Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`,
    ...(extra || {}),
  };
}

/**
 * Abortable JSON fetch. Returns parsed JSON (or {} on empty body).
 * Throws on non-2xx with `err.status` and `err.body` attached.
 * An aborted request rejects with a DOMException whose `name === 'AbortError'`.
 *
 * @param {string} path  Path beginning with '/'.
 * @param {{method?:string, body?:any, signal?:AbortSignal, headers?:object, parse?:boolean}} opts
 */
export async function apiFetch(path, opts = {}) {
  const { method = 'GET', body, signal, headers, parse = true } = opts;
  const fetchOpts = { method, signal, headers: authHeaders(headers) };
  if (body !== undefined && body !== null) {
    fetchOpts.headers['Content-Type'] = 'application/json';
    fetchOpts.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(`${API_BASE}${path}`, fetchOpts);
  const data = parse ? await res.json().catch(() => ({})) : null;
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

/** True when an error is an aborted-fetch (safe to swallow — not a real failure). */
export function isAbortError(err) {
  return err && (err.name === 'AbortError' || err.code === 20);
}

// ── TTL cache + in-flight dedupe ──────────────────────────────────────────────
const _cache = new Map(); // key -> { data, exp }
const _inflight = new Map(); // key -> Promise

/**
 * Cache-and-dedupe wrapper around a fetcher.
 * - Returns fresh cached data when within TTL.
 * - Collapses concurrent calls for the same key into one network request.
 * - Caches only successful results (errors are never cached).
 *
 * Note: this is read-through caching, NOT subscription-based SWR — a cached value
 * does not auto-refresh a mounted component. Pass `{ force: true }` to bypass the
 * cache (e.g. an explicit "Refresh" button), or call `invalidateCache(prefix)`
 * after a mutation.
 *
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 * @param {{ ttl?: number, force?: boolean }} [options]
 */
export async function getCached(key, fetcher, options = {}) {
  const { ttl = 30_000, force = false } = options;
  const now = Date.now();
  const entry = _cache.get(key);
  if (!force && entry && now <= entry.exp) return entry.data;
  if (_inflight.has(key)) return _inflight.get(key);

  const p = (async () => {
    try {
      const data = await fetcher();
      _cache.set(key, { data, exp: Date.now() + ttl });
      return data;
    } finally {
      _inflight.delete(key);
    }
  })();
  _inflight.set(key, p);
  return p;
}

/** Drop cache entries. No prefix = clear everything; prefix = clear matching keys. */
export function invalidateCache(prefix) {
  if (!prefix) {
    _cache.clear();
    return;
  }
  for (const k of [..._cache.keys()]) {
    if (k.startsWith(prefix)) _cache.delete(k);
  }
}

// ── Concurrency-limited fan-out ───────────────────────────────────────────────
/**
 * Run `worker(item, index)` over `items` with at most `concurrency` in flight.
 * Resolves to an array of { status, value | reason } in input order (never rejects),
 * so a single failure doesn't abort the batch.
 *
 * @template T
 * @param {T[]} items
 * @param {(item:T, index:number) => Promise<any>} worker
 * @param {number} [concurrency=5]
 */
export async function promisePool(items, worker, concurrency = 5) {
  const results = new Array(items.length);
  let next = 0;
  const runners = new Array(Math.min(concurrency, items.length)).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { status: 'fulfilled', value: await worker(items[i], i) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  });
  await Promise.all(runners);
  return results;
}
