// Shared motion values for the client-tracking surface. One curve and one
// timing scale keep every animation feeling like a single system: quiet,
// fast, and never bouncy (barely-there elevation, per the design language).
export const SECTION_EASE = [0.25, 0.1, 0.25, 1];

export const OVERLAY_FADE = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.18, ease: 'easeOut' }
};

export const PANEL_RISE = {
  initial: { opacity: 0, scale: 0.98, y: 10 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.985, y: 6 },
  transition: { duration: 0.22, ease: SECTION_EASE }
};
