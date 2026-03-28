/**
 * IST-based parsing and incentive helpers for extension jobs report.
 * Job timestamps are stored as strings like "27/3/2026, 8:35:03 am" (en-US, Asia/Kolkata).
 */

export const IST_TZ = 'Asia/Kolkata';

/** Parse YYYY-MM-DD to UTC Date range [start of first day IST, end of last day IST] inclusive. */
export function istYmdRangeToUtcBounds(startYmd, endYmd) {
  const start = new Date(`${startYmd}T00:00:00.000+05:30`);
  const end = new Date(`${endYmd}T23:59:59.999+05:30`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) {
    return null;
  }
  return { start, end };
}

/**
 * Parse job date string to Date (instant). Tries dateAdded first, then fallback string.
 */
export function parseJobDateTimeIST(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  const m = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\s*(am|pm)/i
  );
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const y = parseInt(m[3], 10);
  let h = parseInt(m[4], 10);
  const mi = parseInt(m[5], 10);
  const sec = parseInt(m[6], 10);
  const ap = m[7].toLowerCase();
  if (ap === 'pm' && h !== 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  const iso = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(sec).padStart(2, '0')}+05:30`;
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function incentiveSlabFromTotalJobs(totalJobs) {
  const n = Number(totalJobs) || 0;
  if (n < 20) return 0;
  if (n <= 29) return 50;
  if (n <= 34) return 70;
  if (n <= 39) return 80;
  return 100;
}

/**
 * Incentive slab based on qualified clients (clients with 20+ jobs).
 * A client "qualifies" when the operator adds 20+ job cards for them in a day.
 */
export function incentiveSlabFromQualifiedClients(qualifiedClients) {
  const n = Number(qualifiedClients) || 0;
  if (n < 1) return 0;
  if (n === 1) return 50;
  if (n === 2) return 70;
  if (n === 3) return 80;
  return 100; // 4+
}

/**
 * Get today's IST date as YYYY-MM-DD.
 */
export function todayIstYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

/** Mongo $function body (string): parse dateAdded or createdAt to Date; must be self-contained. */
export const MONGO_PARSE_JOB_DATETIME_BODY = `function (dateAdded, createdAt) {
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function parseOne(str) {
    if (!str || typeof str !== 'string') return null;
    var s = str.trim();
    var m = s.match(/^([0-9]{1,2})\\/([0-9]{1,2})\\/([0-9]{4}),\\s*([0-9]{1,2}):([0-9]{2}):([0-9]{2})\\s*(am|pm)/i);
    if (!m) return null;
    var d = parseInt(m[1], 10);
    var mo = parseInt(m[2], 10);
    var y = parseInt(m[3], 10);
    var h = parseInt(m[4], 10);
    var mi = parseInt(m[5], 10);
    var sec = parseInt(m[6], 10);
    var ap = m[7].toLowerCase();
    if (ap === 'pm' && h !== 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    var iso = y + '-' + pad2(mo) + '-' + pad2(d) + 'T' + pad2(h) + ':' + pad2(mi) + ':' + pad2(sec) + '+05:30';
    var dt = new Date(iso);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return parseOne(dateAdded) || parseOne(createdAt);
}`;
