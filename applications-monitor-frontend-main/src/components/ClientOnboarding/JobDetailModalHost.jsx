import React from 'react';
import { AnimatePresence } from 'framer-motion';
import { useOnboardingStore } from '../../store/onboardingStore';
import JobDetailModal from './JobDetailModal';

/**
 * Isolation layer between the kanban page and the detail modal.
 * Only this component subscribes to `selectedJob` / detail-loading flags, so
 * opening a ticket, streaming in comments, or patching the selected job
 * re-renders this tiny host + the modal — never the 2,700-line board page.
 * AnimatePresence here lets the modal animate out after selectedJob clears.
 */
const JobDetailModalHost = React.memo(function JobDetailModalHost({
  user,
  onClose,
  onUpdateJob,
  onMoveJob,
  canMoveAny,
  movingStatus,
  onFetchNonResolvedIssues,
  dashboardManagerNames
}) {
  const selectedJob = useOnboardingStore((s) => s.selectedJob);
  const roles = useOnboardingStore((s) => s.roles);
  const loadingJobDetails = useOnboardingStore((s) => s.loadingJobDetails);
  const loadingComments = useOnboardingStore((s) => s.loadingComments);

  return (
    <AnimatePresence>
      {selectedJob && (
        <JobDetailModal
          selectedJob={selectedJob}
          user={user}
          roles={roles}
          loadingJobDetails={loadingJobDetails}
          loadingComments={loadingComments}
          onClose={onClose}
          onUpdateJob={onUpdateJob}
          onMoveJob={onMoveJob}
          canMoveAny={canMoveAny}
          movingStatus={movingStatus}
          onFetchNonResolvedIssues={onFetchNonResolvedIssues}
          dashboardManagerNames={dashboardManagerNames}
        />
      )}
    </AnimatePresence>
  );
});

export default JobDetailModalHost;
