import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import {
  X,
  Loader2,
  Pencil,
  User,
  Briefcase,
  ChevronRight,
  History,
  Paperclip,
  Plus,
  FileText,
  ChevronDown,
  CheckCircle
} from 'lucide-react';
import {
  useOnboardingStore,
  useClientProfileStore,
  STATUS_LABELS,
  ONBOARDING_STATUSES
} from '../../store/onboardingStore';
import { API_BASE, AUTH_HEADERS, LOG } from './constants';
import { getStatusColor, getAllowedStatusesForPlan, clientDisplayName, convertToDMY } from './helpers';
import { toastUtils } from '../../utils/toastUtils';
import { handleAuthFailure } from '../../utils/authUtils';
import { ClientProfileSection } from '../JobDetail/ClientProfileSection';
import CommentsSection from './CommentsSection';
import {
  buildDashboardManagerSelectOptions,
  selectValueMatchingOption
} from '../../utils/dashboardManagerSelect.js';

const JobDetailModal = React.memo(({
  selectedJob,
  user,
  roles,
  loadingJobDetails,
  loadingComments = false,
  onClose,
  onUpdateJob,
  onMoveJob,
  canMoveAny,
  movingStatus,
  onFetchNonResolvedIssues,
  dashboardManagerNames
}) => {
  // Local modal state — completely isolated from the kanban board
  const [showClientProfile, setShowClientProfile] = useState(false);
  const [clientProfileData, setClientProfileData] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [showAttachments, setShowAttachments] = useState(false);
  const [showMoveHistory, setShowMoveHistory] = useState(false);
  const [gmailUsername, setGmailUsername] = useState('');
  const [gmailPassword, setGmailPassword] = useState('');
  const [savingGmailCredentials, setSavingGmailCredentials] = useState(false);
  const [showGmailCredentialsHistory, setShowGmailCredentialsHistory] = useState(false);
  const [isEditingGmailCredentials, setIsEditingGmailCredentials] = useState(false);
  const [showAddAttachmentModal, setShowAddAttachmentModal] = useState(false);
  const [attachmentNameInput, setAttachmentNameInput] = useState('');
  const [attachmentFilePending, setAttachmentFilePending] = useState(null);
  const [expandedAttachmentIndices, setExpandedAttachmentIndices] = useState(new Set());
  const [editingAttachmentIndex, setEditingAttachmentIndex] = useState(null);
  const [editingAttachmentName, setEditingAttachmentName] = useState('');
  const [attachmentReplaceFilePending, setAttachmentReplaceFilePending] = useState(null);
  const [savingAttachmentEdit, setSavingAttachmentEdit] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [assigningCsm, setAssigningCsm] = useState(false);
  const [assigningResumeMaker, setAssigningResumeMaker] = useState(false);
  const [assigningLinkedInMember, setAssigningLinkedInMember] = useState(false);
  const [assigningOperator, setAssigningOperator] = useState(false);
  const [cardAnalysisDate, setCardAnalysisDate] = useState('');
  const [cardJobAnalysis, setCardJobAnalysis] = useState(null);
  const [appliedOnDateCount, setAppliedOnDateCount] = useState(null);
  const [fetchingAppliedOnDate, setFetchingAppliedOnDate] = useState(false);
  const [savingDashboardManager, setSavingDashboardManager] = useState(new Set());
  const [showEditClientNumberModal, setShowEditClientNumberModal] = useState(false);
  const [editingClientNameJobId, setEditingClientNameJobId] = useState(null);
  const [editingClientNameValue, setEditingClientNameValue] = useState('');
  const [savingClientName, setSavingClientName] = useState(false);
  const [editingClientNumberEmail, setEditingClientNumberEmail] = useState(null);
  const [editingClientNumberValue, setEditingClientNumberValue] = useState('');
  const [savingClientNumber, setSavingClientNumber] = useState(false);
  const [operatorManagedUsers, setOperatorManagedUsers] = useState([]);
  const [loadingOperatorManagedUsers, setLoadingOperatorManagedUsers] = useState(false);
  const [operationsForClient, setOperationsForClient] = useState([]);
  const [clientIdForOperations, setClientIdForOperations] = useState(null);
  const [loadingOperationsForClient, setLoadingOperationsForClient] = useState(false);
  const [showAddOperatorModal, setShowAddOperatorModal] = useState(false);
  const [addingOperatorToClient, setAddingOperatorToClient] = useState(false);
  const [removingOperatorFromClient, setRemovingOperatorFromClient] = useState(null);
  const [showAddManagedUserModal, setShowAddManagedUserModal] = useState(false);
  const [availableClientsForOperator, setAvailableClientsForOperator] = useState([]);
  const [loadingAvailableClientsForOperator, setLoadingAvailableClientsForOperator] = useState(false);
  const [addingClientToOperator, setAddingClientToOperator] = useState(false);
  const [removingManagedUser, setRemovingManagedUser] = useState(null);
  const profileFetchRunIdRef = useRef(0);
  const attachmentNameInputRef = useRef(null);
  const previousJobIdRef = useRef(null);

  const isAdmin = user?.role === 'admin';
  const isCsm = user?.role === 'csm' || user?.roles?.includes?.('csm');
  const isTeamLead = user?.role === 'team_lead';
  const canViewOperations = isAdmin || isCsm || isTeamLead;
  const canManageOperations = isAdmin || isCsm || isTeamLead;

  const dashboardManagerSelectOptions = useMemo(
    () =>
      buildDashboardManagerSelectOptions(dashboardManagerNames, [
        selectedJob?.dashboardManagerName,
        ...(selectedJob?.taggedDashboardManagerNames || [])
      ]),
    [dashboardManagerNames, selectedJob?.dashboardManagerName, selectedJob?.taggedDashboardManagerNames]
  );

  // Reset modal sections on job change
  useEffect(() => {
    const currentJobId = selectedJob?._id;
    if (previousJobIdRef.current !== null && previousJobIdRef.current !== currentJobId) {
      setShowClientProfile(false);
      setShowAttachments(false);
      setShowMoveHistory(false);
      setClientProfileData(null);
      setProfileError(null);
      setProfileLoading(false);
      setAppliedOnDateCount(null);
      setCardAnalysisDate('');
      setCardJobAnalysis(null);
    }
    previousJobIdRef.current = currentJobId;
  }, [selectedJob?._id]);

  // Init Gmail credentials
  useEffect(() => {
    if (selectedJob?.gmailCredentials) {
      setGmailUsername(selectedJob.gmailCredentials.username || '');
      setGmailPassword(selectedJob.gmailCredentials.password || '');
      setIsEditingGmailCredentials(false);
    } else {
      setGmailUsername('');
      setGmailPassword('');
      setIsEditingGmailCredentials(true);
    }
  }, [selectedJob?.gmailCredentials]);

  // Fetch operations for client
  const fetchOperationsForClient = useCallback(async (clientEmail) => {
    if (!clientEmail || !canViewOperations) return;
    setLoadingOperationsForClient(true);
    try {
      const res = await fetch(`${API_BASE}/api/operations/by-client/${encodeURIComponent(clientEmail)}`, { headers: AUTH_HEADERS() });
      if (res.ok) {
        const data = await res.json();
        setOperationsForClient(data.operations || []);
        setClientIdForOperations(data.clientId || null);
      } else { setOperationsForClient([]); setClientIdForOperations(null); }
    } catch { setOperationsForClient([]); setClientIdForOperations(null); }
    finally { setLoadingOperationsForClient(false); }
  }, [canViewOperations]);

  useEffect(() => {
    if (selectedJob?.clientEmail && canViewOperations) fetchOperationsForClient(selectedJob.clientEmail);
    else { setOperationsForClient([]); setClientIdForOperations(null); }
  }, [selectedJob?.clientEmail, canViewOperations, fetchOperationsForClient]);

  // Fetch operator managed users
  const fetchOperatorManagedUsers = useCallback(async (operatorEmail) => {
    if (!operatorEmail?.trim()) { setOperatorManagedUsers([]); return; }
    setLoadingOperatorManagedUsers(true);
    try {
      const res = await fetch(`${API_BASE}/api/operations/${encodeURIComponent(operatorEmail.trim())}/managed-users`, { headers: AUTH_HEADERS() });
      if (res.ok) { const data = await res.json(); setOperatorManagedUsers(data.managedUsers || []); }
      else setOperatorManagedUsers([]);
    } catch { setOperatorManagedUsers([]); }
    finally { setLoadingOperatorManagedUsers(false); }
  }, []);

  useEffect(() => {
    if (selectedJob?.operatorEmail) fetchOperatorManagedUsers(selectedJob.operatorEmail);
    else setOperatorManagedUsers([]);
  }, [selectedJob?.operatorEmail, fetchOperatorManagedUsers]);

  // Job analysis for card
  useEffect(() => {
    if (!selectedJob?.clientEmail) { setCardJobAnalysis(null); return; }
    if (!cardAnalysisDate) {
      // Fetch all-time data
      fetch(`${API_BASE}/api/analytics/client-job-analysis`, {
        method: 'POST',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({})
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (!data) return;
        const clientRow = (data.rows || []).find(r => (r.email || '').toLowerCase() === (selectedJob.clientEmail || '').toLowerCase());
        if (clientRow) {
          setCardJobAnalysis({
            saved: clientRow.saved || 0, applied: clientRow.applied || 0,
            interviewing: clientRow.interviewing || 0, offer: clientRow.offer || 0,
            rejected: clientRow.rejected || 0, removed: clientRow.removed || 0,
            lastAppliedOperatorName: clientRow.lastAppliedOperatorName || ''
          });
        } else setCardJobAnalysis(null);
      }).catch(() => setCardJobAnalysis(null));
    } else {
      fetch(`${API_BASE}/api/analytics/client-job-analysis`, {
        method: 'POST',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({ date: convertToDMY(cardAnalysisDate) })
      }).then(r => r.ok ? r.json() : null).then(data => {
        if (!data) return;
        const clientRow = (data.rows || []).find(r => (r.email || '').toLowerCase() === (selectedJob.clientEmail || '').toLowerCase());
        if (clientRow) {
          setCardJobAnalysis({
            saved: clientRow.saved || 0, applied: clientRow.applied || 0,
            interviewing: clientRow.interviewing || 0, offer: clientRow.offer || 0,
            rejected: clientRow.rejected || 0, removed: clientRow.removed || 0,
            lastAppliedOperatorName: clientRow.lastAppliedOperatorName || ''
          });
        } else setCardJobAnalysis(null);
      }).catch(() => setCardJobAnalysis(null));
    }
  }, [selectedJob?.clientEmail, cardAnalysisDate]);

  const findAppliedOnDate = useCallback(async () => {
    if (!cardAnalysisDate) { toastUtils.error('Pick a date first'); return; }
    if (!selectedJob?.clientEmail) { toastUtils.error('No client selected'); return; }
    setFetchingAppliedOnDate(true);
    try {
      const res = await fetch(`${API_BASE}/api/analytics/applied-by-date?t=${Date.now()}`, {
        method: 'POST', headers: AUTH_HEADERS(),
        body: JSON.stringify({ date: convertToDMY(cardAnalysisDate) })
      });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      const count = Number((data.counts || {})[(selectedJob.clientEmail || '').toLowerCase()] || 0);
      setAppliedOnDateCount(count);
      toastUtils.success(`Found ${count} job(s) applied on ${convertToDMY(cardAnalysisDate)}`);
    } catch { toastUtils.error('Failed to fetch applied-on-date'); setAppliedOnDateCount(null); }
    finally { setFetchingAppliedOnDate(false); }
  }, [cardAnalysisDate, selectedJob?.clientEmail]);

  // Profile fetch
  const fetchClientProfile = useCallback((email, jobId) => {
    if (!email) return;
    const emailLower = email.toLowerCase().trim();
    const profileStore = useClientProfileStore.getState();
    const cached = profileStore.getProfile(emailLower);
    if (cached && cached.profile && !profileStore.isStale(emailLower)) {
      setClientProfileData(cached.profile);
      setProfileLoading(false);
      setProfileError(null);
      if (jobId) {
        useOnboardingStore.getState().setJobs((prev) => prev.map((j) => (j._id === jobId ? { ...j, profileComplete: cached.profileComplete } : j)));
        useOnboardingStore.getState().setSelectedJob((prev) => (prev && prev._id === jobId ? { ...prev, profileComplete: cached.profileComplete } : prev));
      }
      return;
    }
    if (cached?.profile) { setClientProfileData(cached.profile); setProfileError(null); }
    setProfileLoading(true);
    const runId = ++profileFetchRunIdRef.current;
    fetch(`${API_BASE}/api/onboarding/client-profile/${encodeURIComponent(emailLower)}`, { headers: AUTH_HEADERS() })
      .then(async (r) => await r.json().catch(() => ({})))
      .then((data) => {
        if (profileFetchRunIdRef.current !== runId) return;
        const rawProfile = data?.userProfile ?? (data && (data.firstName != null || data.email != null) ? data : null);
        const profileObj = rawProfile && typeof rawProfile === 'object' ? rawProfile : null;
        const complete = data?.profileComplete === true;
        if (profileObj) {
          useClientProfileStore.getState().setProfile(emailLower, profileObj, complete);
          setProfileError(null);
          setClientProfileData(profileObj);
          setProfileLoading(false);
        } else {
          useClientProfileStore.getState().setProfileError(emailLower, data?.message || 'Profile not found');
          setProfileError(data?.message || data?.error || 'Profile not found');
          setClientProfileData(null);
          setProfileLoading(false);
        }
      })
      .catch((err) => {
        if (profileFetchRunIdRef.current !== runId) return;
        setProfileError(err?.message || 'Failed to fetch profile');
        setProfileLoading(false);
      });
  }, []);

  const onFetchProfileForSelectedJob = useCallback(() => {
    if (selectedJob?.clientEmail) fetchClientProfile(selectedJob.clientEmail, selectedJob._id);
  }, [selectedJob?.clientEmail, selectedJob?._id, fetchClientProfile]);

  // Operator options
  const operatorOptions = useMemo(() => {
    const list = [...(roles?.operationsInterns || [])];
    const currentEmail = (selectedJob?.operatorEmail || '').toLowerCase().trim();
    if (currentEmail && !list.some((o) => (o.email || '').toLowerCase() === currentEmail)) {
      list.push({ email: selectedJob.operatorEmail, name: selectedJob.operatorName || selectedJob.operatorEmail });
    }
    return list;
  }, [roles?.operationsInterns, selectedJob?.operatorEmail, selectedJob?.operatorName]);

  // Assignment handlers
  const handleAssignCsm = useCallback(async (csmEmail, csmName) => {
    if (!selectedJob) return;
    setAssigningCsm(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, { method: 'PATCH', headers: AUTH_HEADERS(), body: JSON.stringify({ csmEmail, csmName }) });
      if (!res.ok) throw new Error('Failed to assign CSM');
      const data = await res.json();
      onUpdateJob(data.job);
      toastUtils.success('CSM assigned');
    } catch (e) { toastUtils.error(e.message || 'Failed'); }
    finally { setAssigningCsm(false); }
  }, [selectedJob, onUpdateJob]);

  const handleAssignResumeMaker = useCallback(async (email, name) => {
    if (!selectedJob || !isAdmin) return;
    setAssigningResumeMaker(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, { method: 'PATCH', headers: AUTH_HEADERS(), body: JSON.stringify({ resumeMakerEmail: email, resumeMakerName: name }) });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      onUpdateJob(data.job);
      toastUtils.success('Resume Maker assigned');
    } catch (e) { toastUtils.error(e.message || 'Failed'); }
    finally { setAssigningResumeMaker(false); }
  }, [selectedJob, isAdmin, onUpdateJob]);

  const handleAssignLinkedInMember = useCallback(async (email, name) => {
    if (!selectedJob || !isAdmin) return;
    setAssigningLinkedInMember(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, { method: 'PATCH', headers: AUTH_HEADERS(), body: JSON.stringify({ linkedInMemberEmail: email, linkedInMemberName: name }) });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      onUpdateJob(data.job);
      toastUtils.success('LinkedIn member assigned');
    } catch (e) { toastUtils.error(e.message || 'Failed'); }
    finally { setAssigningLinkedInMember(false); }
  }, [selectedJob, isAdmin, onUpdateJob]);

  const handleAssignOperator = useCallback(async (email, name) => {
    if (!selectedJob || !isAdmin) return;
    setAssigningOperator(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, { method: 'PATCH', headers: AUTH_HEADERS(), body: JSON.stringify({ operatorEmail: email || '', operatorName: name || '' }) });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      onUpdateJob(data.job);
      setOperatorManagedUsers([]);
      if (selectedJob.clientEmail && canViewOperations) fetchOperationsForClient(selectedJob.clientEmail);
      toastUtils.success('Operations Intern assigned');
    } catch (e) { toastUtils.error(e.message || 'Failed'); }
    finally { setAssigningOperator(false); }
  }, [selectedJob, isAdmin, onUpdateJob, canViewOperations, fetchOperationsForClient]);

  // Attachment handlers
  const getNextDefaultAttachmentName = useCallback((job) => {
    const planLower = (job?.planType || '').toLowerCase();
    const isExec = planLower === 'executive' || planLower.includes('executive');
    const defaults = isExec ? ['Resume', 'Cover letter', 'Portfolio (link)'] : (planLower === 'professional' ? ['Resume', 'Cover letter'] : ['Resume']);
    const names = (job?.attachments || []).map((a) => (a.name || '').trim());
    const hasMatch = (d) => names.some((n) => n.toLowerCase() === d.toLowerCase());
    return defaults.find((d) => !hasMatch(d)) || '';
  }, []);

  const handleUploadAttachment = useCallback(async () => {
    const name = attachmentNameInput.trim() || attachmentFilePending?.name || 'Attachment';
    if (!attachmentFilePending || !selectedJob) { toastUtils.error('Please select a file'); return; }
    const base = (API_BASE || '').replace(/\/$/, '');
    if (!base) { toastUtils.error('API URL not configured.'); return; }
    setUploadingAttachment(true);
    try {
      const form = new FormData();
      form.append('file', attachmentFilePending);
      const uploadRes = await fetch(`${base}/api/upload/onboarding-attachment`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('authToken') || ''}` }, body: form });
      const uploadData = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) throw new Error(uploadData.message || 'Upload failed');
      const url = uploadData.url;
      if (!url) throw new Error('Server did not return file URL');
      const res = await fetch(`${base}/api/onboarding/jobs/${selectedJob._id}/attachments`, { method: 'POST', headers: AUTH_HEADERS(), body: JSON.stringify({ url, filename: uploadData.filename || attachmentFilePending.name, name }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      const attachment = data.attachment || { url, filename: uploadData.filename || attachmentFilePending.name, name };
      const updated = { ...selectedJob, attachments: [...(selectedJob.attachments || []), attachment] };
      onUpdateJob(updated);
      setShowAddAttachmentModal(false);
      setAttachmentNameInput('');
      setAttachmentFilePending(null);
      toastUtils.success('Attachment uploaded');
    } catch (err) { toastUtils.error(err?.message || 'Upload failed'); }
    finally { setUploadingAttachment(false); }
  }, [attachmentNameInput, attachmentFilePending, selectedJob, onUpdateJob]);

  const saveAttachmentEdit = useCallback(async () => {
    if (editingAttachmentIndex == null || !selectedJob?._id) return;
    setSavingAttachmentEdit(true);
    try {
      const base = (API_BASE || '').replace(/\/$/, '');
      let url = selectedJob.attachments?.[editingAttachmentIndex]?.url;
      let filename = selectedJob.attachments?.[editingAttachmentIndex]?.filename;
      if (attachmentReplaceFilePending) {
        const formData = new FormData();
        formData.append('file', attachmentReplaceFilePending);
        const uploadRes = await fetch(`${base}/api/upload/onboarding-attachment`, { method: 'POST', headers: { Authorization: `Bearer ${localStorage.getItem('authToken') || ''}` }, body: formData });
        const uploadData = await uploadRes.json().catch(() => ({}));
        if (!uploadRes.ok || !uploadData?.url) throw new Error(uploadData?.message || 'Upload failed');
        url = uploadData.url;
        filename = uploadData.filename || attachmentReplaceFilePending.name;
      }
      const payload = { name: editingAttachmentName.trim() || filename };
      if (url) payload.url = url;
      if (filename) payload.filename = filename;
      const res = await fetch(`${base}/api/onboarding/jobs/${selectedJob._id}/attachments/${editingAttachmentIndex}`, { method: 'PATCH', headers: AUTH_HEADERS(), body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      const updated = data.job || (() => { const u = { ...selectedJob, attachments: [...(selectedJob.attachments || [])] }; u.attachments[editingAttachmentIndex] = { ...u.attachments[editingAttachmentIndex], ...payload }; return u; })();
      onUpdateJob(updated);
      setEditingAttachmentIndex(null);
      setEditingAttachmentName('');
      setAttachmentReplaceFilePending(null);
      toastUtils.success('Attachment updated');
    } catch (e) { toastUtils.error(e?.message || 'Failed'); }
    finally { setSavingAttachmentEdit(false); }
  }, [editingAttachmentIndex, editingAttachmentName, attachmentReplaceFilePending, selectedJob, onUpdateJob]);

  // Gmail save
  const handleSaveGmailCredentials = useCallback(async () => {
    if (!selectedJob?._id || savingGmailCredentials) return;
    if (!gmailUsername.trim() || !gmailPassword.trim()) { toastUtils.error('Please enter both username and password'); return; }
    setSavingGmailCredentials(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, { method: 'PATCH', headers: AUTH_HEADERS(), body: JSON.stringify({ gmailCredentials: { username: gmailUsername.trim(), password: gmailPassword.trim() } }) });
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      onUpdateJob(data.job);
      toastUtils.success('Gmail credentials saved');
      setIsEditingGmailCredentials(false);
      if (data.job.gmailCredentials) { setGmailUsername(data.job.gmailCredentials.username || ''); setGmailPassword(data.job.gmailCredentials.password || ''); }
    } catch (e) { toastUtils.error(e.message || 'Failed'); }
    finally { setSavingGmailCredentials(false); }
  }, [selectedJob, gmailUsername, gmailPassword, savingGmailCredentials, onUpdateJob]);

  // Client name + number save
  const saveClientName = useCallback(async (jobId, newName) => {
    const trimmed = (newName || '').trim();
    if (!trimmed || savingClientName) return;
    setSavingClientName(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${jobId}`, { method: 'PATCH', headers: AUTH_HEADERS(), body: JSON.stringify({ clientName: trimmed }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      onUpdateJob(data.job);
      setEditingClientNameJobId(null);
      setEditingClientNameValue('');
      toastUtils.success('Name updated');
    } catch (e) { toastUtils.error(e.message || 'Failed'); }
    finally { setSavingClientName(false); }
  }, [savingClientName, onUpdateJob]);

  const handleSaveClientNumber = useCallback(async (clientEmail, valueOverride) => {
    if (!clientEmail || !isAdmin) return;
    const val = String((valueOverride ?? editingClientNumberValue) || '').trim();
    const finalNumber = val ? parseInt(val, 10) : null;
    setSavingClientNumber(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients/${encodeURIComponent(clientEmail)}/client-number`, { method: 'PATCH', headers: AUTH_HEADERS(), body: JSON.stringify({ clientNumber: finalNumber }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      toastUtils.success('Client number updated');
      setEditingClientNumberEmail(null);
      setEditingClientNumberValue('');
      setShowEditClientNumberModal(false);
      // Update job in UI so title/display reflects new or cleared number (backend already synced to OnboardingJob)
      if (selectedJob && (selectedJob.clientEmail || '').toLowerCase() === (clientEmail || '').toLowerCase()) {
        onUpdateJob({ ...selectedJob, clientNumber: finalNumber });
      }
    } catch (e) { toastUtils.error(e.message || 'Failed'); }
    finally { setSavingClientNumber(false); }
  }, [editingClientNumberValue, isAdmin, selectedJob, onUpdateJob]);

  // Operator management
  const handleAddOperatorToClient = useCallback(async (operatorEmail) => {
    const clientEmail = selectedJob?.clientEmail;
    if (!clientEmail || !operatorEmail) return;
    setAddingOperatorToClient(true);
    try {
      const res = await fetch(`${API_BASE}/api/operations/assign-client`, { method: 'POST', headers: AUTH_HEADERS(), body: JSON.stringify({ clientEmail, operatorEmail }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || 'Failed'); }
      toastUtils.success('Operations intern added');
      setShowAddOperatorModal(false);
      fetchOperationsForClient(clientEmail);
    } catch (e) { toastUtils.error(e.message || 'Failed'); }
    finally { setAddingOperatorToClient(false); }
  }, [selectedJob?.clientEmail, fetchOperationsForClient]);

  const handleRemoveOperatorFromClient = useCallback(async (operatorEmail) => {
    const clientEmail = selectedJob?.clientEmail;
    if (!clientEmail || !operatorEmail || !clientIdForOperations) return;
    setRemovingOperatorFromClient(operatorEmail);
    try {
      const res = await fetch(`${API_BASE}/api/operations/${encodeURIComponent(operatorEmail.trim())}/managed-users/${encodeURIComponent(clientIdForOperations)}`, { method: 'DELETE', headers: AUTH_HEADERS() });
      if (!res.ok) throw new Error('Failed');
      toastUtils.success('Operations intern removed');
      fetchOperationsForClient(clientEmail);
      if (selectedJob?.operatorEmail?.toLowerCase() === operatorEmail.toLowerCase()) {
        const res2 = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, { method: 'PATCH', headers: AUTH_HEADERS(), body: JSON.stringify({ operatorEmail: '', operatorName: '' }) });
        if (res2.ok) { const data = await res2.json(); onUpdateJob(data.job); }
      }
    } catch (e) { toastUtils.error(e.message || 'Failed'); }
    finally { setRemovingOperatorFromClient(null); }
  }, [selectedJob, clientIdForOperations, fetchOperationsForClient, onUpdateJob]);

  const handleAssignClientToOperator = useCallback(async (clientEmail) => {
    const operatorEmail = selectedJob?.operatorEmail;
    if (!operatorEmail || !clientEmail) return;
    setAddingClientToOperator(true);
    try {
      const res = await fetch(`${API_BASE}/api/operations/assign-client`, { method: 'POST', headers: AUTH_HEADERS(), body: JSON.stringify({ clientEmail, operatorEmail }) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || 'Failed'); }
      toastUtils.success('Client added');
      setShowAddManagedUserModal(false);
      fetchOperatorManagedUsers(operatorEmail);
    } catch (e) { toastUtils.error(e.message || 'Failed'); }
    finally { setAddingClientToOperator(false); }
  }, [selectedJob?.operatorEmail, fetchOperatorManagedUsers]);

  const handleRemoveManagedUser = useCallback(async (userID) => {
    const operatorEmail = selectedJob?.operatorEmail;
    if (!operatorEmail || !userID) return;
    setRemovingManagedUser(userID);
    try {
      const res = await fetch(`${API_BASE}/api/operations/${encodeURIComponent(operatorEmail.trim())}/managed-users/${encodeURIComponent(userID)}`, { method: 'DELETE', headers: AUTH_HEADERS() });
      if (!res.ok) throw new Error('Failed');
      toastUtils.success('User removed');
      fetchOperatorManagedUsers(operatorEmail);
    } catch (e) { toastUtils.error(e.message || 'Failed'); }
    finally { setRemovingManagedUser(null); }
  }, [selectedJob?.operatorEmail, fetchOperatorManagedUsers]);

  const openAddManagedUserModal = useCallback(async () => {
    const email = selectedJob?.operatorEmail;
    if (!email) return;
    setShowAddManagedUserModal(true);
    setAvailableClientsForOperator([]);
    setLoadingAvailableClientsForOperator(true);
    try {
      const res = await fetch(`${API_BASE}/api/operations/${encodeURIComponent(email.trim())}/available-clients`, { headers: AUTH_HEADERS() });
      if (res.ok) { const data = await res.json(); setAvailableClientsForOperator(data.availableClients || []); }
    } catch { setAvailableClientsForOperator([]); }
    finally { setLoadingAvailableClientsForOperator(false); }
  }, [selectedJob?.operatorEmail]);

  const handleCloseModal = useCallback((e) => {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    setClientProfileData(null);
    setShowClientProfile(false);
    setEditingClientNameJobId(null);
    setEditingClientNameValue('');
    setCardAnalysisDate('');
    setCardJobAnalysis(null);
    setGmailUsername('');
    setGmailPassword('');
    setShowGmailCredentialsHistory(false);
    setIsEditingGmailCredentials(false);
    onClose();
  }, [onClose]);

  if (!selectedJob) return null;

  return (
    <div
      key={selectedJob._id}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) handleCloseModal(e); }}
    >
      <div
        className="bg-[#FAFAFA] rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-white/20"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {loadingJobDetails && (
          <div className="h-0.5 w-full bg-orange-100 overflow-hidden">
            <div className="h-full bg-primary w-2/5" style={{ animation: 'slideRight 1s ease-in-out infinite' }} />
          </div>
        )}
        {/* Modal Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between sticky top-0 z-10">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-900">{clientDisplayName(selectedJob)}</h2>
                {isAdmin && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); setEditingClientNameJobId(selectedJob._id); setEditingClientNameValue(selectedJob.clientName || ''); setEditingClientNumberEmail(selectedJob.clientEmail); setEditingClientNumberValue(String(selectedJob.clientNumber ?? '')); setShowEditClientNumberModal(true); }} className="p-1.5 text-gray-400 hover:text-primary hover:bg-primary/5 rounded" title="Edit client details">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
              </div>
              <span className="text-sm font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-md border border-gray-200">#{selectedJob.jobNumber}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedJob.status)}`}>
                {STATUS_LABELS[selectedJob.status]}
              </span>
              <span className="text-gray-300 text-sm">|</span>
              <span className="text-sm text-gray-500">{selectedJob.planType || 'Professional'} Plan</span>
            </div>
          </div>
          <button onClick={handleCloseModal} className="p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer z-20 relative" type="button" aria-label="Close modal">
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
                    <select value={selectedJob.csmEmail || ''} onChange={(e) => { const opt = roles.csms?.find((c) => c.email === e.target.value); handleAssignCsm(opt?.email || '', opt?.name || ''); }} disabled={assigningCsm} className="w-full text-sm border-gray-200 rounded-lg focus:ring-primary focus:border-primary bg-white">
                      <option value="">Select CSM...</option>
                      {(roles.csms || []).map((c) => (<option key={c.email} value={c.email}>{c.name || c.email}</option>))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1.5">Resume Maker</label>
                    {isAdmin ? (
                      <select value={selectedJob.resumeMakerEmail || ''} onChange={(e) => { const opt = roles.resumeMakers?.find((r) => r.email === e.target.value); handleAssignResumeMaker(opt?.email || '', opt?.name || ''); }} disabled={assigningResumeMaker} className="w-full text-sm border-gray-200 rounded-lg focus:ring-primary focus:border-primary bg-white">
                        <option value="">Select Resume Maker...</option>
                        {(roles.resumeMakers || []).map((r) => (<option key={r.email} value={r.email}>{r.name || r.email}</option>))}
                      </select>
                    ) : (
                      <div className="p-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 font-medium">{selectedJob.resumeMakerName || 'Unassigned'}</div>
                    )}
                  </div>
                  {canViewOperations && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">Operations Intern</label>
                      {canManageOperations ? (
                        <select value={selectedJob.operatorEmail || ''} onChange={(e) => { const val = e.target.value; if (val === '') { handleAssignOperator('', ''); return; } const opt = operatorOptions.find((o) => (o.email || '').toLowerCase() === val.toLowerCase()); handleAssignOperator(opt?.email ?? val, opt?.name ?? val); }} disabled={assigningOperator} className="w-full text-sm border-gray-200 rounded-lg focus:ring-primary focus:border-primary bg-white">
                          <option value="">— Unassigned —</option>
                          {operatorOptions.map((o) => (<option key={(o.email || '').toLowerCase()} value={o.email}>{o.name || o.email}</option>))}
                        </select>
                      ) : (
                        <div className="p-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 font-medium">{selectedJob.operatorName || selectedJob.operatorEmail || 'Unassigned'}</div>
                      )}
                      {/* Operations managing this client */}
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Operations managing this client</span>
                          {canManageOperations && (<button type="button" onClick={() => setShowAddOperatorModal(true)} className="text-xs font-medium text-primary hover:text-primary/80">+ Add operations intern</button>)}
                        </div>
                        {loadingOperationsForClient ? (<p className="text-xs text-gray-500">Loading...</p>) : operationsForClient.length === 0 ? (<p className="text-xs text-gray-500">No operations assigned yet.</p>) : (
                          <ul className="space-y-1.5 max-h-32 overflow-y-auto rounded-lg border border-gray-100 bg-white p-2">
                            {operationsForClient.map((o) => (
                              <li key={(o.email || '').toLowerCase()} className="flex items-center justify-between gap-2 text-sm">
                                <span className="truncate text-gray-800" title={o.email}>{o.name || o.email}</span>
                                {canManageOperations && (<button type="button" onClick={() => handleRemoveOperatorFromClient(o.email)} disabled={removingOperatorFromClient === o.email} className="text-red-500 hover:text-red-700 text-xs disabled:opacity-50 shrink-0">{removingOperatorFromClient === o.email ? '…' : 'Remove'}</button>)}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                      {selectedJob.operatorEmail && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Users managed by primary operator</span>
                            {canManageOperations && (<button type="button" onClick={openAddManagedUserModal} className="text-xs font-medium text-primary hover:text-primary/80">+ Add new user</button>)}
                          </div>
                          {loadingOperatorManagedUsers ? (<p className="text-xs text-gray-500">Loading...</p>) : operatorManagedUsers.length === 0 ? (<p className="text-xs text-gray-500">No users assigned yet.</p>) : (
                            <ul className="space-y-1.5 max-h-32 overflow-y-auto rounded-lg border border-gray-100 bg-white p-2">
                              {operatorManagedUsers.map((u) => (
                                <li key={u.userID} className="flex items-center justify-between gap-2 text-sm">
                                  <span className="truncate text-gray-800" title={u.email}>{u.name || u.email}</span>
                                  {canManageOperations && (<button type="button" onClick={() => handleRemoveManagedUser(u.userID)} disabled={removingManagedUser === u.userID} className="text-red-500 hover:text-red-700 text-xs disabled:opacity-50 shrink-0">{removingManagedUser === u.userID ? '…' : 'Remove'}</button>)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  {(selectedJob.linkedInPhaseStarted || selectedJob.status === 'linkedin_in_progress' || selectedJob.status === 'linkedin_done') && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1.5">LinkedIn Member</label>
                      {isAdmin ? (
                        <select value={selectedJob.linkedInMemberEmail || ''} onChange={(e) => { const opt = roles.linkedInMembers?.find((l) => l.email === e.target.value); handleAssignLinkedInMember(opt?.email || '', opt?.name || ''); }} disabled={assigningLinkedInMember} className="w-full text-sm border-gray-200 rounded-lg focus:ring-primary focus:border-primary bg-white">
                          <option value="">Select LinkedIn Member...</option>
                          {(roles.linkedInMembers || []).map((l) => (<option key={l.email} value={l.email}>{l.name || l.email}</option>))}
                        </select>
                      ) : (<div className="p-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 font-medium">{selectedJob.linkedInMemberName || 'Unassigned'}</div>)}
                    </div>
                  )}
                </div>
              </div>

              {/* Client Info Section */}
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Briefcase className="w-3 h-3" /> Info</h3>
                <div className="space-y-4">
                  <div>
                    <span className="block text-xs font-semibold text-gray-700 mb-1">Dashboard Manager</span>
                    {isAdmin ? (
                      <select value={selectValueMatchingOption(selectedJob.dashboardManagerName, dashboardManagerSelectOptions)} onChange={async (e) => {
                        const val = e.target.value;
                        if (!selectedJob?._id || savingDashboardManager.has(selectedJob._id)) return;
                        setSavingDashboardManager((s) => new Set(s).add(selectedJob._id));
                        try {
                          const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, { method: 'PATCH', headers: AUTH_HEADERS(), body: JSON.stringify({ dashboardManagerName: val }) });
                          if (!res.ok) throw new Error('Failed');
                          const data = await res.json();
                          onUpdateJob(data.job);
                          toastUtils.success('Dashboard Manager updated');
                        } catch (err) { toastUtils.error(err.message || 'Failed'); }
                        finally { setSavingDashboardManager((s) => { const n = new Set(s); n.delete(selectedJob._id); return n; }); }
                      }} disabled={savingDashboardManager.has(selectedJob._id)} className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white disabled:opacity-50">
                        <option value="">Not assigned</option>
                        {dashboardManagerSelectOptions.map((name) => (<option key={name} value={name}>{name}</option>))}
                      </select>
                    ) : (<span className="text-sm text-gray-900 font-medium">{selectedJob.dashboardManagerName || '—'}</span>)}
                  </div>
                  {canManageOperations && (
                    <div>
                      <span className="block text-xs font-semibold text-gray-700 mb-1">Also visible to (tagged managers)</span>
                      <div className="flex flex-wrap gap-2 items-center">
                        {(selectedJob.taggedDashboardManagerNames || []).filter((n) => n && n !== (selectedJob.dashboardManagerName || '').trim()).map((name) => (
                          <span key={name} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium">
                            {name}
                            <button type="button" onClick={async () => {
                              if (!selectedJob?._id || savingDashboardManager.has(selectedJob._id)) return;
                              const next = (selectedJob.taggedDashboardManagerNames || []).filter((n) => n !== name);
                              setSavingDashboardManager((s) => new Set(s).add(selectedJob._id));
                              try {
                                const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, { method: 'PATCH', headers: AUTH_HEADERS(), body: JSON.stringify({ taggedDashboardManagerNames: next }) });
                                if (!res.ok) throw new Error('Failed');
                                const data = await res.json();
                                onUpdateJob(data.job);
                                toastUtils.success('Manager removed from visibility');
                              } catch (err) { toastUtils.error(err.message || 'Failed'); }
                              finally { setSavingDashboardManager((s) => { const n = new Set(s); n.delete(selectedJob._id); return n; }); }
                            }} className="p-0.5 rounded hover:bg-primary/20 text-primary" aria-label={`Remove ${name}`}>×</button>
                          </span>
                        ))}
                        <select
                          value=""
                          onChange={async (e) => {
                            const addName = e.target.value;
                            if (!addName || !selectedJob?._id || savingDashboardManager.has(selectedJob._id)) return;
                            e.target.value = '';
                            const current = selectedJob.taggedDashboardManagerNames || [];
                            const primary = (selectedJob.dashboardManagerName || '').trim();
                            if (current.includes(addName) || addName === primary) return;
                            const next = [...current, addName];
                            setSavingDashboardManager((s) => new Set(s).add(selectedJob._id));
                            try {
                              const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, { method: 'PATCH', headers: AUTH_HEADERS(), body: JSON.stringify({ taggedDashboardManagerNames: next }) });
                              if (!res.ok) throw new Error('Failed');
                              const data = await res.json();
                              onUpdateJob(data.job);
                              toastUtils.success('Manager added to visibility');
                            } catch (err) { toastUtils.error(err.message || 'Failed'); }
                            finally { setSavingDashboardManager((s) => { const n = new Set(s); n.delete(selectedJob._id); return n; }); }
                          }}
                          className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50"
                          disabled={savingDashboardManager.has(selectedJob._id)}
                        >
                          <option value="">+ Add visibility for...</option>
                          {dashboardManagerNames.filter((n) => n && n !== (selectedJob.dashboardManagerName || '').trim() && !(selectedJob.taggedDashboardManagerNames || []).includes(n)).map((name) => (
                            <option key={name} value={name}>{name}</option>
                          ))}
                        </select>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1">Tagged managers will also see this ticket in their view.</p>
                    </div>
                  )}
                  <div>
                    <span className="block text-xs font-semibold text-gray-700 mb-1">Assigned Email</span>
                    <span className="text-sm text-gray-900 font-mono bg-white px-2 py-1 rounded border border-gray-200">{selectedJob.clientEmail}</span>
                  </div>
                </div>
              </div>

              {/* Gmail Credentials */}
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Briefcase className="w-3 h-3" /> Gmail Credentials</h3>
                <div className="space-y-4">
                  {selectedJob?.gmailCredentials && !isEditingGmailCredentials ? (
                    <>
                      <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Username</label><div className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-800 font-mono">{selectedJob.gmailCredentials.username || '—'}</div></div>
                      <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Password</label><div className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg text-gray-800 font-mono">{selectedJob.gmailCredentials.password || '—'}</div></div>
                      <button type="button" onClick={() => { setIsEditingGmailCredentials(true); setGmailUsername(selectedJob.gmailCredentials?.username || ''); setGmailPassword(selectedJob.gmailCredentials?.password || ''); }} className="w-full px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium flex items-center justify-center gap-2"><Pencil className="w-3.5 h-3.5" /> Change Credentials</button>
                    </>
                  ) : (
                    <>
                      <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Username</label><input type="text" value={gmailUsername} onChange={(e) => setGmailUsername(e.target.value)} placeholder="Enter Gmail username" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white" /></div>
                      <div><label className="block text-xs font-semibold text-gray-700 mb-1.5">Password</label><input type="text" value={gmailPassword} onChange={(e) => setGmailPassword(e.target.value)} placeholder="Enter Gmail password" className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white" /></div>
                      <div className="flex gap-2">
                        <button type="button" onClick={handleSaveGmailCredentials} disabled={savingGmailCredentials} className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 text-sm font-medium">{savingGmailCredentials ? 'Saving...' : 'Save Credentials'}</button>
                        {selectedJob?.gmailCredentials && (<button type="button" onClick={() => { setIsEditingGmailCredentials(false); setGmailUsername(selectedJob.gmailCredentials?.username || ''); setGmailPassword(selectedJob.gmailCredentials?.password || ''); }} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm font-medium">Cancel</button>)}
                      </div>
                    </>
                  )}
                  {(selectedJob.gmailCredentialsHistory || []).length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <button type="button" onClick={() => setShowGmailCredentialsHistory(!showGmailCredentialsHistory)} className="w-full flex items-center justify-between text-xs font-semibold text-gray-700 hover:text-gray-900 transition-colors">
                        <span>Credentials History ({(selectedJob.gmailCredentialsHistory || []).length})</span>
                        <ChevronRight className={`w-4 h-4 transition-transform ${showGmailCredentialsHistory ? 'rotate-90' : ''}`} />
                      </button>
                      {showGmailCredentialsHistory && (
                        <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
                          {(selectedJob.gmailCredentialsHistory || []).slice().reverse().map((h, idx) => (
                            <div key={idx} className="bg-white rounded-lg p-3 border border-gray-200">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] text-gray-500">Updated by: {h.updatedBy || 'Unknown'}</span>
                                <span className="text-[10px] text-gray-500">{new Date(h.updatedAt).toLocaleDateString()} {new Date(h.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              </div>
                              <div className="space-y-1.5">
                                <div><span className="text-[10px] text-gray-500 font-medium">Username:</span><div className="text-xs text-gray-700 font-mono bg-gray-50 px-2 py-1 rounded mt-0.5">{h.username || '—'}</div></div>
                                <div><span className="text-[10px] text-gray-500 font-medium">Password:</span><div className="text-xs text-gray-700 font-mono bg-gray-50 px-2 py-1 rounded mt-0.5">{h.password || '—'}</div></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Job Analysis */}
              {(selectedJob.status === 'applications_in_progress' || selectedJob.status === 'completed') && (
                <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                  <h3 className="text-xs font-extrabold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2"><Briefcase className="w-3 h-3" /> Job Analysis</h3>
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-700 mb-2">Filter by Date:</label>
                    <div className="flex items-center gap-2">
                      <input type="date" value={cardAnalysisDate} onChange={(e) => { setCardAnalysisDate(e.target.value); setAppliedOnDateCount(null); }} className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary bg-white" />
                      {cardAnalysisDate && (<><button type="button" onClick={findAppliedOnDate} disabled={fetchingAppliedOnDate} className="px-3 py-2 text-xs bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium">{fetchingAppliedOnDate ? 'Loading...' : 'Find Applied'}</button><button type="button" onClick={() => { setCardAnalysisDate(''); setAppliedOnDateCount(null); }} className="px-3 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200">Clear</button></>)}
                    </div>
                    {cardAnalysisDate && appliedOnDateCount !== null && (<div className="mt-2 text-xs text-gray-600"><span className="font-semibold text-indigo-700">Applied on {convertToDMY(cardAnalysisDate)}: {appliedOnDateCount} job(s)</span></div>)}
                  </div>
                  {cardJobAnalysis ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2">
                        {[['Saved', cardJobAnalysis.saved, 'text-gray-700'], ['Applied', cardJobAnalysis.applied, 'text-green-600'], ['Interview', cardJobAnalysis.interviewing, 'text-yellow-600'], ['Offer', cardJobAnalysis.offer, 'text-purple-600'], ['Rejected', cardJobAnalysis.rejected, 'text-red-600'], ['Removed', cardJobAnalysis.removed, 'text-gray-600']].map(([label, val, color]) => (
                          <div key={label} className="text-center bg-white rounded-lg p-2 border border-gray-200">
                            <div className="text-[10px] text-gray-500 font-medium mb-1">{label}</div>
                            <div className={`text-sm font-semibold ${color}`}>{val || 0}</div>
                          </div>
                        ))}
                      </div>
                      {appliedOnDateCount !== null && cardAnalysisDate && (
                        <div className="bg-indigo-50 rounded-lg p-3 border border-indigo-200">
                          <div className="text-[10px] text-indigo-600 font-medium mb-1">Applied on {convertToDMY(cardAnalysisDate)}</div>
                          <div className="text-lg font-bold text-indigo-700">{appliedOnDateCount} job(s)</div>
                        </div>
                      )}
                      {cardJobAnalysis.lastAppliedOperatorName && (
                        <div className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="text-[10px] text-gray-500 font-medium mb-1">Last applied by</div>
                          <div className="text-sm font-semibold text-gray-700">{cardJobAnalysis.lastAppliedOperatorName.charAt(0).toUpperCase() + cardJobAnalysis.lastAppliedOperatorName.slice(1).toLowerCase()}</div>
                        </div>
                      )}
                    </div>
                  ) : (<div className="text-sm text-gray-500 py-4 text-center">No data available</div>)}
                </div>
              )}
            </div>

            {/* Client Profile */}
            <ClientProfileSection expanded={showClientProfile} onToggle={setShowClientProfile} profileData={clientProfileData} loading={profileLoading} error={profileError} hasClientEmail={!!selectedJob?.clientEmail} onFetchProfile={onFetchProfileForSelectedJob} />

            {/* Attachments */}
            <div className="mb-6">
              <button onClick={() => setShowAttachments(!showAttachments)} className="w-full flex items-center justify-between py-3 px-4 text-left rounded-xl border border-slate-200 bg-slate-50/80 hover:bg-slate-100/80 hover:border-slate-300 transition-colors shadow-sm">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 flex-1 min-w-0">
                  <Paperclip className="w-4 h-4 text-slate-500 flex-shrink-0" /><span className="flex-1 min-w-0">Attachments</span>
                  {(selectedJob.attachments || []).length > 0 && (<span className="text-xs text-gray-500 bg-slate-200 px-2 py-0.5 rounded-full flex-shrink-0">{(selectedJob.attachments || []).length}</span>)}
                </h3>
                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ml-2 ${showAttachments ? 'rotate-90' : ''}`} />
              </button>
              {showAttachments && (
                <>
                  <div className="mb-3 p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <p className="text-xs font-semibold text-slate-600 mb-2">By plan</p>
                    <ul className="space-y-1.5 text-sm">
                      {(() => {
                        const planLower = (selectedJob?.planType || '').toLowerCase();
                        const isExecutive = planLower === 'executive' || planLower.includes('executive');
                        const types = isExecutive ? ['Resume', 'Cover letter', 'Portfolio (link)'] : (planLower === 'professional' ? ['Resume', 'Cover letter'] : ['Resume']);
                        const names = (selectedJob?.attachments || []).map((a) => (a.name || '').trim());
                        const has = (label) => names.some((n) => n.toLowerCase() === label.toLowerCase());
                        return types.map((label) => (
                          <li key={label}>
                            <button type="button" onClick={() => { setAttachmentNameInput(label); setAttachmentFilePending(null); setShowAddAttachmentModal(true); }} className="flex items-center gap-2 w-full text-left rounded px-1 py-0.5 -mx-1 hover:bg-slate-100/80 transition-colors">
                              {has(label) ? <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" /> : <span className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />}
                              <span className={has(label) ? 'text-slate-800 font-medium' : 'text-slate-500'}>{label}</span>
                            </button>
                          </li>
                        ));
                      })()}
                    </ul>
                  </div>
                  <div className="space-y-1 mb-3">
                    {(selectedJob.attachments || []).length === 0 && <p className="text-sm text-gray-500 py-4">No attachments yet</p>}
                    {(selectedJob.attachments || []).map((a, i) => {
                      const isExpanded = expandedAttachmentIndices.has(i);
                      const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(a.filename || a.url);
                      const isPdf = /\.pdf$/i.test(a.filename || a.url);
                      const isDoc = /\.(doc|docx)$/i.test(a.filename || a.url);
                      const displayName = (a.name && a.name.trim()) || a.filename || 'Attachment';
                      return (
                        <div key={i} className="border border-gray-200 rounded-lg overflow-hidden bg-white">
                          <div className="w-full flex items-center gap-2 px-4 py-2.5">
                            <button type="button" onClick={(e) => { e.stopPropagation(); setExpandedAttachmentIndices((prev) => { const next = new Set(prev); if (next.has(i)) next.delete(i); else next.add(i); return next; }); }} className="p-0.5 text-gray-500 hover:text-gray-700 flex-shrink-0">
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                            <button type="button" onClick={() => { setEditingAttachmentIndex(i); setEditingAttachmentName((a.name && String(a.name).trim()) || a.filename || ''); setAttachmentReplaceFilePending(null); }} className="flex-1 flex items-center gap-2 text-left hover:bg-gray-50/80 transition-colors rounded py-0.5 -my-0.5 px-1 -mx-1 min-w-0">
                              <Paperclip className="w-4 h-4 text-gray-400 flex-shrink-0" /><span className="text-sm font-medium text-gray-900 truncate flex-1">{displayName}</span>
                            </button>
                          </div>
                          {isExpanded && (
                            <div className="border-t border-gray-100 p-3 bg-gray-50/50">
                              {isImage ? (
                                <a href={a.url} target="_blank" rel="noopener noreferrer" className="block"><img src={a.url} alt={displayName} className="max-h-48 rounded-lg object-contain" /><p className="text-xs text-gray-500 mt-1">Click to view full size</p></a>
                              ) : (
                                <a href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-2 rounded-lg hover:bg-white transition-colors">
                                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center border border-gray-100 flex-shrink-0">
                                    <FileText className={`w-5 h-5 ${isPdf ? 'text-red-500' : isDoc ? 'text-blue-500' : 'text-gray-400'}`} />
                                  </div>
                                  <div className="min-w-0 flex-1"><p className="text-sm font-medium text-gray-900 truncate">{a.filename}</p><p className="text-xs text-gray-500">{isPdf ? 'PDF' : isDoc ? 'Word' : 'Click to view'}</p></div>
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => { setAttachmentNameInput(getNextDefaultAttachmentName(selectedJob)); setAttachmentFilePending(null); setShowAddAttachmentModal(true); }} disabled={uploadingAttachment} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-50 text-gray-700 rounded-lg border border-gray-200 hover:bg-white hover:border-gray-300 transition-all cursor-pointer text-sm font-medium shadow-sm disabled:opacity-60">
                    {uploadingAttachment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {uploadingAttachment ? 'Uploading...' : 'Add Attachment'}
                  </button>
                </>
              )}
            </div>

            {/* Move History */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <button onClick={() => setShowMoveHistory(!showMoveHistory)} className="w-full flex items-center justify-between py-3 px-4 text-left bg-slate-50/80 hover:bg-slate-100/80 transition-colors">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <History className="w-4 h-4 text-slate-500 flex-shrink-0" /><h3 className="text-sm font-bold text-slate-800 flex-1 min-w-0">Move History</h3>
                  {(selectedJob.moveHistory || []).length > 0 && (<span className="text-xs text-gray-500 bg-slate-200 px-2 py-0.5 rounded-full flex-shrink-0">{(selectedJob.moveHistory || []).length}</span>)}
                </div>
                <ChevronRight className={`w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ml-2 ${showMoveHistory ? 'rotate-90' : ''}`} />
              </button>
              {showMoveHistory && (
                <div className="space-y-3 max-h-[300px] overflow-y-auto px-4 py-3 bg-white border-t border-slate-100">
                  {(selectedJob.moveHistory || []).length === 0 ? (<p className="text-xs text-gray-400 italic py-2 text-center">No move history</p>) : (
                    (selectedJob.moveHistory || []).map((move, i) => {
                      const actionType = move.actionType || 'status_change';
                      let label = '';
                      if (actionType === 'assignment') { const roleLabel = move.targetRole === 'dashboard_manager' ? 'Dashboard Manager' : move.targetRole === 'linkedin_member' ? 'LinkedIn member' : move.targetRole || 'assignee'; label = `${roleLabel} assigned: ${move.targetName || '—'}`; }
                      else if (actionType === 'client_paused') label = 'Client paused';
                      else if (actionType === 'client_unpaused') label = 'Client unpaused';
                      else if (actionType === 'client_phase_set') label = 'Status set to New (onboarding phase)';
                      else if (actionType === 'comment_resolved') label = 'Tagged comment resolved';
                      else { label = move.fromStatus === 'created' ? 'Job card created' : `Moved from ${STATUS_LABELS[move.fromStatus] || move.fromStatus}` + (move.toStatus ? ` → ${STATUS_LABELS[move.toStatus] || move.toStatus}` : ''); }
                      const byEmail = (move.movedBy || '').trim().toLowerCase();
                      const byName = (move.movedByName || '').trim();
                      const isSystem = !byEmail || byEmail === 'system' || byEmail === 'unknown';
                      const whoText = isSystem ? 'System' : byName && byName !== byEmail ? `${byName} (${move.movedBy})` : move.movedBy;
                      const resolvedList = Array.isArray(move.resolvedEmails) ? move.resolvedEmails.filter(Boolean).join(', ') : '';
                      const metaLine = actionType === 'comment_resolved'
                        ? (resolvedList ? `Resolved by ${resolvedList}` : `Resolved (${whoText})`)
                        : `by ${whoText}`;
                      const actorNote = actionType === 'comment_resolved' && resolvedList && !isSystem
                        ? ` · action by ${whoText}`
                        : '';
                      const snippet = (move.commentSnippet || '').trim();
                      return (
                        <div key={i} className="flex gap-3">
                          <div className="flex flex-col items-center pt-1"><div className={`w-2 h-2 rounded-full ${actionType === 'comment_resolved' ? 'bg-emerald-500' : 'bg-primary'}`}></div>{i < (selectedJob.moveHistory || []).length - 1 && (<div className="w-px h-full bg-gray-200 mt-1 min-h-[20px]"></div>)}</div>
                          <div className="flex-1 pb-2">
                            <p className="text-xs text-gray-700"><span className="font-semibold text-gray-900">{label}</span></p>
                            {actionType === 'comment_resolved' && snippet ? (
                              <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2" title={snippet}>{snippet.length >= 120 ? `${snippet}…` : snippet}</p>
                            ) : null}
                            <p className="text-[10px] text-gray-400 mt-0.5">{metaLine}{actorNote} • {new Date(move.movedAt).toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Comments */}
          <CommentsSection
            selectedJob={selectedJob}
            user={user}
            roles={roles}
            loadingJobDetails={loadingJobDetails}
            loadingComments={loadingComments}
            onUpdateJob={onUpdateJob}
            onMoveJob={onMoveJob}
            canMoveAny={canMoveAny}
            movingStatus={movingStatus}
            onFetchNonResolvedIssues={onFetchNonResolvedIssues}
          />
        </div>
      </div>

      {/* Sub-modals rendered inside the detail modal portal */}
      {/* Add Attachment Modal */}
      {showAddAttachmentModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget && !uploadingAttachment) { setShowAddAttachmentModal(false); setAttachmentNameInput(''); setAttachmentFilePending(null); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()} onPaste={(e) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
              if (items[i].kind === 'file') {
                const file = items[i].getAsFile();
                if (file && file.type.startsWith('image/')) { e.preventDefault(); e.stopPropagation(); setAttachmentFilePending(file); setAttachmentNameInput(prev => prev.trim() ? prev : (file.name.replace(/\.[^/.]+$/, '') || 'pasted-image.png')); toastUtils.success('Image pasted!'); return; }
              }
            }
          }} tabIndex={-1}>
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between"><h2 className="text-lg font-bold text-gray-900">Add Attachment</h2><button type="button" onClick={() => { setShowAddAttachmentModal(false); setAttachmentNameInput(''); setAttachmentFilePending(null); }} disabled={uploadingAttachment} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-50"><X className="w-5 h-5" /></button></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Name</label><input ref={attachmentNameInputRef} type="text" value={attachmentNameInput} onChange={(e) => setAttachmentNameInput(e.target.value)} placeholder="e.g. Resume Draft v1" className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm" /></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">File</label><label className="flex items-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:border-gray-300 cursor-pointer text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors"><Paperclip className="w-4 h-4" />{attachmentFilePending ? attachmentFilePending.name : 'Choose file or paste image (Ctrl+V)'}<input type="file" className="hidden" onChange={(e) => { const file = e?.target?.files?.[0]; if (file) { setAttachmentFilePending(file); if (!attachmentNameInput.trim()) setAttachmentNameInput(file.name.replace(/\.[^/.]+$/, '')); } e.target.value = ''; }} /></label><p className="text-xs text-gray-500 mt-1">Paste an image from clipboard with Ctrl+V</p></div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button type="button" onClick={() => { setShowAddAttachmentModal(false); setAttachmentNameInput(''); setAttachmentFilePending(null); }} disabled={uploadingAttachment} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleUploadAttachment} disabled={!attachmentFilePending || uploadingAttachment} className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-[#c94a28] disabled:opacity-50 flex items-center gap-2">{uploadingAttachment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Upload</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Attachment Modal */}
      {editingAttachmentIndex != null && selectedJob.attachments?.[editingAttachmentIndex] && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !savingAttachmentEdit && (setEditingAttachmentIndex(null), setEditingAttachmentName(''), setAttachmentReplaceFilePending(null))}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between"><h3 className="text-lg font-semibold text-gray-900">Edit attachment</h3><button type="button" onClick={() => { setEditingAttachmentIndex(null); setEditingAttachmentName(''); setAttachmentReplaceFilePending(null); }} disabled={savingAttachmentEdit} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg disabled:opacity-50"><X className="w-5 h-5" /></button></div>
            <div className="p-5 space-y-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={editingAttachmentName} onChange={(e) => setEditingAttachmentName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary" placeholder="e.g. Resume" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">File</label><a href={selectedJob.attachments[editingAttachmentIndex].url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-primary hover:underline"><FileText className="w-4 h-4" /> Open current file</a></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Replace file (optional)</label><div className="flex items-center gap-2"><input type="file" className="hidden" id="attachment-replace-input" onChange={(e) => setAttachmentReplaceFilePending(e.target.files?.[0] || null)} /><label htmlFor="attachment-replace-input" className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 bg-gray-50 hover:bg-gray-100 cursor-pointer truncate">{attachmentReplaceFilePending ? attachmentReplaceFilePending.name : 'Choose new file…'}</label>{attachmentReplaceFilePending && <button type="button" onClick={() => setAttachmentReplaceFilePending(null)} className="text-sm text-gray-500 hover:text-red-600">Clear</button>}</div></div>
            </div>
            <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
              <button type="button" onClick={() => { setEditingAttachmentIndex(null); setEditingAttachmentName(''); setAttachmentReplaceFilePending(null); }} disabled={savingAttachmentEdit} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={saveAttachmentEdit} disabled={savingAttachmentEdit} className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2">{savingAttachmentEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Details Modal — only close via Cancel or X, not backdrop */}
      {showEditClientNumberModal && editingClientNumberEmail && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="edit-client-details-title">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between"><h2 id="edit-client-details-title" className="text-lg font-bold text-gray-900">Edit Client Details</h2><button type="button" onClick={() => { setShowEditClientNumberModal(false); setEditingClientNumberEmail(null); setEditingClientNumberValue(''); setEditingClientNameJobId(null); setEditingClientNameValue(''); }} disabled={savingClientNumber || savingClientName} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 disabled:opacity-50"><X className="w-5 h-5" /></button></div>
            <div className="p-6 space-y-4">
              <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Client Name</label><input type="text" value={editingClientNameValue} onChange={(e) => setEditingClientNameValue(e.target.value)} placeholder="Client name" className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm" autoFocus /></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Client Number</label><input type="number" min={1} value={editingClientNumberValue} onChange={(e) => setEditingClientNumberValue(e.target.value)} placeholder="e.g. 5810" className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm" /><p className="text-xs text-gray-500 mt-1">Leave empty to clear the number</p></div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button type="button" onClick={() => { setShowEditClientNumberModal(false); setEditingClientNumberEmail(null); setEditingClientNumberValue(''); setEditingClientNameJobId(null); setEditingClientNameValue(''); }} disabled={savingClientNumber || savingClientName} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={async () => { if (editingClientNameJobId && editingClientNameValue.trim()) await saveClientName(editingClientNameJobId, editingClientNameValue); await handleSaveClientNumber(editingClientNumberEmail, editingClientNumberValue); setShowEditClientNumberModal(false); setEditingClientNameJobId(null); setEditingClientNameValue(''); }} disabled={savingClientNumber || savingClientName} className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">{(savingClientNumber || savingClientName) ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Operations Intern Modal */}
      {showAddOperatorModal && selectedJob?.clientEmail && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !addingOperatorToClient && setShowAddOperatorModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between"><h3 className="text-lg font-semibold text-gray-900">Add operations intern to client</h3><button type="button" onClick={() => !addingOperatorToClient && setShowAddOperatorModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5">
              {(() => {
                const assignedEmails = new Set(operationsForClient.map(o => (o.email || '').toLowerCase()));
                const available = (roles?.operationsInterns || []).filter(o => !assignedEmails.has((o.email || '').toLowerCase()));
                if (available.length === 0) return <p className="text-sm text-gray-500">All operations interns are already assigned.</p>;
                return (<div className="space-y-2 max-h-64 overflow-y-auto">{available.map((op) => (<div key={(op.email || '').toLowerCase()} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-gray-100 hover:bg-gray-50"><div className="min-w-0 flex-1"><p className="text-sm font-medium text-gray-900 truncate">{op.name || op.email}</p><p className="text-xs text-gray-500 truncate">{op.email}</p></div><button type="button" onClick={() => handleAddOperatorToClient(op.email)} disabled={addingOperatorToClient} className="shrink-0 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">{addingOperatorToClient ? 'Adding…' : 'Add'}</button></div>))}</div>);
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Add Managed User Modal */}
      {showAddManagedUserModal && selectedJob?.operatorEmail && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => !addingClientToOperator && setShowAddManagedUserModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between"><h3 className="text-lg font-semibold text-gray-900">Add user to operator</h3><button type="button" onClick={() => !addingClientToOperator && setShowAddManagedUserModal(false)} className="p-1.5 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-5 h-5" /></button></div>
            <div className="p-5">
              {loadingAvailableClientsForOperator ? (<p className="text-sm text-gray-500">Loading...</p>) : availableClientsForOperator.length === 0 ? (<p className="text-sm text-gray-500">No additional clients available.</p>) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">{availableClientsForOperator.map((client) => (<div key={client._id || client.email} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg border border-gray-100 hover:bg-gray-50"><div className="min-w-0 flex-1"><p className="text-sm font-medium text-gray-900 truncate">{client.name || client.email}</p><p className="text-xs text-gray-500 truncate">{client.email}</p></div><button type="button" onClick={() => handleAssignClientToOperator(client.email)} disabled={addingClientToOperator} className="shrink-0 px-3 py-1.5 text-xs font-medium bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50">{addingClientToOperator ? 'Adding…' : 'Add'}</button></div>))}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

JobDetailModal.displayName = 'JobDetailModal';
export default JobDetailModal;
