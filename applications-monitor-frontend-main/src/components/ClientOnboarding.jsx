import React, { useState, useEffect, useCallback, useRef, useMemo, useTransition } from 'react';
import {
  useOnboardingStore,
  useClientProfileStore,
  ONBOARDING_STATUSES,
  STATUS_LABELS,
  VALID_NEXT_STATUSES,
  PLAN_STATUSES
} from '../store/onboardingStore';
import { toastUtils } from '../utils/toastUtils';
import { handleAuthFailure } from '../utils/authUtils';
import {
  ChevronRight,
  ChevronDown,
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
  ArrowUpDown,
  Search,
  Pencil,
  CheckCircle,
  Image
} from 'lucide-react';

// Extracted sub-components
import JobCard from './ClientOnboarding/JobCard';
import KanbanColumn from './ClientOnboarding/KanbanColumn';
import ClientSidebar from './ClientOnboarding/ClientSidebar';
import JobDetailModal from './ClientOnboarding/JobDetailModal';

// Helpers & constants
import {
  getVisibleColumns,
  clientDisplayName,
  getAllowedStatusesForPlan,
  getStatusColor,
  getColumnAccent,
  getSortingNumber,
  convertToDMY
} from './ClientOnboarding/helpers';
import { API_BASE, AUTH_HEADERS, LOG, LONG_PRESS_MS } from './ClientOnboarding/constants';

export default function ClientOnboarding() {
  const { jobs, setJobs, selectedJob, setSelectedJob, loading, setLoading, roles, setRoles, getJobsByStatus, clearSelected } = useOnboardingStore();
  const [user] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  });

  // ── Core board state ──
  const [movingStatus, setMovingStatus] = useState(null);
  const [draggedJobId, setDraggedJobId] = useState(null);
  const [dragOverStatus, setDragOverStatus] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [, startSearchTransition] = useTransition();
  const [filteredClientEmail, setFilteredClientEmail] = useState(null);
  const [clientJobAnalysis, setClientJobAnalysis] = useState({});
  const [loadingJobDetails, setLoadingJobDetails] = useState(false);

  // ── Add Client modal state ──
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState('existing');
  const [clientsList, setClientsList] = useState([]);
  const [selectedClientEmail, setSelectedClientEmail] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientName, setNewClientName] = useState('');
  const [newPlanType, setNewPlanType] = useState('Professional');
  const [newDashboardManagerName, setNewDashboardManagerName] = useState('');
  const [newBachelorsStartDate, setNewBachelorsStartDate] = useState('');
  const [newMastersEndDate, setNewMastersEndDate] = useState('');
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [clientsLoading, setClientsLoading] = useState(false);

  // ── Notifications ──
  const [notifications, setNotifications] = useState([]);
  const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  const [notificationPage, setNotificationPage] = useState(1);

  // ── Issues panel ──
  const [nonResolvedIssues, setNonResolvedIssues] = useState({ count: 0, items: [], perUser: [], pendingMoves: [] });
  const [showIssuesPanel, setShowIssuesPanel] = useState(false);
  const [resolvingIssueKey, setResolvingIssueKey] = useState(null);
  const [issuesFilterUser, setIssuesFilterUser] = useState(null);

  // ── Import ──
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportConfirmModal, setShowImportConfirmModal] = useState(false);
  const [importingClients, setImportingClients] = useState(false);
  const [importProgress, setImportProgress] = useState({ total: 0, imported: 0, failed: 0 });

  // ── Misc ──
  const [moveToJob, setMoveToJob] = useState(null);
  const [showAdminTicketSummary, setShowAdminTicketSummary] = useState(true);
  const [savingClientNumber, setSavingClientNumber] = useState(false);
  const [dashboardManagerNames, setDashboardManagerNames] = useState([]);

  // ── Refs ──
  const notificationSoundRef = useRef(null);
  const prevUnreadCountRef = useRef(-1);
  const prefetchCacheRef = useRef(new Map());
  const hoverTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressActivatedRef = useRef(false);
  const boardRef = useRef(null);
  const scrollLoopRef = useRef(null);
  const dragCursorXRef = useRef(0);

  // ── Computed ──
  const visibleColumns = getVisibleColumns(user);
  const notificationsPerPage = 10;
  const isAdmin = user?.role === 'admin';
  const isCsm = user?.role === 'csm' || user?.roles?.includes?.('csm');
  const isTeamLead = user?.role === 'team_lead';
  const userSubRole = user?.onboardingSubRole || '';
  const canMoveAny = isAdmin || isCsm || isTeamLead;

  // Get allowed statuses based on user role
  const getAllowedStatusesForUser = () => {
    if (canMoveAny) return ONBOARDING_STATUSES;
    if (userSubRole === 'resume_maker') {
      return ['resume_in_progress', 'resume_draft_done', 'resume_in_review', 'resume_approved'];
    }
    if (userSubRole === 'linkedin_and_cover_letter_optimization') {
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

  const computeJobsForStatus = useCallback((status, deduplicatedJobs) => {
    const baseJobs = deduplicatedJobs.filter((j) => {
      if (j.status !== status) return false;
      const allowedStatuses = getAllowedStatusesForPlan(j.planType);
      return allowedStatuses.includes(status);
    });

    if (status === 'linkedin_in_progress') {
      const linkedInJobs = deduplicatedJobs.filter((j) => {
        if (j.status !== 'resume_approved' || !j.linkedInPhaseStarted) return false;
        const allowedStatuses = getAllowedStatusesForPlan(j.planType);
        return allowedStatuses.includes('linkedin_in_progress');
      });
      const allJobs = [...baseJobs, ...linkedInJobs];
      return Array.from(new Map(allJobs.map((j) => [j._id, j])).values());
    }

    return baseJobs;
  }, []);

  const jobsByColumn = useMemo(() => {
    const uniqueJobsMap = new Map();
    const jobsList = Array.isArray(jobs) ? jobs : [];
    const clientsListArr = Array.isArray(clientsList) ? clientsList : [];
    jobsList.forEach((job) => {
      if (job._id && !uniqueJobsMap.has(job._id)) {
        uniqueJobsMap.set(job._id, job);
      }
    });
    let deduplicatedJobs = Array.from(uniqueJobsMap.values());
    deduplicatedJobs = deduplicatedJobs.map((job) => {
      const clientNum = clientsListArr.find((c) => (c.email || '').toLowerCase() === (job.clientEmail || '').toLowerCase())?.clientNumber ?? job.clientNumber;
      return clientNum != null ? { ...job, clientNumber: clientNum } : job;
    });

    if (isAdmin && filteredClientEmail) {
      const emailLower = filteredClientEmail.toLowerCase();
      deduplicatedJobs = deduplicatedJobs.filter((job) => {
        return (job.clientEmail || '').toLowerCase() === emailLower;
      });
    }

    const q = (searchQuery || '').trim().toLowerCase();
    if (q) {
      deduplicatedJobs = deduplicatedJobs.filter((job) => {
        const name = (job.clientName || '').toLowerCase();
        const email = (job.clientEmail || '').toLowerCase();
        const jobNum = String(job.jobNumber || '');
        const clientNum = String(job.clientNumber ?? '');
        return name.includes(q) || email.includes(q) || jobNum.includes(q) || clientNum.includes(q);
      });
    }
    const map = {};
    visibleColumns.forEach((status) => {
      map[status] = computeJobsForStatus(status, deduplicatedJobs);
    });
    return map;
  }, [jobs, visibleColumns, computeJobsForStatus, searchQuery, filteredClientEmail, isAdmin, clientsList]);

  // Admin: ticket count per dashboard manager
  const adminTicketSummary = useMemo(() => {
    if (!isAdmin) return [];
    const activeStatuses = ONBOARDING_STATUSES.filter(s => s !== 'completed');
    const jobsList = Array.isArray(jobs) ? jobs : [];
    const managerMap = {};
    jobsList.forEach(job => {
      if (!activeStatuses.includes(job.status)) return;
      const manager = job.dashboardManagerName || 'Unassigned';
      if (!managerMap[manager]) {
        managerMap[manager] = { name: manager, total: 0, byStatus: {} };
        activeStatuses.forEach(s => { managerMap[manager].byStatus[s] = 0; });
      }
      managerMap[manager].total++;
      managerMap[manager].byStatus[job.status] = (managerMap[manager].byStatus[job.status] || 0) + 1;
    });
    return Object.values(managerMap).sort((a, b) => b.total - a.total);
  }, [jobs, isAdmin]);

  // ── Data fetching ──
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs`, { headers: AUTH_HEADERS() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (handleAuthFailure(res, data)) return;
        throw new Error(data.error || 'Failed to load jobs');
      }
      const fetchedJobs = data.jobs || [];

      const uniqueJobsMap = new Map();
      fetchedJobs.forEach((job) => {
        if (!job._id) {
          console.warn('Job without _id found:', job);
          return;
        }
        if (uniqueJobsMap.has(job._id)) {
          const existing = uniqueJobsMap.get(job._id);
          const existingUpdated = existing.updatedAt ? new Date(existing.updatedAt) : new Date(0);
          const newUpdated = job.updatedAt ? new Date(job.updatedAt) : new Date(0);
          if (newUpdated > existingUpdated) {
            uniqueJobsMap.set(job._id, job);
          }
        } else {
          uniqueJobsMap.set(job._id, job);
        }
      });
      const uniqueJobs = Array.from(uniqueJobsMap.values());

      const clientStatusMap = new Map();
      uniqueJobs.forEach((job) => {
        const key = `${job.clientEmail || ''}_${job.status || ''}`;
        if (!clientStatusMap.has(key)) {
          clientStatusMap.set(key, []);
        }
        clientStatusMap.get(key).push(job);
      });

      clientStatusMap.forEach((jobsList, key) => {
        if (jobsList.length > 1 && key.includes('resume_approved')) {
          console.warn(`Potential duplicate jobs found for key: ${key}`, jobsList.map(j => ({ id: j._id, jobNumber: j.jobNumber })));
        }
      });

      setJobs(uniqueJobs);

      // Background: sync profileComplete for jobs that haven't been checked yet
      const uncheckedEmails = [...new Set(uniqueJobs.filter(j => j.profileComplete == null).map(j => (j.clientEmail || '').toLowerCase().trim()).filter(Boolean))];
      if (uncheckedEmails.length > 0) {
        fetch(`${API_BASE}/api/onboarding/batch-profile-status`, {
          method: 'POST',
          headers: { ...AUTH_HEADERS(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ emails: uncheckedEmails })
        })
          .then(r => r.json().catch(() => ({})))
          .then(data => {
            const results = data?.results;
            if (results && typeof results === 'object') {
              setJobs(prev => prev.map(j => {
                const email = (j.clientEmail || '').toLowerCase().trim();
                if (email && results[email] !== undefined && j.profileComplete == null) {
                  return { ...j, profileComplete: results[email] };
                }
                return j;
              }));
              useClientProfileStore.getState().batchSetProfileComplete(results);
            }
          })
          .catch(() => {});
      }

      // Update selected job if it exists in the fresh data
      const store = useOnboardingStore.getState();
      if (store.selectedJob?._id) {
        const freshLightweight = uniqueJobs.find((j) => j._id === store.selectedJob._id);
        if (freshLightweight) {
          const existing = store.selectedJob;
          const merged = {
            ...freshLightweight,
            ...(existing.comments !== undefined && { comments: existing.comments }),
            ...(existing.moveHistory !== undefined && { moveHistory: existing.moveHistory }),
            ...(existing.attachments !== undefined && { attachments: existing.attachments }),
            ...(existing.dashboardCredentials !== undefined && { dashboardCredentials: existing.dashboardCredentials }),
            ...(existing.gmailCredentials !== undefined && { gmailCredentials: existing.gmailCredentials }),
            ...(existing.gmailCredentialsHistory !== undefined && { gmailCredentialsHistory: existing.gmailCredentialsHistory }),
          };
          setSelectedJob(merged);
        } else {
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
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setRoles(data);
      } else if (handleAuthFailure(res, data)) {
        return;
      }
    } catch (_) { }
  }, [setRoles]);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/notifications`, { headers: AUTH_HEADERS() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (handleAuthFailure(res, data)) return;
      }
      if (res.ok) {
        const notifs = data.notifications || [];
        const unreadCount = notifs.filter(n => !n.read).length;
        if (prevUnreadCountRef.current >= 0 && unreadCount > prevUnreadCountRef.current) {
          try {
            if (!notificationSoundRef.current) {
              notificationSoundRef.current = new Audio('/discord-notification.mp3');
              notificationSoundRef.current.volume = 0.5;
            }
            notificationSoundRef.current.currentTime = 0;
            notificationSoundRef.current.play().catch(() => {});
          } catch (_) { }
        }
        prevUnreadCountRef.current = unreadCount;
        setNotifications(notifs);
      }
    } catch (_) { }
  }, []);

  const fetchNonResolvedIssues = useCallback(async () => {
    try {
      const isAdminUser = user?.role === 'admin';
      const url = isAdminUser
        ? `${API_BASE}/api/onboarding/issues/non-resolved?admin=1`
        : `${API_BASE}/api/onboarding/issues/non-resolved`;
      const res = await fetch(url, { headers: AUTH_HEADERS(), cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (handleAuthFailure(res, data)) return;
      } else {
        setNonResolvedIssues({ count: data.count ?? 0, items: data.items ?? [], perUser: data.perUser ?? [], pendingMoves: data.pendingMoves ?? [] });
      }
    } catch (_) { }
  }, [user?.role]);

  const fetchClientJobAnalysis = useCallback(async (selectedDate) => {
    try {
      const body = selectedDate ? { date: convertToDMY(selectedDate) } : {};
      const res = await fetch(`${API_BASE}/api/analytics/client-job-analysis`, {
        method: 'POST',
        headers: { ...AUTH_HEADERS(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        const data = await res.json();
        const analysisMap = {};
        (data.rows || []).forEach((row) => {
          analysisMap[row.email.toLowerCase()] = {
            saved: row.saved || 0,
            applied: row.applied || 0,
            interviewing: row.interviewing || 0,
            offer: row.offer || 0,
            rejected: row.rejected || 0,
            removed: row.removed || 0,
            lastAppliedOperatorName: row.lastAppliedOperatorName || ''
          };
        });
        setClientJobAnalysis(analysisMap);
      }
    } catch (e) {
      console.error('Failed to fetch client job analysis:', e);
    }
  }, []);

  const fetchClients = useCallback(() => {
    setClientsLoading(true);
    fetch(`${API_BASE}/api/clients`, { headers: AUTH_HEADERS() })
      .then((r) => r.ok ? r.json() : { clients: [] })
      .then((data) => setClientsList(data.clients || []))
      .catch(() => setClientsList([]))
      .finally(() => setClientsLoading(false));
  }, []);

  // ── Client number save (simplified: accepts email + value as params) ──
  const handleSaveClientNumber = useCallback(async (clientEmail, valueOverride) => {
    if (!clientEmail || !isAdmin) return;
    const val = String(valueOverride ?? '').trim();
    setSavingClientNumber(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients/${encodeURIComponent(clientEmail)}/client-number`, {
        method: 'PATCH',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({ clientNumber: val ? parseInt(val, 10) : null })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      toastUtils.success('Client number updated');
      fetchClients();
      fetchJobs();
    } catch (e) {
      toastUtils.error(e.message || 'Failed');
    } finally {
      setSavingClientNumber(false);
    }
  }, [isAdmin, fetchClients, fetchJobs]);

  const markNotificationRead = useCallback(async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/notifications/${id}/read`, {
        method: 'PATCH',
        headers: AUTH_HEADERS()
      });
      if (res.ok) setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    } catch (_) { }
  }, []);

  // ── Effects ──
  useEffect(() => {
    fetchJobs();
    fetchRoles();
    fetchClientJobAnalysis('');
    fetchClients();
  }, [fetchJobs, fetchRoles, fetchClientJobAnalysis, fetchClients]);

  useEffect(() => {
    fetch(`${API_BASE}/api/managers/names`)
      .then((r) => r.ok ? r.json() : { success: false, names: [] })
      .then((data) => { if (data.success) setDashboardManagerNames(data.names || []); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchNotifications();
    fetchNonResolvedIssues();
  }, [fetchNotifications, fetchNonResolvedIssues]);

  // Auto-scroll to client's ticket when a client is selected in sidebar
  useEffect(() => {
    if (!filteredClientEmail || loading) return;
    const email = filteredClientEmail.toLowerCase();
    const timer = setTimeout(() => {
      const candidates = document.querySelectorAll('[data-client-email]');
      const el = Array.from(candidates).find((n) => (n.getAttribute('data-client-email') || '').toLowerCase() === email);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [filteredClientEmail, loading]);

  // Poll for new notifications every 30 seconds
  useEffect(() => {
    const id = setInterval(() => {
      fetchNotifications();
      fetchNonResolvedIssues();
    }, 30000);
    return () => clearInterval(id);
  }, [fetchNotifications, fetchNonResolvedIssues]);

  // Cleanup all timers on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (scrollLoopRef.current) cancelAnimationFrame(scrollLoopRef.current);
    };
  }, []);

  // Mark notifications read when selectedJob changes
  useEffect(() => {
    if (!selectedJob?._id) return;
    notifications
      .filter((n) => !n.read && n.jobId === selectedJob._id)
      .forEach((n) => { if (n._id) markNotificationRead(n._id); });
  }, [selectedJob?._id, notifications, markNotificationRead]);

  // ── Move handler ──
  const handleMove = useCallback(async (jobId, newStatus, skipRoleCheck = false) => {
    if (movingStatus) {
      toastUtils.error('Please wait, move in progress...');
      return;
    }

    const job = jobs.find((j) => j._id === jobId);
    if (!job) {
      toastUtils.error('Job not found');
      return;
    }

    if (!skipRoleCheck && !canUserMoveToStatus(newStatus)) {
      const allowedStatuses = getAllowedStatusesForUser();
      toastUtils.error(`You don't have permission to move to "${STATUS_LABELS[newStatus] || newStatus}". Your role only allows: ${allowedStatuses.map(s => STATUS_LABELS[s] || s).join(', ')}`);
      return;
    }

    const allowedStatuses = getAllowedStatusesForPlan(job.planType);
    if (!allowedStatuses.includes(newStatus)) {
      const planName = job.planType || 'this plan';
      toastUtils.error(`This plan doesn't support moving to "${STATUS_LABELS[newStatus] || newStatus}". ${planName === 'executive' ? 'Executive plan' : planName === 'professional' ? 'Professional plan' : 'This plan'} only supports: ${allowedStatuses.map(s => STATUS_LABELS[s] || s).join(', ')}`);
      return;
    }

    const originalJob = { ...job };
    setMovingStatus(jobId);

    // Optimistic update
    setJobs((prev) => prev.map((j) => (j._id === jobId ? { ...j, status: newStatus } : j)));
    if (selectedJob?._id === jobId) {
      setSelectedJob((prev) => (prev ? { ...prev, status: newStatus } : null));
    }

    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${jobId}`, {
        method: 'PATCH',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({ status: newStatus })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Move failed');

      prefetchCacheRef.current.delete(jobId);
      setJobs((prev) => prev.map((j) => (j._id === jobId ? data.job : j)));
      if (selectedJob?._id === jobId) {
        setSelectedJob(data.job);
      }
      toastUtils.success(`Moved to ${STATUS_LABELS[newStatus] || newStatus}`);
    } catch (e) {
      console.error('Move error:', e);
      toastUtils.error(e.message || 'Failed to move card');
      setJobs((prev) => prev.map((j) => (j._id === jobId ? originalJob : j)));
      if (selectedJob?._id === jobId) {
        setSelectedJob(originalJob);
      }
    } finally {
      setMovingStatus(null);
    }
  }, [jobs, movingStatus, selectedJob, canUserMoveToStatus, setJobs, setSelectedJob]);

  // ── Drag & Drop ──
  const handleDragStart = useCallback((e, job) => {
    setDraggedJobId(job._id);
    e.dataTransfer.setData('application/json', JSON.stringify({ jobId: job._id, fromStatus: job.status }));
    e.dataTransfer.effectAllowed = 'move';
    dragCursorXRef.current = e.clientX ?? 0;
    startEdgeScrollLoop();
  }, []);

  const handleDragEnd = useCallback(() => {
    cancelEdgeScrollLoop();
    setDraggedJobId(null);
    setDragOverStatus(null);
  }, []);

  const handleDragOver = useCallback((e, status) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStatus(status);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverStatus(null);
  }, []);

  function startEdgeScrollLoop() {
    if (scrollLoopRef.current) return;
    const EDGE = 100;
    const MIN_STEP = 14;
    const MAX_STEP = 32;
    const loop = () => {
      const container = boardRef.current;
      const x = dragCursorXRef.current;
      if (!container) {
        scrollLoopRef.current = requestAnimationFrame(loop);
        return;
      }
      const { left, right } = container.getBoundingClientRect();
      const inLeft = x - left < EDGE;
      const inRight = right - x < EDGE;
      if (inLeft) {
        const t = 1 - (x - left) / EDGE;
        const step = MIN_STEP + t * t * (MAX_STEP - MIN_STEP);
        container.scrollBy({ left: -step, behavior: 'auto' });
      } else if (inRight) {
        const t = 1 - (right - x) / EDGE;
        const step = MIN_STEP + t * t * (MAX_STEP - MIN_STEP);
        container.scrollBy({ left: step, behavior: 'auto' });
      }
      scrollLoopRef.current = requestAnimationFrame(loop);
    };
    scrollLoopRef.current = requestAnimationFrame(loop);
  }

  function cancelEdgeScrollLoop() {
    if (scrollLoopRef.current) {
      cancelAnimationFrame(scrollLoopRef.current);
      scrollLoopRef.current = null;
    }
  }

  const handleDragOverBoard = (e) => {
    e.preventDefault();
    dragCursorXRef.current = e.clientX ?? 0;
  };

  // ── Long press ──
  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleCardLongPressStart = (e, job) => {
    clearLongPressTimer();
    longPressActivatedRef.current = false;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressActivatedRef.current = true;
      setMoveToJob(job);
    }, LONG_PRESS_MS);
  };

  const handleCardLongPressEnd = () => {
    clearLongPressTimer();
  };

  // ── Card click (with prefetch cache, admin unread, lazy loading) ──
  const handleCardClick = useCallback((job) => {
    LOG('Card clicked:', job?.jobNumber, job?.clientName, job?._id);
    if (longPressActivatedRef.current) {
      longPressActivatedRef.current = false;
      return;
    }

    // Admin unread: optimistic reset + fire-and-forget server sync
    if (user?.role === 'admin' && job.adminUnreadCount > 0) {
      setJobs(prev => prev.map(j => j._id === job._id ? { ...j, adminUnreadCount: 0 } : j));
      const cached = prefetchCacheRef.current.get(job._id);
      if (cached) prefetchCacheRef.current.set(job._id, { ...cached, adminUnreadCount: 0 });
      fetch(`${API_BASE}/api/onboarding/jobs/${job._id}/admin-read`, {
        method: 'POST',
        headers: AUTH_HEADERS()
      }).catch(() => {});
    }

    // If hover-prefetch already loaded the full data, use it immediately
    const prefetched = prefetchCacheRef.current.get(job._id);
    if (prefetched) {
      LOG('Job details from cache:', job._id);
      setSelectedJob(prefetched);
      setJobs(prev => prev.map(j => j._id === job._id ? { ...j, ...prefetched } : j));
      return;
    }

    // Otherwise open panel with lightweight card data and fetch full details in background
    setSelectedJob(job);
    setLoadingJobDetails(true);
    LOG('Job details fetch start:', job._id);
    fetch(`${API_BASE}/api/onboarding/jobs/${job._id}`, { headers: AUTH_HEADERS() })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.job) {
          prefetchCacheRef.current.set(job._id, data.job);
          const current = useOnboardingStore.getState().selectedJob;
          if (current?._id === job._id) {
            setSelectedJob(data.job);
            setJobs(prev => prev.map(j => j._id === job._id ? { ...j, ...data.job } : j));
          }
          LOG('Job details loaded:', job._id);
        } else {
          LOG('Job details empty response:', job._id);
        }
      })
      .catch((err) => {
        console.error('[ClientOnboarding] Job details fetch error:', err?.message || err, job._id);
      })
      .finally(() => setLoadingJobDetails(false));
  }, [setSelectedJob, setJobs, user]);

  // Prefetch full job on hover
  const handleCardHoverStart = useCallback((job) => {
    if (prefetchCacheRef.current.has(job._id)) return;
    clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      if (prefetchCacheRef.current.has(job._id)) return;
      fetch(`${API_BASE}/api/onboarding/jobs/${job._id}`, { headers: AUTH_HEADERS() })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.job) prefetchCacheRef.current.set(job._id, data.job); })
        .catch(() => {});
    }, 200);
  }, []);

  const handleCardHoverEnd = useCallback(() => {
    clearTimeout(hoverTimerRef.current);
  }, []);

  const handleMoveToChoice = useCallback((job, newStatus) => {
    if (job.status === newStatus) return;
    handleMove(job._id, newStatus, canMoveAny);
    setMoveToJob(null);
  }, [handleMove, canMoveAny]);

  // ── Drop handler (kept exactly as-is) ──
  const handleDrop = (e, toStatus) => {
    e.preventDefault();
    setDragOverStatus(null);
    if (!draggedJobId) return;

    if (movingStatus) {
      setDraggedJobId(null);
      toastUtils.error('Please wait, move in progress...');
      return;
    }

    try {
      const raw = e.dataTransfer.getData('application/json');
      const { jobId, fromStatus } = raw ? JSON.parse(raw) : { jobId: draggedJobId, fromStatus: '' };

      if (!jobId || typeof jobId !== 'string') {
        setDraggedJobId(null);
        toastUtils.error('Invalid job ID');
        return;
      }

      const matchingJobs = jobs.filter((j) => j._id === jobId);
      if (matchingJobs.length === 0) {
        setDraggedJobId(null);
        toastUtils.error('Job not found');
        return;
      }

      if (matchingJobs.length > 1) {
        console.error(`Duplicate job IDs found: ${jobId}`, matchingJobs);
        console.warn('Using first matching job and continuing operation...');
      }

      const job = matchingJobs[0];
      const from = job.status;

      if (toStatus === from) {
        setDraggedJobId(null);
        return;
      }

      const allowedStatuses = getAllowedStatusesForPlan(job.planType);
      if (!allowedStatuses.includes(toStatus)) {
        const planName = job.planType || 'this plan';
        toastUtils.error(`This plan doesn't support moving to "${STATUS_LABELS[toStatus] || toStatus}". ${planName === 'executive' ? 'Executive plan' : planName === 'professional' ? 'Professional plan' : 'This plan'} only supports: ${allowedStatuses.map(s => STATUS_LABELS[s] || s).join(', ')}`);
        return;
      }

      if (toStatus === 'linkedin_in_progress' && from === 'resume_approved' && job.linkedInPhaseStarted) {
        handleMove(jobId, 'linkedin_in_progress');
        return;
      }

      if (!canUserMoveToStatus(toStatus) && !canMoveAny) {
        const allowedStatuses = getAllowedStatusesForUser();
        toastUtils.error(`You don't have permission to move to "${STATUS_LABELS[toStatus] || toStatus}". Your role only allows: ${allowedStatuses.map(s => STATUS_LABELS[s] || s).join(', ')}`);
        return;
      }

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

  // ── New callbacks for the modal ──
  const handleUpdateJob = useCallback((jobId, updatedJob) => {
    setSelectedJob(updatedJob);
    setJobs(prev => prev.map(j => j._id === jobId ? updatedJob : j));
    prefetchCacheRef.current.delete(jobId);
  }, [setSelectedJob, setJobs]);

  const handleMoveForModal = useCallback((jobId, newStatus, skipRoleCheck) => {
    return handleMove(jobId, newStatus, skipRoleCheck);
  }, [handleMove]);

  const handleCloseModal = useCallback(() => {
    clearSelected();
    setSelectedJob(null);
  }, [clearSelected, setSelectedJob]);

  // ── Notification helpers ──
  const unreadNotifications = useMemo(() => (notifications || []).filter((n) => !n.read), [notifications]);
  const handleNotificationClick = (notification) => {
    const job = jobs.find((j) => j._id === notification.jobId);
    if (job) handleCardClick(job);
    if (notification._id) markNotificationRead(notification._id);
  };

  // ── Add / Import handlers ──
  const openAddModal = useCallback(() => {
    setShowAddModal(true);
    setSelectedClientEmail('');
    setNewClientEmail('');
    setNewClientName('');
    setNewPlanType('Professional');
    setNewDashboardManagerName('');
    setNewBachelorsStartDate('');
    setNewMastersEndDate('');
    setAddMode('existing');
    fetchClients();
  }, [fetchClients]);

  const handleImportAllClients = useCallback(async () => {
    const resumeMakers = roles?.resumeMakers || [];
    const linkedInMembers = roles?.linkedInMembers || [];

    const hasResumeMakers = resumeMakers.length > 0;
    const hasLinkedInMembers = linkedInMembers.length > 0;

    if (!hasResumeMakers && !hasLinkedInMembers) {
      setShowImportModal(false);
      setShowImportConfirmModal(true);
      return;
    }

    setShowImportModal(false);
    setImportingClients(true);
    setImportProgress({ total: 0, imported: 0, failed: 0 });

    try {
      const clientsRes = await fetch(`${API_BASE}/api/clients`, { headers: AUTH_HEADERS() });
      if (!clientsRes.ok) throw new Error('Failed to fetch clients');
      const clientsData = await clientsRes.json();
      const allClients = clientsData.clients || [];

      const existingClientEmails = new Set((jobs || []).map((j) => (j.clientEmail || '').toLowerCase()));

      const clientsToImport = allClients.filter(
        (c) => c.email && !existingClientEmails.has((c.email || '').toLowerCase())
      );

      setImportProgress({ total: clientsToImport.length, imported: 0, failed: 0 });

      let imported = 0;
      let failed = 0;

      for (const client of clientsToImport) {
        try {
          const res = await fetch(`${API_BASE}/api/onboarding/jobs`, {
            method: 'POST',
            headers: AUTH_HEADERS(),
            body: JSON.stringify({
              clientEmail: client.email,
              clientName: client.name || client.email,
              planType: client.planType || 'Professional',
              dashboardManagerName: client.dashboardTeamLeadName || ''
            })
          });

          if (res.ok) {
            imported++;
          } else {
            failed++;
          }

          setImportProgress({ total: clientsToImport.length, imported, failed });
        } catch (err) {
          failed++;
          setImportProgress({ total: clientsToImport.length, imported, failed });
        }
      }

      toastUtils.success(`Import complete: ${imported} imported, ${failed} failed`);
      await fetchJobs();
    } catch (e) {
      toastUtils.error(e.message || 'Failed to import clients');
    } finally {
      setImportingClients(false);
      setShowImportConfirmModal(false);
    }
  }, [roles, jobs, fetchJobs]);

  const handleImportConfirm = useCallback(() => {
    setShowImportConfirmModal(false);
    handleImportAllClients();
  }, [handleImportAllClients]);

  const availableClients = useMemo(() => {
    const existing = new Set((jobs || []).map((j) => (j.clientEmail || '').toLowerCase()));
    return (clientsList || []).filter((c) => c.email && !existing.has((c.email || '').toLowerCase()));
  }, [jobs, clientsList]);

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
      const payload = {
        clientEmail,
        clientName,
        planType,
        dashboardManagerName
      };
      if (addMode === 'new') {
        payload.bachelorsStartDate = (newBachelorsStartDate || '').trim();
        payload.mastersEndDate = (newMastersEndDate || '').trim();
      }
      const res = await fetch(`${API_BASE}/api/onboarding/jobs`, {
        method: 'POST',
        headers: AUTH_HEADERS(),
        body: JSON.stringify(payload)
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

  // ── Access check ──
  if (visibleColumns.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto flex items-center justify-center min-h-[60vh]">
        <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center shadow-lg">
          <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Restricted</h2>
          <p className="text-gray-600">You don't have access to Client Onboarding.</p>
          <p className="text-gray-500 text-sm mt-2">Contact an admin to assign you an onboarding or CSM role.</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  //  JSX
  // ══════════════════════════════════════════════════════════════════
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
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search by client name, email, or number..."
                value={searchInput}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchInput(val);
                  startSearchTransition(() => setSearchQuery(val));
                }}
                className="pl-10 pr-4 py-2 w-72 border border-gray-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white shadow-sm text-sm"
              />
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotificationPanel((v) => !v)}
                className="relative p-2.5 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-all focus:outline-none"
              >
                <Bell className="w-6 h-6" />
                {unreadNotifications.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 ring-2 ring-white">
                    {unreadNotifications.length > 99 ? '99+' : unreadNotifications.length}
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
                                  <span className="font-bold">{n.jobNumber}</span> – {clientDisplayName(n)}
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

            {/* Unresolved issues panel */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowIssuesPanel((v) => !v)}
                className="relative flex items-center gap-2 px-3 py-2.5 rounded-xl text-gray-600 hover:bg-gray-100 hover:text-gray-900 border border-gray-200 bg-white text-sm font-medium transition-all focus:outline-none"
                title={isAdmin ? 'Unresolved tagged issues across all clients' : 'My unresolved tagged issues'}
              >
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <span className="hidden sm:inline">Unresolved</span>
                {(nonResolvedIssues.count + (nonResolvedIssues.pendingMoves?.length || 0)) > 0 && (
                  <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold px-1.5">
                    {(() => { const total = nonResolvedIssues.count + (nonResolvedIssues.pendingMoves?.length || 0); return total > 99 ? '99+' : total; })()}
                  </span>
                )}
              </button>

              {showIssuesPanel && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => { setShowIssuesPanel(false); setIssuesFilterUser(null); }} aria-hidden="true" />
                  <div className="absolute right-0 top-full z-50 mt-4 w-[420px] rounded-2xl bg-white border border-gray-100 shadow-2xl ring-1 ring-black/5 max-h-[70vh] overflow-hidden flex flex-col">
                    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                      <h3 className="font-semibold text-gray-900">
                        {isAdmin ? 'Unresolved tagged issues' : 'My unresolved issues'}
                        {nonResolvedIssues.count > 0 && <span className="ml-2 text-xs text-amber-600 font-bold">({nonResolvedIssues.count})</span>}
                      </h3>
                      <button type="button" onClick={() => { setShowIssuesPanel(false); setIssuesFilterUser(null); }} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Admin per-user breakdown */}
                    {isAdmin && nonResolvedIssues.perUser?.length > 0 && (
                      <div className="px-4 py-3 border-b border-gray-100 bg-amber-50/30">
                        <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Per team member</p>
                        <div className="flex flex-wrap gap-1.5">
                          {nonResolvedIssues.perUser.map((u) => {
                            const emailPrefix = (u.email || '').split('@')[0];
                            const isActive = issuesFilterUser === u.email;
                            return (
                              <button
                                key={u.email}
                                type="button"
                                onClick={() => setIssuesFilterUser(isActive ? null : u.email)}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                                  isActive
                                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                    : 'bg-white text-gray-700 border-gray-200 hover:border-amber-300 hover:bg-amber-50'
                                }`}
                              >
                                <span className="w-4 h-4 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-[9px] font-bold flex-shrink-0">
                                  {(emailPrefix[0] || 'U').toUpperCase()}
                                </span>
                                <span className="truncate max-w-[100px]">{emailPrefix}</span>
                                <span className={`flex h-4 min-w-[16px] items-center justify-center rounded-full text-[10px] font-bold px-1 ${
                                  isActive ? 'bg-white/30 text-white' : 'bg-amber-100 text-amber-700'
                                }`}>
                                  {u.count}
                                </span>
                              </button>
                            );
                          })}
                          {issuesFilterUser && (
                            <button
                              type="button"
                              onClick={() => setIssuesFilterUser(null)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                            >
                              <X className="w-3 h-3" /> Clear
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <ul className="overflow-y-auto p-2 flex-1 space-y-1">
                      {/* Pending move requests */}
                      {nonResolvedIssues.pendingMoves?.length > 0 && (
                        <>
                          <li className="px-3 pt-2 pb-1">
                            <p className="text-[10px] uppercase tracking-wider text-amber-600 font-semibold">Pending move requests ({nonResolvedIssues.pendingMoves.length})</p>
                          </li>
                          {nonResolvedIssues.pendingMoves.map((mv) => {
                            const job = jobs.find(j => String(j._id) === String(mv.jobId));
                            const displayName = mv.clientNumber != null ? `${mv.clientNumber} – ${mv.clientName || ''}` : (mv.clientName || '');
                            return (
                              <li key={`move-${mv.jobId}`}>
                                <div className="px-4 py-3 rounded-xl text-sm bg-amber-50/50 border border-amber-100">
                                  <div className="flex items-start gap-3">
                                    <ArrowUpDown className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-gray-900 font-medium leading-snug">
                                        <span className="font-bold">#{mv.jobNumber}</span> – {displayName}
                                      </p>
                                      <p className="text-xs text-amber-700 mt-1">
                                        {mv.requestedByName || mv.requestedBy} wants to move to <strong>{STATUS_LABELS[mv.targetStatus] || mv.targetStatus}</strong>
                                      </p>
                                      {mv.requestedAt && (
                                        <p className="text-[10px] text-gray-400 mt-1">{new Date(mv.requestedAt).toLocaleDateString()} at {new Date(mv.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                      )}
                                      {(isAdmin || isTeamLead) && (
                                        <div className="flex gap-2 mt-2">
                                          <button
                                            onClick={async () => {
                                              try {
                                                const res = await fetch(`${API_BASE}/api/onboarding/jobs/${mv.jobId}/approve-move`, { method: 'POST', headers: AUTH_HEADERS() });
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data.error || 'Failed');
                                                setJobs(prev => prev.map(j => j._id === String(mv.jobId) ? data.job : j));
                                                if (selectedJob?._id === String(mv.jobId)) setSelectedJob(data.job);
                                                toastUtils.success(`Approved move to ${STATUS_LABELS[mv.targetStatus] || mv.targetStatus}`);
                                                fetchNonResolvedIssues();
                                              } catch (err) { toastUtils.error(err.message); }
                                            }}
                                            className="text-xs px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium transition-colors"
                                          >Approve</button>
                                          <button
                                            onClick={async () => {
                                              try {
                                                const res = await fetch(`${API_BASE}/api/onboarding/jobs/${mv.jobId}/reject-move`, { method: 'POST', headers: AUTH_HEADERS() });
                                                const data = await res.json();
                                                if (!res.ok) throw new Error(data.error || 'Failed');
                                                setJobs(prev => prev.map(j => j._id === String(mv.jobId) ? data.job : j));
                                                if (selectedJob?._id === String(mv.jobId)) setSelectedJob(data.job);
                                                toastUtils.success('Move request rejected');
                                                fetchNonResolvedIssues();
                                              } catch (err) { toastUtils.error(err.message); }
                                            }}
                                            className="text-xs px-3 py-1 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 font-medium transition-colors"
                                          >Reject</button>
                                          <button
                                            onClick={() => {
                                              if (job) { handleCardClick(job); setShowIssuesPanel(false); setIssuesFilterUser(null); }
                                            }}
                                            className="text-xs px-3 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 font-medium transition-colors ml-auto"
                                          >View</button>
                                        </div>
                                      )}
                                      {!isAdmin && !isTeamLead && (
                                        <p className="text-[10px] text-amber-500 mt-1.5 font-medium">Awaiting approval from team lead or admin</p>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </li>
                            );
                          })}
                          {nonResolvedIssues.items.length > 0 && (
                            <li className="px-3 pt-3 pb-1">
                              <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Unresolved tagged comments ({nonResolvedIssues.count})</p>
                            </li>
                          )}
                        </>
                      )}
                      {nonResolvedIssues.items.length === 0 && (!nonResolvedIssues.pendingMoves?.length) ? (
                        <li className="py-12 text-center">
                          <div className="mx-auto w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
                            <CheckCircle className="w-6 h-6 text-green-400" />
                          </div>
                          <p className="text-sm text-gray-500 font-medium">No unresolved issues</p>
                        </li>
                      ) : (
                        nonResolvedIssues.items
                          .filter(item => !issuesFilterUser || (item.unresolvedEmails || []).includes(issuesFilterUser))
                          .map((item, idx) => {
                          const job = jobs.find((j) => String(j._id) === String(item.jobId));
                          const displayName = item.clientNumber != null ? `${item.clientNumber} – ${item.clientName || ''}` : (item.clientName || '');
                          const resolvingKey = `${item.jobId}-${item.commentId}`;
                          return (
                            <li key={item.commentId?.toString() || idx}>
                              <div className="flex gap-3 items-stretch w-full text-left px-4 py-3 rounded-xl text-sm transition-all hover:bg-amber-50/50 group">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (job) {
                                      handleCardClick(job);
                                      setShowIssuesPanel(false);
                                      setIssuesFilterUser(null);
                                    } else {
                                      fetchJobs().then(() => {
                                        const state = useOnboardingStore.getState();
                                        const found = (state.jobs || []).find((j) => String(j._id) === String(item.jobId));
                                        if (found) handleCardClick(found);
                                      });
                                      setShowIssuesPanel(false);
                                      setIssuesFilterUser(null);
                                    }
                                  }}
                                  className="flex-1 min-w-0 flex gap-3"
                                >
                                  <div className="mt-1 w-2 h-2 rounded-full flex-shrink-0 bg-amber-500" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-gray-900 font-medium leading-snug">
                                      <span className="font-bold">#{item.jobNumber}</span> – {displayName}
                                    </p>
                                    {item.snippet && (
                                      <p className="text-xs text-gray-500 mt-1 truncate">"{item.snippet}"</p>
                                    )}
                                    {isAdmin && item.unresolvedEmails?.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {item.unresolvedEmails.map(email => (
                                          <span key={email} className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-medium">
                                            {email.split('@')[0]}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                    <p className="text-[10px] text-gray-400 mt-1.5 font-medium">
                                      {item.authorName && <span className="text-gray-500">{item.authorName} · </span>}
                                      {item.createdAt ? `${new Date(item.createdAt).toLocaleDateString()} at ${new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                                    </p>
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-primary flex-shrink-0" />
                                </button>
                                {isAdmin && item.jobId && item.commentId && (
                                  <button
                                    type="button"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      setResolvingIssueKey(resolvingKey);
                                      const commentIdStr = String(item.commentId);
                                      const jobIdStr = String(item.jobId);
                                      const prevIssues = nonResolvedIssues;
                                      setNonResolvedIssues((curr) => {
                                        const nextItems = (curr.items || []).filter(
                                          (i) => String(i.commentId) !== commentIdStr || String(i.jobId) !== jobIdStr
                                        );
                                        const nextCount = Math.max(0, (curr.count ?? 0) - 1);
                                        const userCounts = {};
                                        nextItems.forEach((it) => {
                                          (it.unresolvedEmails || []).forEach((email) => {
                                            userCounts[email] = (userCounts[email] || 0) + 1;
                                          });
                                        });
                                        const nextPerUser = Object.entries(userCounts)
                                          .map(([email, count]) => ({ email, count }))
                                          .sort((a, b) => b.count - a.count);
                                        return { ...curr, items: nextItems, count: nextCount, perUser: nextPerUser };
                                      });
                                      try {
                                        const res = await fetch(`${API_BASE}/api/onboarding/jobs/${item.jobId}/comments/${commentIdStr}/resolve`, {
                                          method: 'PATCH',
                                          headers: AUTH_HEADERS()
                                        });
                                        const data = await res.json();
                                        if (!res.ok) throw new Error(data.error || 'Failed to mark as resolved');
                                        setJobs((prev) => prev.map((j) => (j._id === jobIdStr ? data.job : j)));
                                        if (selectedJob?._id === jobIdStr) setSelectedJob(data.job);
                                        toastUtils.success('Marked as resolved');
                                        await fetchNonResolvedIssues();
                                      } catch (err) {
                                        toastUtils.error(err.message || 'Failed to mark as resolved');
                                        setNonResolvedIssues(prevIssues);
                                        await fetchNonResolvedIssues();
                                      } finally {
                                        setResolvingIssueKey(null);
                                      }
                                    }}
                                    disabled={resolvingIssueKey === resolvingKey}
                                    className="flex-shrink-0 self-center px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
                                    title="Mark as resolved (admin)"
                                  >
                                    {resolvingIssueKey === resolvingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                                    Resolve
                                  </button>
                                )}
                              </div>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  </div>
                </>
              )}
            </div>

            {/* Add Client / Import Buttons */}
            {(isAdmin || isTeamLead) && (
              <>
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="flex items-center gap-2 px-5 py-2.5 bg-white text-gray-700 border-2 border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 text-sm font-semibold shadow-sm transition-all active:scale-95"
                >
                  <Briefcase className="w-4 h-4" />
                  <span className="tracking-wide">Import All Clients</span>
                </button>
                <button
                  type="button"
                  onClick={openAddModal}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl hover:bg-primary-hover text-sm font-semibold shadow-lg shadow-orange-500/20 transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4 stroke-[3px]" />
                  <span className="tracking-wide">Add Client</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Admin: Ticket count per dashboard manager */}
      {isAdmin && adminTicketSummary.length > 0 && (
        <div className="mx-6 mt-2 mb-1">
          <button
            onClick={() => setShowAdminTicketSummary(v => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 transition-colors mb-1"
          >
            {showAdminTicketSummary ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            Team Lead Assignment Summary
          </button>
          {showAdminTicketSummary && (
            <div className="flex flex-wrap gap-3">
              {adminTicketSummary.map(m => (
                <div key={m.name} className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm min-w-[180px]">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <span className="text-sm font-semibold text-slate-800 truncate max-w-[140px]">{m.name}</span>
                    <span className="bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full">{m.total}</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {ONBOARDING_STATUSES.filter(s => s !== 'completed').map(s => {
                      const count = m.byStatus[s] || 0;
                      if (count === 0) return null;
                      const shortLabels = {
                        resume_in_progress: 'Res IP',
                        resume_draft_done: 'Res DD',
                        resume_in_review: 'Res Rev',
                        resume_approved: 'Res OK',
                        linkedin_in_progress: 'LI IP',
                        linkedin_done: 'LI Done',
                        cover_letter_in_progress: 'CL IP',
                        cover_letter_done: 'CL Done',
                        applications_ready: 'App Rdy',
                        applications_in_progress: 'App IP'
                      };
                      return (
                        <span key={s} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium" title={STATUS_LABELS[s]}>
                          {shortLabels[s] || s}: {count}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main Content Area - Sidebar + Kanban */}
      <div className="flex gap-0 h-[calc(100vh-80px)]">
        {/* Left Sidebar - Client List (Admin Only) */}
        {isAdmin && (
          <ClientSidebar
            jobs={jobs}
            clientsList={clientsList}
            filteredClientEmail={filteredClientEmail}
            onFilterClient={setFilteredClientEmail}
            onSaveClientNumber={handleSaveClientNumber}
            savingClientNumber={savingClientNumber}
          />
        )}

        {/* Main Content / Kanban */}
        <div
          ref={boardRef}
          className={`flex-1 overflow-x-auto overflow-y-hidden pb-6 scroll-smooth ${isAdmin ? '' : 'h-full'}`}
          onDragOver={handleDragOverBoard}
          style={{ WebkitOverflowScrolling: 'touch', scrollPaddingLeft: 16, scrollPaddingRight: 16 }}
        >
          {loading ? (
            <div className="flex h-full w-full items-center justify-center">
              <Loader2 className="w-10 h-10 animate-spin text-primary" />
            </div>
          ) : (
            <div className="flex gap-6 p-6 min-w-max h-full">
              {visibleColumns.map((status) => {
                const columnJobs = jobsByColumn[status] || [];
                return (
                  <KanbanColumn
                    key={status}
                    status={status}
                    jobs={columnJobs}
                    draggedJobId={draggedJobId}
                    dragOverStatus={dragOverStatus}
                    isAdmin={isAdmin}
                    visibleColumns={visibleColumns}
                    clientJobAnalysis={clientJobAnalysis}
                    onMoveTo={handleMoveToChoice}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onCardClick={handleCardClick}
                    onLongPressStart={handleCardLongPressStart}
                    onLongPressEnd={handleCardLongPressEnd}
                    onHoverStart={handleCardHoverStart}
                    onHoverEnd={handleCardHoverEnd}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Move to sheet (long-press 3.5s on a card) */}
      {moveToJob && (
        <div
          className="fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center sm:items-center bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-200"
          onClick={() => setMoveToJob(null)}
        >
          <div
            className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10 duration-300 sm:slide-in-from-bottom-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <ArrowUpDown className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-gray-900 text-lg">Move to</h3>
                  <p className="text-sm text-gray-500 truncate">{clientDisplayName(moveToJob)} · #{moveToJob.jobNumber}</p>
                </div>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-3 space-y-1">
              {(() => {
                const allowed = getAllowedStatusesForPlan(moveToJob.planType);
                const options = visibleColumns.filter((s) => allowed.includes(s) && s !== moveToJob.status);
                return options.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">No other stages for this plan</p>
                ) : (
                  options.map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => handleMoveToChoice(moveToJob, status)}
                      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl text-left font-medium text-gray-900 hover:bg-orange-50 hover:text-primary transition-colors duration-150"
                    >
                      <span className="flex-1">{STATUS_LABELS[status] || status}</span>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>
                  ))
                );
              })()}
            </div>
            <div className="p-3 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setMoveToJob(null)}
                className="w-full py-3 rounded-xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors duration-150"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedJob && (
        <JobDetailModal
          selectedJob={selectedJob}
          user={user}
          roles={roles}
          loadingJobDetails={loadingJobDetails}
          onClose={handleCloseModal}
          onUpdateJob={handleUpdateJob}
          onMoveJob={handleMoveForModal}
          canMoveAny={canMoveAny}
          movingStatus={movingStatus}
          onFetchNonResolvedIssues={fetchNonResolvedIssues}
          dashboardManagerNames={dashboardManagerNames}
        />
      )}

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowAddModal(false);
          }
        }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add Client Ticket</h2>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-6">
                <div className="flex gap-2 bg-gray-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setAddMode('existing')}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${addMode === 'existing'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    Existing Client
                  </button>
                  <button
                    type="button"
                    onClick={() => setAddMode('new')}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${addMode === 'new'
                      ? 'bg-white text-primary shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                      }`}
                  >
                    New Client
                  </button>
                </div>
              </div>

              {addMode === 'existing' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Select Client
                    </label>
                    {clientsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-primary" />
                      </div>
                    ) : (
                      <select
                        value={selectedClientEmail}
                        onChange={(e) => setSelectedClientEmail(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                      >
                        <option value="">Choose a client...</option>
                        {availableClients.map((client) => (
                          <option key={client.email} value={client.email}>
                            {client.name} ({client.email})
                          </option>
                        ))}
                      </select>
                    )}
                    {!clientsLoading && availableClients.length === 0 && (
                      <p className="text-sm text-gray-500 mt-2">No available clients found. Try creating a new client instead.</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Client Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={newClientEmail}
                      onChange={(e) => setNewClientEmail(e.target.value)}
                      placeholder="client@example.com"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Client Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newClientName}
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Plan Type
                    </label>
                    <select
                      value={newPlanType}
                      onChange={(e) => setNewPlanType(e.target.value)}
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                    >
                      <option value="Professional">Professional</option>
                      <option value="Executive">Executive</option>
                      <option value="Ignite">Ignite</option>
                      <option value="Starter">Starter</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Dashboard Manager Name
                    </label>
                    <input
                      type="text"
                      value={newDashboardManagerName}
                      onChange={(e) => setNewDashboardManagerName(e.target.value)}
                      placeholder="Manager name (optional)"
                      className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Bachelor&apos;s Start Date
                      </label>
                      <input
                        type="date"
                        value={newBachelorsStartDate}
                        onChange={(e) => setNewBachelorsStartDate(e.target.value)}
                        placeholder="YYYY-MM-DD"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white text-gray-900"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Master&apos;s End Date
                      </label>
                      <input
                        type="date"
                        value={newMastersEndDate}
                        onChange={(e) => setNewMastersEndDate(e.target.value)}
                        placeholder="YYYY-MM-DD"
                        className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all bg-white text-gray-900"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddSubmit}
                disabled={addSubmitting || (addMode === 'existing' && !selectedClientEmail) || (addMode === 'new' && (!newClientEmail.trim() || !newClientName.trim()))}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-[#c94a28] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {addSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Ticket'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import All Clients Warning Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowImportModal(false);
          }
        }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-200 bg-orange-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-orange-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Import All Clients</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <p className="text-gray-700 mb-3">
                  This will create onboarding tickets for all clients that don't already have one.
                </p>
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-yellow-900 mb-1">Warning</p>
                      <p className="text-sm text-yellow-800">
                        {(() => {
                          const resumeMakers = roles?.resumeMakers || [];
                          const linkedInMembers = roles?.linkedInMembers || [];
                          const hasResumeMakers = resumeMakers.length > 0;
                          const hasLinkedInMembers = linkedInMembers.length > 0;

                          if (!hasResumeMakers && !hasLinkedInMembers) {
                            return "No Resume Maker or LinkedIn & Cover Letter Optimization users found. Jobs will be created but may not be assigned automatically.";
                          }
                          if (!hasResumeMakers) {
                            return "No Resume Maker users found. Resume jobs may not be assigned automatically.";
                          }
                          if (!hasLinkedInMembers) {
                            return "No LinkedIn & Cover Letter Optimization users found. LinkedIn/Cover Letter jobs may not be assigned automatically.";
                          }
                          return "Make sure you have users assigned to Resume Maker and LinkedIn & Cover Letter Optimization roles.";
                        })()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportAllClients}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-[#c94a28] transition-colors flex items-center gap-2"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Confirmation Modal (when no roles exist) */}
      {showImportConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowImportConfirmModal(false);
          }
        }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-200 bg-red-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-900">Confirm Import</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowImportConfirmModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white transition-colors"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <p className="text-gray-700 mb-3 font-semibold">
                  Are you sure there are no users present?
                </p>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-red-900 mb-1">No Users Found</p>
                      <p className="text-sm text-red-800">
                        No Resume Maker or LinkedIn & Cover Letter Optimization users were found in the system.
                      </p>
                      <p className="text-sm text-red-800 mt-2">
                        Jobs will be created but cannot be automatically assigned. Please add users with these roles before importing, or continue at your own risk.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowImportConfirmModal(false)}
                className="px-5 py-2.5 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportConfirm}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 transition-colors flex items-center gap-2"
              >
                Yes, Continue Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Progress Modal */}
      {importingClients && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 bg-primary/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                <h2 className="text-xl font-bold text-gray-900">Importing Clients</h2>
              </div>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">Progress</span>
                  <span className="text-sm text-gray-500">
                    {importProgress.imported + importProgress.failed} / {importProgress.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                  <div
                    className="bg-primary h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${importProgress.total > 0 ? ((importProgress.imported + importProgress.failed) / importProgress.total) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-green-600 font-medium">✓ {importProgress.imported} imported</span>
                  {importProgress.failed > 0 && (
                    <span className="text-red-600 font-medium">✗ {importProgress.failed} failed</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
