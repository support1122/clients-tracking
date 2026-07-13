// First two letters for the avatar: initials of the first two words,
// or the first two characters of a single-word name.
export function initials(name) {
  const clean = (name || '').trim();
  if (!clean) return '??';
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return clean.slice(0, 2).toUpperCase();
}

// Deterministic avatar palette per email so a person keeps their color.
const AVATAR_COLORS = [
  'bg-orange-100 text-orange-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-700',
  'bg-teal-100 text-teal-700'
];

export function avatarColor(email) {
  const key = (email || '').toLowerCase();
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

// Short relative time: now, 5m, 2h, 3d, 2w, then a date.
export function timeAgo(dateLike) {
  if (!dateLike) return '';
  const then = new Date(dateLike).getTime();
  if (Number.isNaN(then)) return '';
  const secs = Math.max(0, (Date.now() - then) / 1000);
  if (secs < 60) return 'now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
  if (secs < 2629800) return `${Math.floor(secs / 604800)}w`;
  return new Date(then).toLocaleDateString();
}
