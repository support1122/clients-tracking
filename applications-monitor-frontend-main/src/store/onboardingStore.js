import { create } from 'zustand';

export const ONBOARDING_STATUSES = [
  'resume_in_progress',
  'resume_draft_done',
  'resume_in_review',
  'resume_approved',
  'linkedin_in_progress',
  'linkedin_done',
  'cover_letter_in_progress',
  'cover_letter_done',
  'applications_ready',
  'applications_in_progress',
  'completed'
];

export const STATUS_LABELS = {
  resume_in_progress: 'Resume In Progress',
  resume_draft_done: 'Resume Draft Done',
  resume_in_review: 'Resume In Review (Client)',
  resume_approved: 'Resume Approved',
  linkedin_in_progress: 'LinkedIn Optimization In Progress',
  linkedin_done: 'LinkedIn Done',
  cover_letter_in_progress: 'Cover Letter Draft In Progress',
  cover_letter_done: 'Cover Letter Done',
  applications_ready: 'Applications Ready',
  applications_in_progress: 'Applications In Progress',
  completed: 'Completed'
};

export const VALID_NEXT_STATUSES = {
  resume_in_progress: ['resume_draft_done'],
  resume_draft_done: ['resume_in_review'],
  resume_in_review: ['resume_approved'],
  resume_approved: ['linkedin_in_progress'],
  linkedin_in_progress: ['linkedin_done'],
  linkedin_done: ['cover_letter_in_progress', 'applications_ready'],
  cover_letter_in_progress: ['cover_letter_done'],
  cover_letter_done: ['applications_ready'],
  applications_ready: ['applications_in_progress'],
  applications_in_progress: ['completed'],
  completed: []
};

// Plan-based status visibility
export const PLAN_STATUSES = {
  executive: ONBOARDING_STATUSES, // All statuses
  professional: [
    'resume_in_progress',
    'resume_draft_done',
    'resume_in_review',
    'resume_approved',
    'linkedin_in_progress',
    'linkedin_done'
  ], // Resume + LinkedIn only
  default: [
    'resume_in_progress',
    'resume_draft_done',
    'resume_in_review',
    'resume_approved'
  ] // Resume only
};

export const PHASE_GROUPS = [
  { phase: 'Resume – Phase 1', statuses: ['resume_in_progress', 'resume_draft_done', 'resume_in_review', 'resume_approved'] },
  { phase: 'LinkedIn & Cover Letter – Phase 2', statuses: ['linkedin_in_progress', 'linkedin_done'] },
  { phase: 'Job Applications – Phase 3', statuses: ['applications_ready', 'applications_in_progress'] },
  { phase: 'End', statuses: ['completed'] }
];

export const useOnboardingStore = create((set, get) => ({
  jobs: [],
  selectedJob: null,
  loading: false,
  roles: { csms: [], resumeMakers: [] },
  setJobs: (jobs) => set({ jobs }),
  setSelectedJob: (job) => set({ selectedJob: job }),
  setLoading: (loading) => set({ loading }),
  setRoles: (roles) => set({ roles }),
  getJobsByStatus: (status) => get().jobs.filter((j) => j.status === status),
  clearSelected: () => set({ selectedJob: null })
}));
