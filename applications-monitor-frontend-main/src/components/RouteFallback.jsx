import React, { Suspense } from 'react';

// Route-level loading UI, kept out of main.jsx so that file stays a pure entry
// point. Defining components there tripped react-refresh/only-export-components
// and cost fast refresh across every route.

/** Spinner shown while a lazily-loaded route chunk downloads. */
export const RouteFallback = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-8 h-8 border-4 border-orange-400 border-t-transparent rounded-full animate-spin" />
  </div>
);

/** Wraps a lazy route element in the shared fallback. */
export const Lazy = ({ children }) => <Suspense fallback={<RouteFallback />}>{children}</Suspense>;

export default Lazy;
