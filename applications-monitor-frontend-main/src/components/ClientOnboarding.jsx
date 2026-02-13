import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  useOnboardingStore,
  ONBOARDING_STATUSES,
  STATUS_LABELS,
  VALID_NEXT_STATUSES,
  PLAN_STATUSES
} from '../store/onboardingStore';
import { toastUtils } from '../utils/toastUtils';
import {
  ChevronRight,
  User,
  FileText,
  MessageSquare,
  History,
  Paperclip,
  X,
  Send,
  Loader2,
  Plus,
  Bell,
  MoreHorizontal,
  Briefcase,
  AlertCircle,
  ArrowUpDown
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_BASE || '';
const AUTH_HEADERS = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
});

function getVisibleColumns(user) {
  const role = user?.role || '';
  const roles = user?.roles || [];
  const subRole = user?.onboardingSubRole || '';
  if (role === 'admin' || roles.includes('csm')) return ONBOARDING_STATUSES;
  if (role === 'onboarding_team') {
    if (subRole === 'resume_maker') return ['resume_in_progress', 'resume_draft_done', 'resume_in_review', 'resume_approved'];
    // LinkedIn & Cover Letter team sees all 4 statuses
    if (subRole === 'linkedin_specialist' || subRole === 'cover_letter_writer') {
      return ['linkedin_in_progress', 'linkedin_done', 'cover_letter_in_progress', 'cover_letter_done'];
    }
  }
  if (['team_lead', 'operations_intern'].includes(role)) return ONBOARDING_STATUSES;
  return [];
}

// Get allowed statuses based on plan type
function getAllowedStatusesForPlan(planType) {
  const normalizedPlan = (planType || 'default').toLowerCase();
  if (normalizedPlan === 'executive') return PLAN_STATUSES.executive;
  if (normalizedPlan === 'professional') return PLAN_STATUSES.professional;
  return PLAN_STATUSES.default;
}

export default function ClientOnboarding() {
  const { jobs, setJobs, selectedJob, setSelectedJob, loading, setLoading, roles, setRoles, getJobsByStatus, clearSelected } = useOnboardingStore();
  const [user] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  });
  const [commentText, setCommentText] = useState('');
  const [movingStatus, setMovingStatus] = useState(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [assigningCsm, setAssigningCsm] = useState(false);
  const [assigningResumeMaker, setAssigningResumeMaker] = useState(false);
  const [assigningLinkedInMember, setAssigningLinkedInMember] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState('existing'); // 'existing' | 'new'
  const [clientsList, setClientsList] = useState([]);
  const [selectedClientEmail, setSelectedClientEmail] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newPlanType, setNewPlanType] = useState('Professional');
  const [newDashboardManagerName, setNewDashboardManagerName] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [draggedJobId, setDraggedJobId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [notificationPage, setNotificationPage] = useState(1);
  const [showMoveHistory, setShowMoveHistory] = useState(false);
  const [addingComment, setAddingComment] = useState(false);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showMoveOptions, setShowMoveOptions] = useState(false);
  const notificationsPerPage = 10;
  const commentInputRef = useRef(null);
  const mentionStartRef = useRef(0);
  const mentionEndRef = useRef(0);
  const visibleColumns = getVisibleColumns(user);
  const isAdmin = user?.role === 'admin';
  const isCsm = user?.role === 'csm' || user?.roles?.includes?.('csm');
  const isTeamLead = user?.role === 'team_lead';
  const userSubRole = user?.onboardingSubRole || '';
  const canMoveAny = isAdmin || isCsm || isTeamLead;
  
  // Get allowed statuses based on user role
  const getAllowedStatusesForUser = () => {
    if (canMoveAny) return ONBOARDING_STATUSES; // Admin, CSM, Team Lead can move anywhere
    if (userSubRole === 'resume_maker') {
      return ['resume_in_progress', 'resume_draft_done', 'resume_in_review', 'resume_approved'];
    }
    if (userSubRole === 'linkedin_specialist' || userSubRole === 'cover_letter_writer') {
      return ['linkedin_in_progress', 'linkedin_done', 'cover_letter_in_progress', 'cover_letter_done'];
    }
    return [];
  };
  
  const canMoveTo = (currentStatus, nextStatus) => {
    const allowed = VALID_NEXT_STATUSES[currentStatus] || [];
    return allowed.includes(nextStatus);
  };
  
  const canUserMoveToStatus = (targetStatus) => {
    if (canMoveAny) return true;
    const allowedStatuses = getAllowedStatusesForUser();
    return allowedStatuses.includes(targetStatus);
  };

  const getJobsForColumn = (status) => {
    // First, ensure all jobs are unique by _id (safety check)
    const uniqueJobsMap = new Map();
    jobs.forEach((job) => {
      if (job._id && !uniqueJobsMap.has(job._id)) {
        uniqueJobsMap.set(job._id, job);
      }
    });
    const deduplicatedJobs = Array.from(uniqueJobsMap.values());
    
    // Filter jobs by status and plan type
    const baseJobs = deduplicatedJobs.filter((j) => {
      if (j.status !== status) return false;
      // Check if this status is allowed for the job's plan type
      const allowedStatuses = getAllowedStatusesForPlan(j.planType);
      return allowedStatuses.includes(status);
    });
    
    // For LinkedIn In Progress column, also include jobs that are resume_approved but have linkedInPhaseStarted
    if (status === 'linkedin_in_progress') {
      const linkedInJobs = deduplicatedJobs.filter(
        (j) => {
          if (j.status !== 'resume_approved' || !j.linkedInPhaseStarted) return false;
          // Check if LinkedIn is allowed for this plan
          const allowedStatuses = getAllowedStatusesForPlan(j.planType);
          return allowedStatuses.includes('linkedin_in_progress');
        }
      );
      // Combine and deduplicate by _id (extra safety)
      const allJobs = [...baseJobs, ...linkedInJobs];
      const finalUnique = Array.from(new Map(allJobs.map((j) => [j._id, j])).values());
      return finalUnique;
    }
    
    return baseJobs;
  };

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs`, { headers: AUTH_HEADERS() });
      if (!res.ok) throw new Error('Failed to load jobs');
      const data = await res.json();
      const fetchedJobs = data.jobs || [];
      
      // Ensure no duplicates by using Map with _id as key (primary deduplication)
      const uniqueJobsMap = new Map();
      fetchedJobs.forEach((job) => {
        if (!job._id) {
          console.warn('Job without _id found:', job);
          return;
        }
        // If job already exists, keep the one with more recent updatedAt or more complete data
        if (uniqueJobsMap.has(job._id)) {
          const existing = uniqueJobsMap.get(job._id);
          const existingUpdated = existing.updatedAt ? new Date(existing.updatedAt) : new Date(0);
          const newUpdated = job.updatedAt ? new Date(job.updatedAt) : new Date(0);
          // Keep the more recently updated one
          if (newUpdated > existingUpdated) {
            uniqueJobsMap.set(job._id, job);
          }
        } else {
          uniqueJobsMap.set(job._id, job);
        }
      });
      const uniqueJobs = Array.from(uniqueJobsMap.values());
      
      // Additional safety: Check for duplicate clientEmail + status combinations
      // This helps catch any backend issues creating duplicates
      const clientStatusMap = new Map();
      uniqueJobs.forEach((job) => {
        const key = `${job.clientEmail || ''}_${job.status || ''}`;
        if (!clientStatusMap.has(key)) {
          clientStatusMap.set(key, []);
        }
        clientStatusMap.get(key).push(job);
      });
      
      // Log warnings if duplicates found (for debugging)
      clientStatusMap.forEach((jobsList, key) => {
        if (jobsList.length > 1 && key.includes('resume_approved')) {
          console.warn(`Potential duplicate jobs found for key: ${key}`, jobsList.map(j => ({ id: j._id, jobNumber: j.jobNumber })));
        }
      });
      
      setJobs(uniqueJobs);
      
      // Update selected job if it exists in the fresh data
      // Use the store's current state to avoid stale closure issues
      const store = useOnboardingStore.getState();
      if (store.selectedJob?._id) {
        const updatedSelectedJob = uniqueJobs.find((j) => j._id === store.selectedJob._id);
        if (updatedSelectedJob) {
          setSelectedJob(updatedSelectedJob);
        } else {
          // If selected job no longer exists, clear selection
          clearSelected();
        }
      }
    } catch (e) {
      console.error('Fetch jobs error:', e);
      toastUtils.error(e.message || 'Failed to load onboarding jobs');
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, [setJobs, setLoading, setSelectedJob, clearSelected]);

  const fetchRoles = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/roles`, { headers: AUTH_HEADERS() });
      if (res.ok) {
        const data = await res.json();
        setRoles(data);
      }
    } catch (_) { }
  }, [setRoles]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/notifications`, { headers: AUTH_HEADERS() });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch (_) { }
  }, []);

  const markNotificationRead = useCallback(async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/notifications/${id}/read`, {
        method: 'PATCH',
        headers: AUTH_HEADERS()
      });
      if (res.ok) setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    } catch (_) { }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchRoles();
  }, [fetchJobs, fetchRoles]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    if (!selectedJob?._id) return;
    notifications
      .filter((n) => !n.read && n.jobId === selectedJob._id)
      .forEach((n) => { if (n._id) markNotificationRead(n._id); });
  }, [selectedJob?._id, notifications, markNotificationRead]);

  // Close move options dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showMoveOptions && !e.target.closest('[data-move-options]')) {
        setShowMoveOptions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoveOptions]);

  const handleCloseModal = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    // Clear comment text
    setCommentText('');
    // Clear move options dropdown
    setShowMoveOptions(false);
    // Clear the selected job using store method
    clearSelected();
    // Also set directly to ensure it's cleared immediately
    setSelectedJob(null);
  }, [setSelectedJob, clearSelected, setCommentText]);

  const handleMove = async (jobId, newStatus, skipRoleCheck = false) => {
    // Prevent duplicate moves
    if (movingStatus) {
      toastUtils.error('Please wait, move in progress...');
      return;
    }
    
    // Find the job to check plan type
    const job = jobs.find((j) => j._id === jobId);
    if (!job) {
      toastUtils.error('Job not found');
      return;
    }
    
    // Check role-based movement restrictions (unless skipped for admin/CSM/TeamLead)
    if (!skipRoleCheck && !canUserMoveToStatus(newStatus)) {
      const allowedStatuses = getAllowedStatusesForUser();
      toastUtils.error(`You don't have permission to move to "${STATUS_LABELS[newStatus] || newStatus}". Your role only allows: ${allowedStatuses.map(s => STATUS_LABELS[s] || s).join(', ')}`);
      return;
    }
    
    // Check if the status is allowed for this plan type
    const allowedStatuses = getAllowedStatusesForPlan(job.planType);
    if (!allowedStatuses.includes(newStatus)) {
      const planName = job.planType || 'this plan';
      toastUtils.error(`This plan doesn't support moving to "${STATUS_LABELS[newStatus] || newStatus}". ${planName === 'executive' ? 'Executive plan' : planName === 'professional' ? 'Professional plan' : 'This plan'} only supports: ${allowedStatuses.map(s => STATUS_LABELS[s] || s).join(', ')}`);
      return;
    }
    
    setMovingStatus(jobId);
    
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${jobId}`, {
        method: 'PATCH',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({ status: newStatus })
      });
      
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Move failed');
      }
      
      // Refetch all jobs to ensure consistency (prevents duplicates and ensures accurate state)
      // fetchJobs will automatically update selectedJob if it matches the moved job
      await fetchJobs();
      
      toastUtils.success(`Moved to ${STATUS_LABELS[newStatus] || newStatus}`);
    } catch (e) {
      console.error('Move error:', e);
      toastUtils.error(e.message || 'Failed to move card');
      // Refetch on error to ensure we have correct state
      await fetchJobs();
    } finally {
      setMovingStatus(null);
    }
  };

  const handleDragStart = (e, job) => {
    setDraggedJobId(job._id);
    e.dataTransfer.setData('application/json', JSON.stringify({ jobId: job._id, fromStatus: job.status }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedJobId(null);
    setDragOverStatus(null);
  };

  const handleDragOver = (e, status) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  };

  const handleDragLeave = () => {
    setDragOverStatus(null);
  };

  const handleDrop = (e, toStatus) => {
    e.preventDefault();
    setDragOverStatus(null);
    if (!draggedJobId) return;
    
    // Prevent multiple simultaneous moves
    if (movingStatus) {
      setDraggedJobId(null);
      toastUtils.error('Please wait, move in progress...');
      return;
    }
    
    try {
      const raw = e.dataTransfer.getData('application/json');
      const { jobId, fromStatus } = raw ? JSON.parse(raw) : { jobId: draggedJobId, fromStatus: '' };
      
      // Validate jobId exists and is valid
      if (!jobId || typeof jobId !== 'string') {
        setDraggedJobId(null);
        toastUtils.error('Invalid job ID');
        return;
      }
      
      // Find the job - ensure it exists and is unique
      const matchingJobs = jobs.filter((j) => j._id === jobId);
      if (matchingJobs.length === 0) {
        setDraggedJobId(null);
        toastUtils.error('Job not found');
        return;
      }
      
      // If somehow multiple jobs with same ID exist, use the first one and log warning
      if (matchingJobs.length > 1) {
        console.error(`Duplicate job IDs found: ${jobId}`, matchingJobs);
        toastUtils.error('Duplicate job detected. Refreshing...');
        fetchJobs();
        setDraggedJobId(null);
        return;
      }
      
      const job = matchingJobs[0];
      const from = job.status;
      
      // Don't move if already in the same status
      if (toStatus === from) {
        setDraggedJobId(null);
        return;
      }
      
      // Check if the status is allowed for this plan type
      const allowedStatuses = getAllowedStatusesForPlan(job.planType);
      if (!allowedStatuses.includes(toStatus)) {
        const planName = job.planType || 'this plan';
        toastUtils.error(`This plan doesn't support moving to "${STATUS_LABELS[toStatus] || toStatus}". ${planName === 'executive' ? 'Executive plan' : planName === 'professional' ? 'Professional plan' : 'This plan'} only supports: ${allowedStatuses.map(s => STATUS_LABELS[s] || s).join(', ')}`);
        return;
      }
      
      // Special handling for LinkedIn dual visibility:
      // If moving FROM linkedin_in_progress column but job status is resume_approved,
      // we're actually moving the resume_approved job, not creating a new one
      if (toStatus === 'linkedin_in_progress' && from === 'resume_approved' && job.linkedInPhaseStarted) {
        // This is valid - the job should appear in both columns
        // Moving it to linkedin_in_progress status
        handleMove(jobId, 'linkedin_in_progress');
        return;
      }
      
      // Check role-based movement restrictions
      if (!canUserMoveToStatus(toStatus) && !canMoveAny) {
        const allowedStatuses = getAllowedStatusesForUser();
        toastUtils.error(`You don't have permission to move to "${STATUS_LABELS[toStatus] || toStatus}". Your role only allows: ${allowedStatuses.map(s => STATUS_LABELS[s] || s).join(', ')}`);
        return;
      }
      
      // Check if move is allowed
      const allowed = canMoveAny || canMoveTo(from, toStatus);
      if (allowed && jobId) {
        handleMove(jobId, toStatus, canMoveAny);
      } else {
        toastUtils.error(`Invalid status transition from ${STATUS_LABELS[from] || from} to ${STATUS_LABELS[toStatus] || toStatus}`);
      }
    } catch (err) {
      console.error('Drop error:', err);
      toastUtils.error('Failed to move card');
    } finally {
      setDraggedJobId(null);
    }
  };

  const mentionableUsers = roles?.mentionableUsers || [];

  const handleCommentChange = (e) => {
    const value = e.target.value;
    const pos = e.target.selectionStart ?? value.length;
    setCommentText(value);
    const textBefore = value.slice(0, pos);
    const atIndex = textBefore.lastIndexOf('@');
    if (atIndex === -1 || /\s/.test(textBefore.slice(atIndex + 1))) {
      setShowMentionDropdown(false);
      return;
    }
    const filter = textBefore.slice(atIndex + 1).toLowerCase();
    mentionStartRef.current = atIndex;
    mentionEndRef.current = pos;
    const list = mentionableUsers.filter(
      (u) =>
        (u.name && String(u.name).toLowerCase().includes(filter)) ||
        (u.email && String(u.email).toLowerCase().includes(filter)) ||
        (u.email && String(u.email).toLowerCase().split('@')[0].includes(filter))
    );
    setMentionSuggestions(list);
    setShowMentionDropdown(list.length > 0);
  };

  const handleSelectMention = (user) => {
    const start = mentionStartRef.current;
    const end = mentionEndRef.current;
    const displayName = user.name || user.email || '';
    const newText = commentText.slice(0, start) + '@' + displayName + ' ' + commentText.slice(end);
    setCommentText(newText);
    setShowMentionDropdown(false);
    setTimeout(() => {
      commentInputRef.current?.focus();
      const caret = start + displayName.length + 2;
      commentInputRef.current?.setSelectionRange(caret, caret);
    }, 0);
  };

  const handleAddComment = async () => {
    if (!selectedJob || !commentText.trim() || addingComment) return;
    const mentionableUsers = roles?.mentionableUsers || [];
    const { taggedUserIds, taggedNames } = parseMentions(commentText, mentionableUsers);
    setAddingComment(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, {
        method: 'PATCH',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({
          comment: {
            body: commentText.trim(),
            taggedUserIds,
            taggedNames
          }
        })
      });
      if (!res.ok) throw new Error('Failed to add comment');
      const data = await res.json();
      setSelectedJob(data.job);
      setJobs(jobs.map((j) => (j._id === selectedJob._id ? data.job : j)));
      setCommentText('');
      if (taggedUserIds.length) {
        toastUtils.success(`Comment added. ${taggedUserIds.length} person(s) will be notified.`);
      } else {
        toastUtils.success('Comment added');
      }
    } catch (e) {
      toastUtils.error(e.message || 'Failed to add comment');
    } finally {
      setAddingComment(false);
    }
  };

  const handleAssignCsm = async (csmEmail, csmName) => {
    if (!selectedJob) return;
    setAssigningCsm(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, {
        method: 'PATCH',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({ csmEmail, csmName })
      });
      if (!res.ok) throw new Error('Failed to assign CSM');
      const data = await res.json();
      setSelectedJob(data.job);
      setJobs(jobs.map((j) => (j._id === selectedJob._id ? data.job : j)));
      toastUtils.success('CSM assigned');
    } catch (e) {
      toastUtils.error(e.message || 'Failed');
    } finally {
      setAssigningCsm(false);
    }
  };

  const handleAssignResumeMaker = async (resumeMakerEmail, resumeMakerName) => {
    if (!selectedJob || !isAdmin) return;
    setAssigningResumeMaker(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, {
        method: 'PATCH',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({ resumeMakerEmail, resumeMakerName })
      });
      if (!res.ok) throw new Error('Failed to assign Resume Maker');
      const data = await res.json();
      setSelectedJob(data.job);
      setJobs(jobs.map((j) => (j._id === selectedJob._id ? data.job : j)));
      toastUtils.success('Resume Maker assigned');
    } catch (e) {
      toastUtils.error(e.message || 'Failed');
    } finally {
      setAssigningResumeMaker(false);
    }
  };

  const handleAssignLinkedInMember = async (linkedInMemberEmail, linkedInMemberName) => {
    if (!selectedJob || !isAdmin) return;
    setAssigningLinkedInMember(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, {
        method: 'PATCH',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({ linkedInMemberEmail, linkedInMemberName })
      });
      if (!res.ok) throw new Error('Failed to assign LinkedIn member');
      const data = await res.json();
      setSelectedJob(data.job);
      setJobs(jobs.map((j) => (j._id === selectedJob._id ? data.job : j)));
      toastUtils.success('LinkedIn member assigned');
    } catch (e) {
      toastUtils.error(e.message || 'Failed');
    } finally {
      setAssigningLinkedInMember(false);
    }
  };

  const handleUploadAttachment = async (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !selectedJob) return;
    setUploadingAttachment(true);
    const microserviceUrl = import.meta.env.VITE_MICROSERVICE_URL || '';
    try {
      const form = new FormData();
      form.append('file', file);
      const uploadRes = await fetch(`${microserviceUrl}/api/upload/onboarding-attachment`, {
        method: 'POST',
        body: form
      });
      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.message || 'Upload failed');
      }
      const { url, filename: uploadedFilename } = await uploadRes.json();
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}/attachments`, {
        method: 'POST',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({ url, filename: uploadedFilename || file.name })
      });
      if (!res.ok) throw new Error('Failed to save attachment');
      const data = await res.json();
      const updated = { ...selectedJob, attachments: [...(selectedJob.attachments || []), data.attachment] };
      setSelectedJob(updated);
      setJobs(jobs.map((j) => (j._id === selectedJob._id ? updated : j)));
      toastUtils.success('Attachment uploaded');
    } catch (err) {
      toastUtils.error(err.message || 'Upload failed');
    } finally {
      setUploadingAttachment(false);
      e.target.value = '';
    }
  };

  const jobTitle = (job) => `${job.jobNumber} - ${job.clientName}-${job.planType || 'Plan'}`;

  // Parse @mentions from text and resolve to { taggedUserIds, taggedNames } using mentionableUsers
  const parseMentions = (text, mentionableUsers) => {
    const list = mentionableUsers || [];
    if (!list.length) return { taggedUserIds: [], taggedNames: [] };
    const seen = new Set();
    const taggedUserIds = [];
    const taggedNames = [];
    const match = text.match(/@([\w.-]+)/g);
    if (!match) return { taggedUserIds: [], taggedNames: [] };
    match.forEach((atTag) => {
      const handle = (atTag || '').slice(1).trim().toLowerCase();
      if (!handle) return;
      const user = list.find(
        (u) =>
          (u.name && String(u.name).toLowerCase().includes(handle)) ||
          (u.email && String(u.email).toLowerCase().startsWith(handle)) ||
          (u.email && String(u.email).toLowerCase().split('@')[0].includes(handle))
      );
      if (user && user.email && !seen.has(user.email.toLowerCase())) {
        seen.add(user.email.toLowerCase());
        taggedUserIds.push(user.email);
        taggedNames.push(user.name || user.email);
      }
    });
    return { taggedUserIds, taggedNames };
  };

  const openAddModal = useCallback(() => {
    setShowAddModal(true);
    setSelectedClientEmail('');
    setNewClientEmail('');
    setNewClientName('');
    setNewPlanType('Professional');
    setNewDashboardManagerName('');
    setAddMode('existing');
    setClientsLoading(true);
    setClientsList([]);
    fetch(`${API_BASE}/api/clients`, { headers: AUTH_HEADERS() })
      .then((r) => r.ok ? r.json() : { clients: [] })
      .then((data) => setClientsList(data.clients || []))
      .catch(() => setClientsList([]))
      .finally(() => setClientsLoading(false));
  }, []);

  const existingClientEmails = (jobs || []).map((j) => (j.clientEmail || '').toLowerCase());
  const availableClients = (clientsList || []).filter(
    (c) => c.email && !existingClientEmails.includes((c.email || '').toLowerCase())
  );

  const handleAddSubmit = async () => {
    let clientEmail = '';
    let clientName = '';
    let planType = 'Professional';
    let dashboardManagerName = '';
    if (addMode === 'existing') {
      const client = clientsList.find((c) => (c.email || '').toLowerCase() === (selectedClientEmail || '').toLowerCase());
      if (!client) {
        toastUtils.error('Please select a client');
        return;
      }
      clientEmail = client.email;
      clientName = client.name || client.email;
      planType = client.planType || 'Professional';
      dashboardManagerName = client.dashboardTeamLeadName || '';
    } else {
      clientEmail = (newClientEmail || '').trim();
      clientName = (newClientName || '').trim();
      planType = newPlanType || 'Professional';
      dashboardManagerName = (newDashboardManagerName || '').trim();
      if (!clientEmail || !clientName) {
        toastUtils.error('Client email and name are required');
        return;
      }
    }
    setAddSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs`, {
        method: 'POST',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({
          clientEmail,
          clientName,
          planType,
          dashboardManagerName
        })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create onboarding ticket');
      }
      toastUtils.success('Onboarding ticket created');
      setShowAddModal(false);
      fetchJobs();
    } catch (e) {
      toastUtils.error(e.message || 'Failed to create ticket');
    } finally {
      setAddSubmitting(false);
    }
  };

  if (visibleColumns.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center shadow-lg">
          <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Restricted</h2>
          <p className="text-gray-600">You don’t have access to Client Onboarding.</p>
          <p className="text-gray-500 text-sm mt-2">Contact an admin to assign you an onboarding or CSM role.</p>
        </div>
      </div>
    );
  }

  const unreadNotifications = (notifications || []).filter((n) => !n.read);
  const handleNotificationClick = (notification) => {
    const job = jobs.find((j) => j._id === notification.jobId);
    if (job) setSelectedJob(job);
    if (notification._id) markNotificationRead(notification._id);
  };

  const getStatusColor = (status) => {
    if (status.includes('resume')) return 'bg-blue-50 text-blue-700 border-blue-100';
    if (status.includes('linkedin')) return 'bg-purple-50 text-purple-700 border-purple-100';
    if (status.includes('cover_letter')) return 'bg-indigo-50 text-indigo-700 border-indigo-100';
    if (status.includes('applications')) return 'bg-emerald-50 text-emerald-700 border-emerald-100';
    if (status === 'completed') return 'bg-green-50 text-green-700 border-green-100';
    return 'bg-gray-50 text-gray-700 border-gray-100';
  };

  const getColumnAccent = (status) => {
    if (status.includes('resume')) return 'border-t-4 border-t-blue-500';
    if (status.includes('linkedin')) return 'border-t-4 border-t-purple-500';
    if (status.includes('cover_letter')) return 'border-t-4 border-t-indigo-500';
    if (status.includes('applications')) return 'border-t-4 border-t-emerald-500';
    if (status === 'completed') return 'border-t-4 border-t-green-500';
    return 'border-t-4 border-t-gray-300';
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-10">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm backdrop-blur-md bg-white/90">
        <div className="max-w-[1920px] mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Client Onboarding</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-block w-2 h-2 rounded-full bg-primary"></span>
              <p className="text-sm text-gray-500 font-medium">Track and manage client progress</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotificationPanel((v) => !v)}
                className="relative p-2.5 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all focus:outline-none"
              >
                <Bell className="w-6 h-6" />
                {unreadNotifications.length > 0 && (
                  <span className="absolute top-2 right-2.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-primary ring-2 ring-white">
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotificationPanel && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowNotificationPanel(false)} aria-hidden="true" />
                  <div className="absolute right-0 top-full z-50 mt-4 w-96 rounded-2xl bg-white border border-gray-100 shadow-2xl ring-1 ring-black/5 max-h-[70vh] overflow-hidden flex flex-col">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                      <h3 className="font-semibold text-gray-900">Notifications</h3>
                      <button type="button" onClick={() => setShowNotificationPanel(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <ul className="overflow-y-auto p-2 flex-1 space-y-1">
                      {notifications.length === 0 ? (
                        <li className="py-12 text-center">
                          <div className="mx-auto w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                            <Bell className="w-6 h-6 text-gray-300" />
                          </div>
                          <p className="text-sm text-gray-500 font-medium">No new notifications</p>
                        </li>
                      ) : (
                        notifications.slice((notificationPage - 1) * notificationsPerPage, notificationPage * notificationsPerPage).map((n) => (
                          <li key={n._id}>
                            <button
                              type="button"
                              onClick={() => { handleNotificationClick(n); setShowNotificationPanel(false); }}
                              className={`w-full text-left px-4 py-3 rounded-xl text-sm transition-all flex gap-3 group ${!n.read ? 'bg-orange-50/50 hover:bg-orange-50' : 'hover:bg-gray-50'}`}
                            >
                              <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${!n.read ? 'bg-primary' : 'bg-transparent'}`} />
                              <div className="flex-1">
                                <p className="text-gray-900 font-medium leading-snug">
                                  <span className="font-bold">{n.jobNumber}</span> – {n.clientName}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                  {n.authorName && <span className="font-medium text-gray-700">{n.authorName}</span>}
                                  {n.commentSnippet && <span className="text-gray-500"> mentioned you: "{n.commentSnippet.slice(0, 50)}..."</span>}
                                </p>
                                <p className="text-[10px] text-gray-400 mt-2 font-medium">{new Date(n.createdAt).toLocaleDateString()} at {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                              </div>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                    {/* Pagination for notifications if needed */}
                    {notifications.length > notificationsPerPage && (
                      <div className="p-3 border-t border-gray-100 flex justify-between items-center bg-gray-50/50">
                        <button disabled={notificationPage === 1} onClick={() => setNotificationPage(p => p - 1)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-50 hover:bg-gray-50">Prev</button>
                        <span className="text-xs text-gray-400">Page {notificationPage}</span>
                        <button disabled={notificationPage >= Math.ceil(notifications.length / notificationsPerPage)} onClick={() => setNotificationPage(p => p + 1)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 disabled:opacity-50 hover:bg-gray-50">Next</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Add Client Button */}
            {isAdmin && (
              <button
                type="button"
                onClick={openAddModal}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-hover text-sm font-semibold shadow-lg shadow-orange-500/20 transition-all active:scale-95"
              >
                <Plus className="w-4 h-4 stroke-[3px]" />
                <span className="tracking-wide">Add Client</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content / Kanban */}
      <div className="overflow-x-auto h-[calc(100vh-80px)]">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
          </div>
        ) : (
          <div className="flex gap-6 p-6 min-w-max h-full">
            {visibleColumns.map((status) => {
              const columnJobs = getJobsForColumn(status);
              return (
                <div key={status} className="w-80 flex-shrink-0 flex flex-col h-full max-h-full">
                  {/* Column Header */}
                  <div className={`bg-white border border-gray-200 rounded-t-2xl p-4 shadow-sm border-b-2 ${getColumnAccent(status)}`}>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-bold text-gray-800 text-[15px] tracking-tight">{STATUS_LABELS[status] || status}</h3>
                      <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-full">{columnJobs.length}</span>
                    </div>
                  </div>

                  {/* Column Body */}
                  <div
                    className={`flex-1 bg-gray-100/50 border-x border-b border-gray-200 rounded-b-2xl p-3 overflow-y-auto space-y-3 scrollbar-hide transition-colors ${dragOverStatus === status ? 'bg-orange-50 border-primary border-dashed' : ''}`}
                    onDragOver={(e) => handleDragOver(e, status)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, status)}
                  >
                    {columnJobs.map((job) => (
                      <div
                        key={job._id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, job)}
                        onDragEnd={handleDragEnd}
                        onClick={() => setSelectedJob(job)}
                        className={`group bg-white rounded-xl p-4 border border-transparent shadow-sm hover:shadow-md hover:border-orange-100 transition-all cursor-pointer relative ${draggedJobId === job._id ? 'opacity-40 shadow-none ring-2 ring-gray-200 rotate-2' : ''}`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-[10px] font-bold tracking-wider text-gray-400 uppercase bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100">
                            {job.jobNumber}
                          </span>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="text-gray-400 hover:text-primary"><MoreHorizontal className="w-4 h-4" /></button>
                          </div>
                        </div>
                        <h4 className="font-bold text-gray-900 text-sm leading-snug mb-1">{job.clientName}</h4>
                        <p className="text-xs text-gray-500 mb-3 font-medium">{job.planType || 'Professional'}</p>

                        <div className="flex items-center gap-2 mt-auto pt-3 border-t border-gray-50 flex-wrap">
                          {job.resumeMakerName ? (
                            <div className="flex items-center gap-1.5 text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded-full border border-gray-100" title="Resume Maker">
                              <User className="w-3 h-3 text-primary" />
                              <span className="font-medium truncate max-w-[100px]">{job.resumeMakerName}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] text-gray-400 italic">Unassigned RM</span>
                          )}
                          {job.linkedInMemberName && (
                            <div className="flex items-center gap-1.5 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full border border-purple-100" title="LinkedIn Member">
                              <User className="w-3 h-3 text-purple-500" />
                              <span className="font-medium truncate max-w-[100px]">{job.linkedInMemberName}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedJob && (
        <div 
          key={selectedJob._id}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" 
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseModal(e);
            }
          }}
        >
          <div
            className="bg-[#FAFAFA] rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-white/20"
            onClick={(e) => {
              e.stopPropagation();
            }}
            onMouseDown={(e) => {
              // Prevent any mouse events from interfering
              e.stopPropagation();
            }}
          >
            {/* Modal Header */}
            <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between sticky top-0 z-10">
              <div>
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-2xl font-bold text-gray-900">{selectedJob.clientName}</h2>
                  <span className="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">#{selectedJob.jobNumber}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedJob.status).replace('bg-opacity-100', 'bg-opacity-20')}`}>
                    {STATUS_LABELS[selectedJob.status]}
                  </span>
                  <span className="text-gray-300 text-sm">|</span>
                  <span className="text-sm text-gray-500">{selectedJob.planType || 'Professional'} Plan</span>
                </div>
              </div>
              <button 
                onClick={handleCloseModal} 
                className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer z-20 relative"
                type="button"
                aria-label="Close modal"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex flex-1 overflow-hidden min-h-0">
              {/* Left Column: Details */}
              <div className="w-[55%] overflow-y-auto p-6 border-r border-gray-200 bg-white">
                <div className="grid grid-cols-2 gap-6 mb-6">
                  {/* Team Section */}
                  <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                    <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <User className="w-3 h-3" /> Team
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Client Success Manager</label>
                        <select
                          value={selectedJob.csmEmail || ''}
                          onChange={(e) => {
                            const opt = roles.csms?.find((c) => c.email === e.target.value);
                            handleAssignCsm(opt?.email || '', opt?.name || '');
                          }}
                          disabled={assigningCsm}
                          className="w-full text-sm border-gray-200 rounded-lg focus:ring-primary focus:border-primary bg-white"
                        >
                          <option value="">Select CSM...</option>
                          {(roles.csms || []).map((c) => (
                            <option key={c.email} value={c.email}>{c.name || c.email}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1.5">Resume Maker</label>
                        {isAdmin ? (
                          <select
                            value={selectedJob.resumeMakerEmail || ''}
                            onChange={(e) => {
                              const opt = roles.resumeMakers?.find((r) => r.email === e.target.value);
                              handleAssignResumeMaker(opt?.email || '', opt?.name || '');
                            }}
                            disabled={assigningResumeMaker}
                            className="w-full text-sm border-gray-200 rounded-lg focus:ring-primary focus:border-primary bg-white"
                          >
                            <option value="">Select Resume Maker...</option>
                            {(roles.resumeMakers || []).map((r) => (
                              <option key={r.email} value={r.email}>{r.name || r.email}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="p-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 font-medium">
                            {selectedJob.resumeMakerName || 'Unassigned'}
                          </div>
                        )}
                      </div>
                      {(selectedJob.linkedInPhaseStarted || selectedJob.status === 'linkedin_in_progress' || selectedJob.status === 'linkedin_done') && (
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1.5">LinkedIn Member</label>
                          {isAdmin ? (
                            <select
                              value={selectedJob.linkedInMemberEmail || ''}
                              onChange={(e) => {
                                const opt = roles.linkedInMembers?.find((l) => l.email === e.target.value);
                                handleAssignLinkedInMember(opt?.email || '', opt?.name || '');
                              }}
                              disabled={assigningLinkedInMember}
                              className="w-full text-sm border-gray-200 rounded-lg focus:ring-primary focus:border-primary bg-white"
                            >
                              <option value="">Select LinkedIn Member...</option>
                              {(roles.linkedInMembers || []).map((l) => (
                                <option key={l.email} value={l.email}>{l.name || l.email}</option>
                              ))}
                            </select>
                          ) : (
                            <div className="p-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 font-medium">
                              {selectedJob.linkedInMemberName || 'Unassigned'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Client Info Section */}
                  <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                    <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                      <Briefcase className="w-3 h-3" /> Info
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <span className="block text-xs font-semibold text-gray-700 mb-1">Dashboard Manager</span>
                        <span className="text-sm text-gray-900 font-medium">{selectedJob.dashboardManagerName || '—'}</span>
                      </div>
                      <div>
                        <span className="block text-xs font-semibold text-gray-700 mb-1">Assigned Email</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-900 font-mono bg-white px-2 py-1 rounded border border-gray-200">{selectedJob.clientEmail}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Attachments */}
                <div className="mb-6">
                  <button
                    onClick={() => setShowAttachments(!showAttachments)}
                    className="w-full flex items-center justify-between mb-3 text-left"
                  >
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <Paperclip className="w-4 h-4 text-gray-400" /> Attachments
                      {(selectedJob.attachments || []).length > 0 && (
                        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                          {(selectedJob.attachments || []).length}
                        </span>
                      )}
                    </h3>
                    <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${showAttachments ? 'rotate-90' : ''}`} />
                  </button>
                  {showAttachments && (
                    <>
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {(selectedJob.attachments || []).map((a, i) => {
                          const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.filename || a.url);
                          const isPdf = /\.pdf$/i.test(a.filename || a.url);
                          const isDoc = /\.(doc|docx)$/i.test(a.filename || a.url);
                          
                          return (
                            <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-primary hover:shadow-md transition-all group">
                              {isImage ? (
                                <a href={a.url} target="_blank" rel="noopener noreferrer" className="block">
                                  <img src={a.url} alt={a.filename} className="w-full h-32 object-cover" />
                                  <div className="p-3">
                                    <p className="text-sm font-medium text-gray-900 truncate">{a.filename}</p>
                                    <p className="text-xs text-gray-500">Click to view full size</p>
                                  </div>
                                </a>
                              ) : (
                                <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3">
                                  <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center group-hover:bg-orange-50 transition-colors flex-shrink-0">
                                    {isPdf ? (
                                      <FileText className="w-5 h-5 text-red-500" />
                                    ) : isDoc ? (
                                      <FileText className="w-5 h-5 text-blue-500" />
                                    ) : (
                                      <FileText className="w-5 h-5 text-gray-400 group-hover:text-primary" />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-gray-900 truncate">{a.filename}</p>
                                    <p className="text-xs text-gray-500">{isPdf ? 'PDF Document' : isDoc ? 'Word Document' : 'Click to view'}</p>
                                  </div>
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      {(selectedJob.attachments || []).length === 0 && (
                        <p className="text-sm text-gray-500 text-center py-4">No attachments yet</p>
                      )}
                      <label className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg border border-gray-200 hover:bg-white hover:border-gray-300 transition-all cursor-pointer text-sm font-medium shadow-sm">
                        {uploadingAttachment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        {uploadingAttachment ? 'Uploading...' : 'Add Attachment'}
                        <input type="file" className="hidden" onChange={handleUploadAttachment} disabled={uploadingAttachment} />
                      </label>
                    </>
                  )}
                </div>

                {/* Move History Section */}
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                  <button
                    onClick={() => setShowMoveHistory(!showMoveHistory)}
                    className="w-full flex items-center justify-between mb-4 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <History className="w-4 h-4 text-gray-500" />
                      <h3 className="text-sm font-bold text-gray-900">Move History</h3>
                      {(selectedJob.moveHistory || []).length > 0 && (
                        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">
                          {(selectedJob.moveHistory || []).length}
                        </span>
                      )}
                    </div>
                    <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${showMoveHistory ? 'rotate-90' : ''}`} />
                  </button>
                  {showMoveHistory && (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {(selectedJob.moveHistory || []).length === 0 ? (
                        <p className="text-xs text-gray-400 italic py-2 text-center">No move history</p>
                      ) : (
                        (selectedJob.moveHistory || []).map((move, i) => (
                          <div key={i} className="flex gap-3">
                            <div className="flex flex-col items-center pt-1">
                              <div className="w-2 h-2 rounded-full bg-primary"></div>
                              {i < (selectedJob.moveHistory || []).length - 1 && (
                                <div className="w-px h-full bg-gray-200 mt-1 min-h-[20px]"></div>
                              )}
                            </div>
                            <div className="flex-1 pb-2">
                              <p className="text-xs text-gray-700">
                                {move.fromStatus === 'created' ? 'Created' : `Moved from ${STATUS_LABELS[move.fromStatus] || move.fromStatus}`} → <span className="font-semibold text-gray-900">{STATUS_LABELS[move.toStatus] || move.toStatus}</span>
                              </p>
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                by {move.movedBy || 'System'} • {new Date(move.movedAt).toLocaleString()}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Comments */}
              <div className="w-[45%] bg-white border-l border-gray-200 flex flex-col min-h-0">
                {/* Header */}
                <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-primary" /> Comments
                    </h3>
                    {(selectedJob.comments || []).length > 0 && (
                      <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full font-medium">
                        {(selectedJob.comments || []).length}
                      </span>
                    )}
                  </div>
                </div>

                {/* Comments List - Always Visible */}
                <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-4">
                  {(selectedJob.comments || []).length === 0 ? (
                    <div className="text-center py-12 opacity-50">
                      <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p className="text-sm text-gray-500 font-medium">No comments yet</p>
                      <p className="text-xs text-gray-400 mt-1">Start the conversation below</p>
                    </div>
                  ) : (
                    (selectedJob.comments || []).map((comment, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center flex-shrink-0 text-primary font-bold text-sm shadow-sm">
                          {(comment.authorName || 'U')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="bg-gray-50 rounded-xl rounded-tl-none p-3.5 border border-gray-100 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                              <span className="text-sm font-bold text-gray-900">{comment.authorName || 'User'}</span>
                              <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                                {new Date(comment.createdAt).toLocaleDateString()} {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{comment.body}</p>
                            {(comment.taggedUserIds && comment.taggedUserIds.length > 0) || (comment.taggedNames && comment.taggedNames.length > 0) || (comment.taggedUsers && comment.taggedUsers.length > 0) ? (
                              <div className="mt-2 pt-2 border-t border-gray-200">
                                <p className="text-[10px] text-gray-500 font-medium">
                                  Tagged: {(comment.taggedNames || comment.taggedUsers?.map(u => u.name || u.email) || []).join(', ')}
                                </p>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Comment Input - Always Visible */}
                <div className="p-4 bg-gray-50 border-t border-gray-200">
                  <div className="relative">
                    {showMentionDropdown && mentionSuggestions.length > 0 && (
                      <div className="absolute bottom-full left-0 w-full mb-2 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-20 max-h-[200px] overflow-y-auto">
                        {mentionSuggestions.map((u) => (
                          <button
                            key={u.id || u.email}
                            onClick={() => handleSelectMention(u)}
                            className="w-full text-left px-4 py-2.5 hover:bg-orange-50 text-sm flex items-center gap-2 text-gray-700 transition-colors"
                          >
                            <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 text-primary font-bold text-xs">
                              {(u.name || u.email)[0].toUpperCase()}
                            </div>
                            <span className="font-medium">{u.name || u.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    
                    <div className="relative">
                      <textarea
                        ref={commentInputRef}
                        value={commentText}
                        onChange={handleCommentChange}
                        placeholder="Write a comment... (Type @ to mention someone)"
                        className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pr-24 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none min-h-[60px] max-h-[120px] shadow-sm"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            handleAddComment();
                          }
                        }}
                      />
                      
                      {/* Move icon button - only show when someone is tagged */}
                      {(() => {
                        const mentionableUsers = roles?.mentionableUsers || [];
                        const { taggedUserIds } = parseMentions(commentText, mentionableUsers);
                        const hasTags = taggedUserIds.length > 0;
                        
                        if (!hasTags || !selectedJob) return null;
                        
                        const allowedStatuses = getAllowedStatusesForPlan(selectedJob.planType);
                        const availableStatuses = allowedStatuses.filter(s => {
                          if (canMoveAny) return true;
                          return canUserMoveToStatus(s);
                        });
                        
                        const moveableStatuses = availableStatuses.filter(s => s !== selectedJob.status);
                        
                        if (moveableStatuses.length === 0) return null;
                        
                        return (
                          <>
                            {/* Move icon button */}
                            <button
                              data-move-options
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowMoveOptions(!showMoveOptions);
                              }}
                              className="absolute right-14 top-1/2 -translate-y-1/2 px-2 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors shadow-sm border border-gray-200 flex flex-col items-center justify-center gap-0.5"
                              title="Move ticket"
                            >
                              <ArrowUpDown className="w-3.5 h-3.5" />
                              <span className="text-[9px] font-medium leading-tight">Move</span>
                            </button>
                            
                            {/* Move options dropdown */}
                            {showMoveOptions && (
                              <div 
                                data-move-options
                                className="absolute bottom-full right-14 mb-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-30 max-h-[300px] overflow-y-auto"
                              >
                                <div className="p-3 border-b border-gray-100">
                                  <p className="text-xs font-semibold text-gray-700">Move ticket to:</p>
                                </div>
                                <div className="p-2 flex flex-col gap-1">
                                  {moveableStatuses.map((status) => (
                                    <button
                                      key={status}
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleMove(selectedJob._id, status, canMoveAny);
                                        setShowMoveOptions(false);
                                      }}
                                      disabled={movingStatus === selectedJob._id}
                                      className="text-left text-xs px-3 py-2 bg-primary/5 text-primary rounded-lg hover:bg-primary/10 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed border border-primary/10 hover:border-primary/30"
                                    >
                                      {STATUS_LABELS[status] || status}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      
                      {/* Send button */}
                      <button
                        onClick={handleAddComment}
                        disabled={!commentText.trim() || addingComment}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary text-white rounded-lg disabled:opacity-50 disabled:bg-gray-300 hover:bg-[#c94a28] transition-colors shadow-md disabled:shadow-none flex items-center justify-center"
                        title="Send comment (Enter)"
                      >
                        {addingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
