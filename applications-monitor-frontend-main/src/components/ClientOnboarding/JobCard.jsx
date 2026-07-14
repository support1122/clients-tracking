import React, { useState, useEffect, useRef } from 'react';
import { ArrowUpDown, CheckCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { STATUS_LABELS, useClientProfileStore } from '../../store/onboardingStore';
import { getAllowedStatusesForPlan } from './helpers';
import { initials, avatarColor } from '../../utils/chatFormat';

// Next-step wording for the single readiness line (replaces 4 stacked chips)
const PENDING_LABELS = {
  dashboard: 'Dashboard pending',
  resume: 'Resume pending',
  coverLinkedIn: 'Cover + LinkedIn pending',
  portfolio: 'Portfolio pending'
};

const JobCard = React.memo(({
  job,
  draggedJobId,
  isAdmin,
  visibleColumns,
  onMoveTo,
  onDragStart,
  onDragEnd,
  onCardClick,
  onLongPressStart,
  onLongPressEnd,
  onHoverStart,
  onHoverEnd,
  jobAnalysis,
  showJobAnalysis,
  jobAnalysisLoading = false
}) => {
  const isDragging = draggedJobId === job._id;
  const [moveDropdownOpen, setMoveDropdownOpen] = useState(false);
  const moveDropdownRef = useRef(null);

  useEffect(() => {
    if (!moveDropdownOpen) return;
    const close = (e) => {
      if (moveDropdownRef.current && !moveDropdownRef.current.contains(e.target)) setMoveDropdownOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [moveDropdownOpen]);

  const allowed = getAllowedStatusesForPlan(job.planType);
  const moveToOptions = (visibleColumns || []).filter((s) => allowed.includes(s) && s !== job.status);

  const planLower = (job.planType || '').toLowerCase();
  const isExecutive = planLower === 'executive' || planLower.includes('executive');
  const hasLinkedInCoverLetter = ['professional', 'executive'].includes(planLower);
  const emailKey = (job.clientEmail || '').toLowerCase().trim();
  const profileCacheEntry = useClientProfileStore((s) => (emailKey ? s.profiles[emailKey] : undefined));
  const dashboardFromStore =
    profileCacheEntry != null && typeof profileCacheEntry.profileComplete === 'boolean';
  const hasDashboard = dashboardFromStore
    ? profileCacheEntry.profileComplete === true
    : job.profileComplete === true;
  const dashboardUnchecked = dashboardFromStore ? false : job.profileComplete == null;
  const attachmentNames = (job.attachments || []).map((a) => (a.name || '').trim()).filter(Boolean);
  const hasResume = attachmentNames.some((n) => /^resume$/i.test(n));
  const hasCoverLetter = attachmentNames.some((n) => /cover\s*letter/i.test(n));
  const hasPortfolio = attachmentNames.some((n) => /portfolio/i.test(n));
  const steps = [
    { key: 'dashboard', done: hasDashboard, unchecked: dashboardUnchecked },
    { key: 'resume', done: hasResume },
    ...(hasLinkedInCoverLetter ? [{ key: 'coverLinkedIn', done: hasCoverLetter }] : []),
    ...(isExecutive ? [{ key: 'portfolio', done: hasPortfolio }] : [])
  ];
  const firstIncompleteIndex = steps.findIndex((s) => !s.done && !s.unchecked);
  const allDone = firstIncompleteIndex === -1 && !steps.some((s) => s.unchecked);

  // "5761 · Macon Moring" — number in accent, name in ink
  const num = job.clientNumber;
  let displayName = (job.clientName || '').trim();
  if (num != null && displayName.startsWith(`${num} - `)) displayName = displayName.slice(`${num} - `.length).trim();

  const isPaused = !!job.clientIsPaused;
  const isInactive = job.clientStatus === 'inactive';
  const railClass = isInactive
    ? 'border-l-[3px] border-l-rose-300'
    : isPaused
      ? 'border-l-[3px] border-l-amber-400'
      : '';

  const lastApplied = jobAnalysis?.lastAppliedOperatorName
    ? jobAnalysis.lastAppliedOperatorName.charAt(0).toUpperCase() + jobAnalysis.lastAppliedOperatorName.slice(1).toLowerCase()
    : '';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, job)}
      onDragEnd={onDragEnd}
      onMouseEnter={() => onHoverStart?.(job)}
      onMouseDown={(e) => { e.button === 0 && onLongPressStart(e, job); }}
      onMouseUp={onLongPressEnd}
      onMouseLeave={(e) => { onLongPressEnd(e); onHoverEnd?.(); }}
      onTouchStart={(e) => onLongPressStart(e, job)}
      onTouchEnd={onLongPressEnd}
      onTouchCancel={onLongPressEnd}
      onClick={() => onCardClick(job)}
      className={`group bg-white rounded-[10px] px-3.5 py-3 border border-[#e6e4e1] ${railClass} shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] hover:border-[#d9d5d0] transition-[box-shadow,border-color,opacity,transform] duration-150 ease-out cursor-grab active:cursor-grabbing relative ${isDragging ? 'opacity-50 scale-[0.98] ring-2 ring-primary/20' : ''}`}
    >
      {/* Row 1: number · name — age */}
      <div className="flex items-baseline gap-1.5">
        <h4 className="font-bold text-gray-900 text-sm leading-snug truncate min-w-0">
          {num != null && <span className="text-primary tabular-nums">{num}</span>}
          {num != null && <span className="text-gray-300 font-normal"> · </span>}
          {displayName || '—'}
        </h4>
        {isAdmin && job.adminUnreadCount > 0 && (
          <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none flex-shrink-0">
            {job.adminUnreadCount > 99 ? '99+' : job.adminUnreadCount}
          </span>
        )}
        {job.pendingMoveRequest?.active && (
          <span className="flex items-center gap-0.5 px-1.5 h-[18px] rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold leading-none flex-shrink-0" title={`Pending move to ${STATUS_LABELS[job.pendingMoveRequest.targetStatus] || ''}`}>
            <ArrowUpDown className="w-2.5 h-2.5" /> Move
          </span>
        )}
        {job.daysInPipeline != null && (
          <span className="ml-auto text-[11px] text-gray-400 tabular-nums whitespace-nowrap flex-shrink-0" title="Days since profile completed">
            {job.daysInPipeline}d
          </span>
        )}
      </div>

      {/* Row 2: plan + state pills */}
      <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
        <span className="truncate">{job.planType || 'Professional'}</span>
        {isPaused && (
          <span className="text-[10.5px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-px flex-shrink-0" title="Days since client was set to Paused">
            Paused{job.clientPausedDays != null ? ` · ${job.clientPausedDays}d` : ''}
          </span>
        )}
        {isInactive && (
          <span className="text-[10.5px] font-semibold text-rose-700 bg-rose-50 rounded-full px-2 py-px flex-shrink-0">Inactive</span>
        )}
      </div>

      {/* Row 3: readiness dots + the one actionable next step */}
      <div className="flex items-center gap-1.5 mt-2.5 text-[11.5px]">
        {steps.map((s, idx) => (
          <span
            key={s.key}
            className={`rounded-full flex-shrink-0 ${
              s.done
                ? 'w-[7px] h-[7px] bg-green-500'
                : s.unchecked
                  ? 'w-[7px] h-[7px] bg-sky-300 animate-pulse'
                  : idx === firstIncompleteIndex
                    ? 'w-2 h-2 border-2 border-primary bg-transparent'
                    : 'w-[7px] h-[7px] bg-gray-300'
            }`}
          />
        ))}
        <span className="ml-1 min-w-0 truncate">
          {allDone ? (
            <span className="inline-flex items-center gap-1 text-green-700 font-semibold"><CheckCircle className="w-3 h-3" /> All steps done</span>
          ) : firstIncompleteIndex !== -1 ? (
            <span className="font-semibold text-gray-800">{PENDING_LABELS[steps[firstIncompleteIndex].key]}</span>
          ) : (
            <span className="text-gray-400">Dashboard checking…</span>
          )}
        </span>
      </div>

      {/* Row 4: one quiet metrics line */}
      {showJobAnalysis && (
        <div className="flex items-center gap-3.5 mt-2.5 pt-2 border-t border-[#efedeb] text-[11.5px] text-gray-500 tabular-nums">
          {jobAnalysisLoading && !jobAnalysis ? (
            <span className="h-3 w-40 rounded bg-gray-100 animate-pulse" />
          ) : (
            <>
              <span><b className="font-semibold text-gray-900">{(jobAnalysis?.applied ?? 0).toLocaleString()}</b> applied</span>
              <span><b className="font-semibold text-gray-900">{jobAnalysis?.interviewing ?? 0}</b> interviews</span>
              <span><b className={`font-semibold ${jobAnalysis?.removed ? 'text-amber-700' : 'text-gray-900'}`}>{jobAnalysis?.removed ?? 0}</b> removed</span>
            </>
          )}
        </div>
      )}

      {/* Row 5: owner + move */}
      <div className="flex items-center gap-2 mt-2.5">
        {job.dashboardManagerName ? (
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-gray-500 min-w-0" title={`Dashboard Manager: ${job.dashboardManagerName}`}>
            <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-gray-400 flex-shrink-0">DM</span>
            <span className={`w-[18px] h-[18px] rounded-full text-[8.5px] font-bold grid place-items-center flex-shrink-0 ${avatarColor(job.dashboardManagerName.toLowerCase())}`}>
              {initials(job.dashboardManagerName)}
            </span>
            <span className="truncate">
              <span className="font-semibold text-gray-700">{job.dashboardManagerName}</span>
              {showJobAnalysis && !jobAnalysisLoading && (
                lastApplied
                  ? <span className="text-gray-400"> · last by {lastApplied}</span>
                  : <span className="text-rose-500"> · not started</span>
              )}
              {job.linkedInMemberName && <span className="text-gray-400"> · {job.linkedInMemberName}</span>}
            </span>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-400" title="No Dashboard Manager assigned">
            <span className="text-[8px] font-bold uppercase tracking-[0.08em]">DM</span>
            <span className="w-[18px] h-[18px] rounded-full border border-dashed border-gray-300 flex-shrink-0" />
            <em className="not-italic">unassigned</em>
          </span>
        )}
        {isAdmin && onMoveTo && moveToOptions.length > 0 && (
          <div className="relative ml-auto flex-shrink-0" ref={moveDropdownRef}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setMoveDropdownOpen((v) => !v); }}
              className="flex items-center gap-1 text-[11.5px] font-semibold text-gray-500 bg-white hover:text-primary border border-[#e6e4e1] hover:border-orange-200 rounded-lg px-2.5 py-1 transition-colors"
            >
              Move
              <ChevronDown className={`w-3 h-3 transition-transform ${moveDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            {moveDropdownOpen && (
              <div
                className="absolute right-0 bottom-full mb-1 z-50 min-w-[200px] max-h-[280px] overflow-y-auto py-1 bg-white rounded-xl border border-gray-200 shadow-lg"
                onClick={(e) => e.stopPropagation()}
              >
                {moveToOptions.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onMoveTo(job, status); setMoveDropdownOpen(false); }}
                    className="w-full text-left px-3 py-2 text-sm font-medium text-gray-800 hover:bg-orange-50 hover:text-primary transition-colors flex items-center justify-between gap-2"
                  >
                    {STATUS_LABELS[status] || status}
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.job._id === nextProps.job._id &&
    prevProps.job.clientName === nextProps.job.clientName &&
    prevProps.job.clientNumber === nextProps.job.clientNumber &&
    prevProps.job.status === nextProps.job.status &&
    prevProps.job.dashboardManagerName === nextProps.job.dashboardManagerName &&
    prevProps.job.profileComplete === nextProps.job.profileComplete &&
    prevProps.job.linkedInMemberName === nextProps.job.linkedInMemberName &&
    prevProps.job.planType === nextProps.job.planType &&
    prevProps.job.jobNumber === nextProps.job.jobNumber &&
    prevProps.job.clientStatus === nextProps.job.clientStatus &&
    prevProps.job.clientIsPaused === nextProps.job.clientIsPaused &&
    prevProps.job.clientPausedDays === nextProps.job.clientPausedDays &&
    prevProps.job.adminUnreadCount === nextProps.job.adminUnreadCount &&
    prevProps.draggedJobId === nextProps.draggedJobId &&
    prevProps.visibleColumns === nextProps.visibleColumns &&
    prevProps.showJobAnalysis === nextProps.showJobAnalysis &&
    prevProps.jobAnalysis?.saved === nextProps.jobAnalysis?.saved &&
    prevProps.jobAnalysis?.applied === nextProps.jobAnalysis?.applied &&
    prevProps.jobAnalysis?.interviewing === nextProps.jobAnalysis?.interviewing &&
    prevProps.jobAnalysis?.offer === nextProps.jobAnalysis?.offer &&
    prevProps.jobAnalysis?.rejected === nextProps.jobAnalysis?.rejected &&
    prevProps.jobAnalysis?.removed === nextProps.jobAnalysis?.removed &&
    prevProps.jobAnalysis?.lastAppliedOperatorName === nextProps.jobAnalysis?.lastAppliedOperatorName &&
    prevProps.jobAnalysisLoading === nextProps.jobAnalysisLoading &&
    prevProps.job.pendingMoveRequest?.active === nextProps.job.pendingMoveRequest?.active &&
    (prevProps.job.attachments || []).length === (nextProps.job.attachments || []).length &&
    (prevProps.job.attachments || []).every((a, i) => (nextProps.job.attachments || [])[i]?.name === a?.name)
  );
});

JobCard.displayName = 'JobCard';
export default JobCard;
