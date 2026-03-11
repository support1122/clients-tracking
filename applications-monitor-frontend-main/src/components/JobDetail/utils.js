export function fmtDate(val, withTime = false) {
  if (val == null) return null;
  const raw = typeof val === 'object' && val?.$date ? val.$date : val;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return String(val);
  if (withTime) return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString();
}
