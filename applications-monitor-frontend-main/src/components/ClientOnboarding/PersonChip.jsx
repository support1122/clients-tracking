import React from 'react';
import { initials, avatarColor } from '../../utils/chatFormat';

/**
 * Compact identity chip: role eyebrow (DM / CSM / …) + initials avatar + name.
 * The avatar color is hashed from the name, so the same person renders the
 * same color on every surface — recognition without reading.
 */
const PersonChip = React.memo(function PersonChip({ role, name, title }) {
  if (!name) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 bg-white border border-[#e6e4e1] rounded-full pl-1 pr-2.5 py-[3px] max-w-full"
      title={title || `${role}: ${name}`}
    >
      <span className={`w-5 h-5 rounded-full grid place-items-center text-[8px] font-bold flex-shrink-0 ${avatarColor(name.toLowerCase())}`}>
        {initials(name)}
      </span>
      <span className="flex flex-col leading-[1.05] min-w-0">
        <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-gray-400">{role}</span>
        <span className="text-[11px] font-semibold text-gray-800 truncate">{name}</span>
      </span>
    </span>
  );
});

export default PersonChip;
