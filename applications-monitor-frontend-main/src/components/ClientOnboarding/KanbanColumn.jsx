import React from 'react';
import { STATUS_LABELS } from '../../store/onboardingStore';
import { getColumnAccent } from './helpers';
import JobCard from './JobCard';

const KanbanColumn = React.memo(({
  status,
  jobs,
  draggedJobId,
  dragOverStatus,
  isAdmin,
  visibleColumns,
  clientJobAnalysis,
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
    <div className="w-80 flex-shrink-0 flex flex-col h-full max-h-full">
      <div className={`bg-white border border-gray-200 rounded-t-2xl p-4 shadow-sm border-b-2 ${getColumnAccent(status)}`}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-gray-800 text-[15px] tracking-tight">{STATUS_LABELS[status] || status}</h3>
          <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full">{jobs.length}</span>
        </div>
      </div>
      <div
        className={`flex-1 bg-gray-100/50 border-x border-b border-gray-200 rounded-b-2xl p-3 overflow-y-auto space-y-3 scrollbar-hide transition-[background-color,border-color,box-shadow] duration-200 ease-out ${dragOverStatus === status ? 'bg-orange-50 border-primary border-dashed shadow-inner' : ''}`}
        onDragOver={(e) => onDragOver(e, status)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, status)}
      >
        {jobs.map((job) => {
          const clientEmail = (job.clientEmail || '').toLowerCase();
          const analysis = clientJobAnalysis[clientEmail] || null;
          return (
            <div key={job._id} data-client-email={clientEmail} data-job-id={job._id} className="scroll-ml-6 scroll-mt-3">
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
              />
            </div>
          );
        })}
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
    prev.clientJobAnalysis === next.clientJobAnalysis
  );
});

KanbanColumn.displayName = 'KanbanColumn';
export default KanbanColumn;
