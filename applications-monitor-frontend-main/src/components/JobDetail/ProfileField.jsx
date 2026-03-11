import React from 'react';

export const ProfileField = React.memo(function ProfileField({ label, value, className = '' }) {
  const v = value != null && String(value).trim() ? String(value).trim() : null;
  return (
    <div className={`py-3 border-b border-slate-100 last:border-b-0 ${className}`}>
      <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{label}</span>
      <span className="text-sm font-medium text-slate-800">{v || '—'}</span>
    </div>
  );
});
