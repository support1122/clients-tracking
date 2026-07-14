import React from 'react';
import { motion as Motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { useSectionOpen, useModalUiStore } from '../../store/onboardingStore';
import { SECTION_EASE } from './animation';

/**
 * Collapsible panel for the job detail modal.
 * - Open state lives in the persisted modal UI store (keyed by `id`), so the
 *   user's layout survives job switches and reloads.
 * - Children are only mounted while open: a collapsed section costs one
 *   header row, nothing more.
 * - `summary` renders on the right of the header while collapsed, so the key
 *   fact of a section stays visible without expanding it.
 */
const CollapsibleSection = React.memo(function CollapsibleSection({
  id,
  icon: Icon,
  title,
  summary,
  badge,
  children
}) {
  const open = useSectionOpen(id);
  const toggleSection = useModalUiStore((s) => s.toggleSection);
  const reduceMotion = useReducedMotion();

  return (
    <section className="rounded-xl border border-[#e6e4e1] bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => toggleSection(id)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-[#faf9f8] transition-colors"
      >
        <Motion.span
          animate={{ rotate: open ? 90 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: SECTION_EASE }}
          className="flex-shrink-0 text-gray-400"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </Motion.span>
        {Icon && <Icon className="w-3 h-3 text-gray-400 flex-shrink-0" />}
        <span className="text-xs font-extrabold text-gray-400 uppercase tracking-wider flex-shrink-0">
          {title}
        </span>
        {badge}
        {!open && summary && (
          <span className="ml-auto text-[11px] text-gray-500 truncate min-w-0 pl-3">{summary}</span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <Motion.div
            key="body"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: SECTION_EASE }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1">{children}</div>
          </Motion.div>
        )}
      </AnimatePresence>
    </section>
  );
});

export default CollapsibleSection;
