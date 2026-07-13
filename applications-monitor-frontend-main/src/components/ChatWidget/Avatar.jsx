import React from 'react';
import { initials, avatarColor } from '../../utils/chatFormat';

const SIZES = {
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-10 h-10 text-sm'
};

const Avatar = React.memo(function Avatar({ name, email, size = 'md', online }) {
  return (
    <span className="relative inline-flex flex-shrink-0">
      <span
        className={`${SIZES[size] || SIZES.md} ${avatarColor(email)} rounded-full flex items-center justify-center font-bold select-none`}
        title={email}
      >
        {initials(name)}
      </span>
      {online && (
        <span
          className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-2 ring-white"
          title="Online"
        />
      )}
    </span>
  );
});

export default Avatar;
