import React from 'react';
import { STATUS_LABELS } from '../../store/onboardingStore';
import { getColumnDot } from './helpers';
import JobCard from './JobCard';

const KanbanColumn = React.memo(({
  status,
  jobs,
  draggedJobId,
  dragOverStatus,
  isAdmin,
  visibleColumns,
  clientJobAnalysis,
  clientJobAnalysisLoading,
  onMoveTo,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardClick,
  onLongPressStart,
  onLongPressEnd,
  onHoverStart,
  onHoverEnd
}) => {
  return (
    // content-visibility lets the browser skip layout/paint for columns that
    // are horizontally off-screen — the main fix for janky sideways scrolling
    // on boards with hundreds of cards.
    <div
      className="w-80 flex-shrink-0 flex flex-col h-full max-h-full"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '320px 800px' }}
    >
      {/* Column head: identity dot + title + count, quiet on the canvas */}
      <div className="flex items-center gap-2.5 px-1.5 pb-2.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${getColumnDot(status)}`} />
        <h3 className="font-bold text-gray-900 text-[13.5px] tracking-tight truncate">{STATUS_LABELS[status] || status}</h3>
        <span className="ml-auto bg-[#edebe8] text-gray-500 text-xs font-semibold px-2.5 py-0.5 rounded-full tabular-nums">{jobs.length}</span>
      </div>
      {/* Recessed well — white cards read by hairline alone */}
      <div
        className={`flex-1 rounded-xl border p-2.5 overflow-y-auto space-y-2.5 scrollbar-hide transition-[background-color,border-color] duration-200 ease-out ${
          dragOverStatus === status
            ? 'bg-orange-50 border-orange-300 border-dashed'
            : 'bg-[#edebe8] border-[#e4e1dd]'
        }`}
        onDragOver={(e) => onDragOver(e, status)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, status)}
      >
        {jobs.length === 0 ? (
          <div className="h-full min-h-[160px] grid place-items-center">
            <p className="text-xs text-gray-400 text-center leading-relaxed">No tickets in this stage.</p>
          </div>
        ) : (
          jobs.map((job) => {
            const clientEmail = (job.clientEmail || '').toLowerCase();
            const analysis = clientJobAnalysis[clientEmail] || null;
            return (
              <div
                key={job._id}
                data-client-email={clientEmail}
                data-job-id={job._id}
                className="scroll-ml-6 scroll-mt-3"
                style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 200px' }}
              >
                <JobCard
                  job={job}
                  draggedJobId={draggedJobId}
                  isAdmin={isAdmin}
                  visibleColumns={visibleColumns}
                  onMoveTo={onMoveTo}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onCardClick={onCardClick}
                  onLongPressStart={onLongPressStart}
                  onLongPressEnd={onLongPressEnd}
                  onHoverStart={onHoverStart}
                  onHoverEnd={onHoverEnd}
                  showJobAnalysis={true}
                  jobAnalysis={analysis}
                  jobAnalysisLoading={clientJobAnalysisLoading}
                />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}, (prev, next) => {
  return (
    prev.status === next.status &&
    prev.jobs === next.jobs &&
    prev.draggedJobId === next.draggedJobId &&
    prev.dragOverStatus === next.dragOverStatus &&
    prev.isAdmin === next.isAdmin &&
    prev.visibleColumns === next.visibleColumns &&
    prev.clientJobAnalysis === next.clientJobAnalysis &&
    prev.clientJobAnalysisLoading === next.clientJobAnalysisLoading
  );
});

KanbanColumn.displayName = 'KanbanColumn';
export default KanbanColumn;
