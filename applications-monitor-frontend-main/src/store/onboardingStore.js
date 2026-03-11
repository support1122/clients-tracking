import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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

// Plan-based status visibility (Applications + Completed available for all plans)
// Professional: Resume + LinkedIn + Cover Letter optimization
// Executive: Resume + LinkedIn + Cover Letter + Portfolio
export const PLAN_STATUSES = {
  executive: ONBOARDING_STATUSES, // All statuses including cover_letter + portfolio
  professional: [
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
  ],
  default: [
    'resume_in_progress',
    'resume_draft_done',
    'resume_in_review',
    'resume_approved',
    'applications_ready',
    'applications_in_progress',
    'completed'
  ]
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
  setJobs: (jobsOrUpdater) =>
    set((state) => {
      const next =
        typeof jobsOrUpdater === 'function'
          ? jobsOrUpdater(state.jobs)
          : jobsOrUpdater;
      return { jobs: Array.isArray(next) ? next : [] };
    }),
  setSelectedJob: (jobOrUpdater) =>
    set((state) => ({
      selectedJob:
        typeof jobOrUpdater === 'function'
          ? jobOrUpdater(state.selectedJob)
          : jobOrUpdater
    })),
  setLoading: (loading) => set({ loading }),
  setRoles: (roles) => set({ roles }),
  getJobsByStatus: (status) => get().jobs.filter((j) => j.status === status),
  clearSelected: () => set({ selectedJob: null })
}));

// ── Per-field selectors (prevent unnecessary re-renders) ──
// Components subscribing via these only re-render when their specific slice changes.
export const useJobs = () => useOnboardingStore((s) => s.jobs);
export const useSelectedJob = () => useOnboardingStore((s) => s.selectedJob);
export const useOnboardingLoading = () => useOnboardingStore((s) => s.loading);
export const useRoles = () => useOnboardingStore((s) => s.roles);
export const useSetJobs = () => useOnboardingStore((s) => s.setJobs);
export const useSetSelectedJob = () => useOnboardingStore((s) => s.setSelectedJob);
export const useSetLoading = () => useOnboardingStore((s) => s.setLoading);
export const useSetRoles = () => useOnboardingStore((s) => s.setRoles);
export const useClearSelected = () => useOnboardingStore((s) => s.clearSelected);

// ── Persistent client profile store (localStorage) ──
// Single source of truth for profile data. Profiles rarely change, so we persist
// them and only re-fetch when stale (>24h) or on explicit refresh.
const PROFILE_STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

export const useClientProfileStore = create(
  persist(
    (set, get) => ({
      // { [emailLower]: { profile, profileComplete, fetchedAt, error? } }
      profiles: {},

      // Get a cached profile (returns null if not cached)
      getProfile: (email) => {
        if (!email) return null;
        const key = email.toLowerCase().trim();
        return get().profiles[key] || null;
      },

      // Check if profile is stale (older than 24h)
      isStale: (email) => {
        if (!email) return true;
        const entry = get().profiles[email.toLowerCase().trim()];
        if (!entry?.fetchedAt) return true;
        return Date.now() - entry.fetchedAt > PROFILE_STALE_MS;
      },

      // Store a fetched profile
      setProfile: (email, profile, profileComplete) => {
        if (!email) return;
        const key = email.toLowerCase().trim();
        set((state) => ({
          profiles: {
            ...state.profiles,
            [key]: { profile, profileComplete: !!profileComplete, fetchedAt: Date.now(), error: null }
          }
        }));
      },

      // Store a "not found" result so we don't keep retrying
      setProfileError: (email, error) => {
        if (!email) return;
        const key = email.toLowerCase().trim();
        set((state) => ({
          profiles: {
            ...state.profiles,
            [key]: { profile: null, profileComplete: false, fetchedAt: Date.now(), error: error || 'Profile not found' }
          }
        }));
      },

      // Batch set profileComplete flags (from batch-profile-status endpoint)
      batchSetProfileComplete: (results) => {
        if (!results || typeof results !== 'object') return;
        set((state) => {
          const updated = { ...state.profiles };
          for (const [email, complete] of Object.entries(results)) {
            const key = email.toLowerCase().trim();
            if (updated[key]) {
              updated[key] = { ...updated[key], profileComplete: !!complete };
            } else {
              // We know the completion status but haven't fetched the full profile yet
              updated[key] = { profile: null, profileComplete: !!complete, fetchedAt: 0, error: null };
            }
          }
          return { profiles: updated };
        });
      },

      // Clear all cached profiles (e.g. on logout)
      clearProfiles: () => set({ profiles: {} }),
    }),
    {
      name: 'client-profiles-cache',
      version: 1,
    }
  )
);
