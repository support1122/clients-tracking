import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  MoreHorizontal,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  AlertCircle,
  CheckCircle
} from 'lucide-react';
import { STATUS_LABELS } from '../../store/onboardingStore';
import { getAllowedStatusesForPlan, clientDisplayName } from './helpers';

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
  showJobAnalysis
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
  const hasDashboard = job.profileComplete === true;
  const dashboardUnchecked = job.profileComplete == null;
  const attachmentNames = (job.attachments || []).map((a) => (a.name || '').trim()).filter(Boolean);
  const hasResume = attachmentNames.some((n) => /^resume$/i.test(n));
  const hasCoverLetter = attachmentNames.some((n) => /cover\s*letter/i.test(n));
  const hasPortfolio = attachmentNames.some((n) => /portfolio/i.test(n));
  const steps = [
    { key: 'dashboard', label: dashboardUnchecked ? 'Dashboard checking…' : 'Dashboard details', labelDone: 'Dashboard details', done: hasDashboard, unchecked: dashboardUnchecked },
    { key: 'resume', label: 'Resume not sent', labelDone: 'Resume sent', done: hasResume },
    ...(hasLinkedInCoverLetter ? [{ key: 'coverLinkedIn', label: 'Cover and LinkedIn Pending', labelDone: 'Cover and LinkedIn', done: hasCoverLetter }] : []),
    ...(isExecutive ? [{ key: 'portfolio', label: 'Portfolio Pending', labelDone: 'Portfolio', done: hasPortfolio }] : [])
  ];
  const firstIncompleteIndex = steps.findIndex((s) => !s.done && !s.unchecked);

  const getCardBackgroundColor = () => {
    if (job.clientStatus === 'inactive') return 'bg-red-50 border-red-200';
    if (job.clientIsPaused) return 'bg-yellow-50 border-yellow-200';
    return 'bg-white border-transparent';
  };

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
      className={`group ${getCardBackgroundColor()} rounded-xl p-4 border shadow-sm hover:shadow-md hover:border-orange-100 transition-[transform,opacity,box-shadow,border-color] duration-200 ease-out cursor-grab active:cursor-grabbing relative ${isDragging ? 'opacity-50 scale-[0.98] shadow-lg ring-2 ring-primary/20 rotate-1' : 'hover:scale-[1.01]'}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
            {job.jobNumber}
            {job.daysInPipeline != null && (
              <span className="ml-1 font-normal text-gray-500 normal-case" title="Days since profile completed">
                · {job.daysInPipeline}d
              </span>
            )}
          </span>
          {isAdmin && job.adminUnreadCount > 0 && (
            <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
              {job.adminUnreadCount > 99 ? '99+' : job.adminUnreadCount}
            </span>
          )}
          {job.pendingMoveRequest?.active && (
            <span className="flex items-center gap-0.5 px-1.5 h-[18px] rounded-full bg-amber-100 text-amber-700 text-[9px] font-bold leading-none" title={`Pending move to ${STATUS_LABELS[job.pendingMoveRequest.targetStatus] || ''}`}>
              <ArrowUpDown className="w-2.5 h-2.5" /> Move
            </span>
          )}
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" className="text-gray-400 hover:text-primary"><MoreHorizontal className="w-4 h-4" /></button>
        </div>
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {steps.map((step, idx) => {
          const isFirstIncomplete = firstIncompleteIndex === idx;
          const isDone = step.done;
          const label = isDone ? step.labelDone : step.label;
          if (isDone) {
            return (
              <span key={step.key} className="inline-flex items-center gap-0.5 text-[10px] font-medium text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">
                <CheckCircle className="w-2.5 h-2.5 flex-shrink-0" />
                {label}
              </span>
            );
          }
          if (step.unchecked) {
            return (
              <span key={step.key} className="inline-flex items-center gap-0.5 text-[10px] font-medium text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                {label}
              </span>
            );
          }
          if (isFirstIncomplete) {
            return (
              <span key={step.key} className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-red-700 bg-red-50 px-1.5 py-0.5 rounded border border-red-200">
                <AlertCircle className="w-2.5 h-2.5 flex-shrink-0" />
                {label}
              </span>
            );
          }
          return (
            <span key={step.key} className="inline-flex items-center gap-0.5 text-[10px] font-medium text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-200">
              {label}
            </span>
          );
        })}
      </div>
      <h4 className="font-bold text-gray-900 text-sm leading-snug mb-1 cursor-default">
        {clientDisplayName(job)}
      </h4>
      <p className="text-xs text-gray-500 mb-3 font-medium">{job.planType || 'Professional'}</p>

      {showJobAnalysis && (
        <div className="mb-3 pb-3 border-b border-gray-100 bg-gray-50/50 rounded-lg px-2 py-2">
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="text-center">
              <div className="text-[10px] text-gray-500 font-medium">Saved</div>
              <div className="text-xs font-semibold text-gray-700">{jobAnalysis?.saved ?? 0}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 font-medium">Applied</div>
              <div className="text-xs font-semibold text-green-600">{jobAnalysis?.applied ?? 0}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 font-medium">Interview</div>
              <div className="text-xs font-semibold text-yellow-600">{jobAnalysis?.interviewing ?? 0}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 font-medium">Offer</div>
              <div className="text-xs font-semibold text-purple-600">{jobAnalysis?.offer ?? 0}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 font-medium">Rejected</div>
              <div className="text-xs font-semibold text-red-600">{jobAnalysis?.rejected ?? 0}</div>
            </div>
            <div className="text-center">
              <div className="text-[10px] text-gray-500 font-medium">Removed</div>
              <div className="text-xs font-semibold text-gray-600">{jobAnalysis?.removed ?? 0}</div>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-200">
            <div className="text-[10px] text-gray-500 font-medium">Last applied by</div>
            <div className="text-xs font-semibold text-gray-700 mt-0.5">
              {jobAnalysis?.lastAppliedOperatorName ? (
                jobAnalysis.lastAppliedOperatorName.charAt(0).toUpperCase() + jobAnalysis.lastAppliedOperatorName.slice(1).toLowerCase()
              ) : (
                <span className="italic text-red-700">Not started yet</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-50 flex-wrap">
        {job.dashboardManagerName ? (
          <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded-full border border-gray-100" title="Dashboard Manager">
            <User className="w-3 h-3 text-primary" />
            <span className="font-medium truncate max-w-[100px]">{job.dashboardManagerName}</span>
          </div>
        ) : (
          <span className="text-[10px] text-gray-400 italic">Unassigned DM</span>
        )}
        {job.linkedInMemberName && (
          <div className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full border border-purple-100" title="LinkedIn Member">
            <User className="w-3 h-3 text-purple-500" />
            <span className="font-medium truncate max-w-[100px]">{job.linkedInMemberName}</span>
          </div>
        )}
        {isAdmin && onMoveTo && moveToOptions.length > 0 && (
          <div className="relative ml-auto" ref={moveDropdownRef}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setMoveDropdownOpen((v) => !v); }}
              className="flex items-center gap-1 text-xs font-medium text-primary bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-full px-2.5 py-1 transition-colors"
            >
              <ArrowUpDown className="w-3 h-3" />
              <span>Move to</span>
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
    prevProps.job.pendingMoveRequest?.active === nextProps.job.pendingMoveRequest?.active &&
    (prevProps.job.attachments || []).length === (nextProps.job.attachments || []).length &&
    (prevProps.job.attachments || []).every((a, i) => (nextProps.job.attachments || [])[i]?.name === a?.name)
  );
});

JobCard.displayName = 'JobCard';
export default JobCard;
