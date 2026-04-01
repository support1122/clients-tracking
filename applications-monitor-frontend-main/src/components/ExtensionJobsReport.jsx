import React, { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_BASE || 'https://applications-monitor-api.flashfirejobs.com';
const IST_TIMEZONE = 'Asia/Kolkata';
const MODAL_PAGE_SIZE = 15;
const DAILY_MODAL_PAGE_SIZE = 5;
const OPERATOR_PAGE_SIZE = 8;

function getIstYmd(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function parseIstYmd(ymd) {
  return new Date(`${ymd}T00:00:00.000+05:30`);
}

function shiftIstDays(ymd, days) {
  const next = new Date(parseIstYmd(ymd).getTime() + days * 24 * 60 * 60 * 1000);
  return getIstYmd(next);
}

function getLastCalendarMonthRange() {
  const today = parseIstYmd(getIstYmd());
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 0, 0, 0));
  return {
    startDate: getIstYmd(start),
    endDate: getIstYmd(end),
  };
}

function buildInitialFilters() {
  const today = getIstYmd();
  return { startDate: today, endDate: today, operator: '' };
}

function formatCurrency(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN')}`;
}

function formatAverage(value) {
  const num = Number(value || 0);
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function samePreset(filters, preset) {
  return filters.startDate === preset.startDate && filters.endDate === preset.endDate;
}

function presetButtonClass(isActive) {
  return isActive
    ? 'rounded-lg border border-orange-300 bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white shadow-sm'
    : 'rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100';
}

function parseAppliedByLabel(currentStatus) {
  if (!currentStatus || typeof currentStatus !== 'string') return '—';
  const match = currentStatus.match(/\bapplied\s+by\s+(.+?)(?:\s*$|,)/i);
  if (match) return match[1].trim();
  if (/applied/i.test(currentStatus)) return currentStatus.trim();
  return '—';
}

function getHistoryAverage(record) {
  if (record?.avgJobsPerClient !== undefined && record?.avgJobsPerClient !== null) {
    return Number(record.avgJobsPerClient) || 0;
  }
  const handled = Number(record?.clientsHandled) || record?.clientBreakdown?.length || 0;
  const totalJobs = Number(record?.totalJobs) || 0;
  return handled > 0 ? totalJobs / handled : 0;
}

function getHistoryClientsHandled(record) {
  return Number(record?.clientsHandled) || record?.clientBreakdown?.length || 0;
}

function normalizeFilters(filters) {
  const startDate = filters.startDate || getIstYmd();
  const endDate = filters.endDate || startDate;
  return {
    ...filters,
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
    operator: (filters.operator || '').trim(),
  };
}

function SectionHeading({ title, description, action }) {
  return (
    <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

function SummaryCard({ label, value, hint, accent = 'text-gray-900' }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

function StatusBadge({ tone, children, title }) {
  const tones = {
    good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn: 'bg-amber-50 text-amber-700 border-amber-200',
    bad: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-slate-50 text-slate-700 border-slate-200',
  };
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${tones[tone] || tones.neutral}`}>
      {children}
    </span>
  );
}

function JobRowsTable({ jobs, dense = false }) {
  if (!jobs?.length) return <p className="py-6 text-sm text-gray-500">No rows found for this selection.</p>;

  return (
    <div className={`overflow-x-auto ${dense ? '' : 'max-h-[50vh] overflow-y-auto'}`}>
      <table className="min-w-full text-sm">
        <thead className={dense ? '' : 'sticky top-0 z-10 bg-gray-100'}>
          <tr className="text-left text-gray-600">
            <th className={`${dense ? 'px-3 py-2' : 'px-3 py-2.5'} font-medium`}>Job</th>
            <th className={`${dense ? 'px-3 py-2' : 'px-3 py-2.5'} font-medium`}>Company</th>
            <th className={`${dense ? 'px-3 py-2' : 'px-3 py-2.5'} font-medium`}>Client</th>
            <th className={`${dense ? 'px-3 py-2' : 'px-3 py-2.5'} font-medium`}>Added time</th>
            <th className={`${dense ? 'px-3 py-2' : 'px-3 py-2.5'} font-medium`}>Applied by</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((job) => (
            <tr key={job._id || `${job.jobID}-${job.userID}`} className="border-t border-gray-200/80">
              <td className={`${dense ? 'px-3 py-2' : 'px-3 py-2.5'} max-w-[220px] truncate text-gray-900`} title={job.jobTitle}>{job.jobTitle || '—'}</td>
              <td className={`${dense ? 'px-3 py-2' : 'px-3 py-2.5'} max-w-[180px] truncate text-gray-700`} title={job.companyName}>{job.companyName || '—'}</td>
              <td className={`${dense ? 'px-3 py-2' : 'px-3 py-2.5'} max-w-[180px] truncate text-xs text-gray-600`} title={job.userID}>{job.userID || '—'}</td>
              <td className={`${dense ? 'px-3 py-2' : 'px-3 py-2.5'} whitespace-nowrap text-xs text-gray-500`}>{job.dateAdded || job.createdAt || '—'}</td>
              <td className={`${dense ? 'px-3 py-2' : 'px-3 py-2.5'} max-w-[160px] truncate text-xs font-medium text-orange-700`} title={job.currentStatus || ''}>{parseAppliedByLabel(job.currentStatus)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const INCENTIVE_RULES = [
  { label: 'Below 20 clients handled', value: '₹0' },
  { label: '20 to 29 clients handled', value: '₹50 / day' },
  { label: '30 to 34 clients handled', value: '₹70 / day' },
  { label: '35 to 39 clients handled', value: '₹80 / day' },
  { label: '40+ clients handled', value: '₹100 / day' },
];

export default function ExtensionJobsReport() {
  const navigate = useNavigate();
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : null;

  const [draftFilters, setDraftFilters] = useState(() => buildInitialFilters());
  const [reportFilters, setReportFilters] = useState(() => buildInitialFilters());
  const [historyFilters, setHistoryFilters] = useState(() => ({
    ...buildInitialFilters(),
    status: '',
  }));

  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [totalJobs, setTotalJobs] = useState(0);
  const [byAdder, setByAdder] = useState([]);
  const [samples, setSamples] = useState([]);
  const [operatorOptions, setOperatorOptions] = useState([]);
  const [totalOperators, setTotalOperators] = useState(0);
  const [operatorPage, setOperatorPage] = useState(1);
  const [operatorTotalPages, setOperatorTotalPages] = useState(0);
  const [totalClientsHandled, setTotalClientsHandled] = useState(0);
  const [totalIncentiveRange, setTotalIncentiveRange] = useState(0);
  const [averageAcrossOperators, setAverageAcrossOperators] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentRole, setCurrentRole] = useState('');

  const [complaints, setComplaints] = useState([]);
  const [complaintDateYmd, setComplaintDateYmd] = useState(() => getIstYmd());
  const [complaintAddedBy, setComplaintAddedBy] = useState('');
  const [complaintClientEmail, setComplaintClientEmail] = useState('');
  const [complaintNote, setComplaintNote] = useState('');
  const [complaintSaving, setComplaintSaving] = useState(false);

  const [expandedAdder, setExpandedAdder] = useState(null);
  const [previewByAdder, setPreviewByAdder] = useState({});
  const [previewLoading, setPreviewLoading] = useState(null);

  const [modalAdder, setModalAdder] = useState(null);
  const [modalPage, setModalPage] = useState(1);
  const [modalData, setModalData] = useState({ jobs: [], total: 0, totalPages: 0, uniqueClients: 0 });
  const [modalLoading, setModalLoading] = useState(false);
  const [dailyModal, setDailyModal] = useState(null);
  const [dailyModalPage, setDailyModalPage] = useState(1);

  const [historyPage, setHistoryPage] = useState(1);
  const [historyData, setHistoryData] = useState({ records: [], total: 0, totalPages: 0 });

  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectSaving, setRejectSaving] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (!savedUser) return;
    try {
      const role = JSON.parse(savedUser)?.role || '';
      setCurrentRole(role);
      setIsAdmin(role === 'admin');
    } catch {
      setCurrentRole('');
      setIsAdmin(false);
    }
  }, []);

  const showExtendedSections = isAdmin || currentRole !== 'team_lead';

  useEffect(() => {
    setComplaintDateYmd(reportFilters.startDate);
  }, [reportFilters.startDate]);

  const complaintKeySet = useMemo(
    () => new Set(complaints.map((item) => `${item.dateYmd}|${item.addedBy}`)),
    [complaints]
  );

  const mergedOperatorOptions = useMemo(() => {
    return Array.from(new Set([
      ...operatorOptions,
      ...byAdder.map((row) => row.addedBy).filter(Boolean),
      ...historyData.records.map((row) => row.addedBy).filter(Boolean),
      complaintAddedBy,
      draftFilters.operator,
      historyFilters.operator,
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [operatorOptions, byAdder, historyData.records, complaintAddedBy, draftFilters.operator, historyFilters.operator]);

  const maxCount = useMemo(() => Math.max(...byAdder.map((row) => row.count || 0), 1), [byAdder]);

  const applyDraftFilters = useCallback(() => {
    const next = normalizeFilters(draftFilters);
    setDraftFilters(next);
    setReportFilters(next);
  }, [draftFilters]);

  const applyPresetFilters = useCallback((nextFilters) => {
    const normalized = normalizeFilters(nextFilters);
    setOperatorPage(1);
    setDraftFilters(normalized);
    setReportFilters(normalized);
  }, []);

  const resetToToday = useCallback(() => {
    const next = buildInitialFilters();
    setDraftFilters(next);
    setReportFilters(next);
    setOperatorPage(1);
    setHistoryFilters((prev) => ({ ...prev, ...next }));
    setHistoryPage(1);
  }, []);

  const applyHistoryFilters = useCallback(() => {
    const normalized = normalizeFilters(historyFilters);
    setHistoryFilters((prev) => ({ ...prev, ...normalized }));
    setHistoryPage(1);
  }, [historyFilters]);

  const todayPreset = useMemo(() => buildInitialFilters(), []);
  const last7Preset = useMemo(() => ({ startDate: shiftIstDays(getIstYmd(), -6), endDate: getIstYmd(), operator: draftFilters.operator }), [draftFilters.operator]);
  const lastMonthPreset = useMemo(() => ({ ...getLastCalendarMonthRange(), operator: draftFilters.operator }), [draftFilters.operator]);

  const fetchReport = useCallback(async () => {
    if (!token) {
      setError('Not signed in.');
      return;
    }

    const currentFilters = normalizeFilters(reportFilters);
    setLoading(true);
    setError('');
    setExpandedAdder(null);
    setPreviewByAdder({});

    try {
      const params = new URLSearchParams({
        startDate: currentFilters.startDate,
        endDate: currentFilters.endDate,
        page: String(operatorPage),
        limit: String(OPERATOR_PAGE_SIZE),
      });
      if (currentFilters.operator) params.set('addedBy', currentFilters.operator);

      const response = await fetch(`${API_BASE}/api/extension-jobs-report?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));

      if (response.status === 401 || response.status === 403) {
        setError(data?.error || 'Access denied.');
        setByAdder([]);
        setSamples([]);
        setOperatorOptions([]);
        setTotalOperators(0);
        setOperatorTotalPages(0);
        setTotalClientsHandled(0);
        setTotalIncentiveRange(0);
        setAverageAcrossOperators(0);
        setTotalJobs(0);
        return;
      }

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load extension jobs report');
      }

      setTotalJobs(data.totalJobs || 0);
      setTotalOperators(data.totalOperators || 0);
      setOperatorTotalPages(data.totalPages || 0);
      setByAdder(Array.isArray(data.byAdder) ? data.byAdder : []);
      setSamples(Array.isArray(data.samples) ? data.samples : []);
      setOperatorOptions(Array.isArray(data.operatorOptions) ? data.operatorOptions : []);
      setTotalClientsHandled(data.totalClientsHandled || 0);
      setTotalIncentiveRange(data.totalIncentiveRange || 0);
      setAverageAcrossOperators(Number(data.averageJobsPerClientOverall) || 0);
      if (data.isAdmin !== undefined) setIsAdmin(Boolean(data.isAdmin));
    } catch (fetchError) {
      console.error(fetchError);
      setError(fetchError.message || 'Network error while loading report');
      setByAdder([]);
      setSamples([]);
      setOperatorOptions([]);
      setTotalOperators(0);
      setOperatorTotalPages(0);
      setTotalClientsHandled(0);
      setTotalIncentiveRange(0);
      setAverageAcrossOperators(0);
      setTotalJobs(0);
    } finally {
      setLoading(false);
    }
  }, [operatorPage, reportFilters, token]);

  const fetchComplaints = useCallback(async () => {
    if (!token || !isAdmin) {
      setComplaints([]);
      return;
    }

    try {
      const params = new URLSearchParams({
        startYmd: reportFilters.startDate,
        endYmd: reportFilters.endDate,
      });
      if (reportFilters.operator) params.set('addedBy', reportFilters.operator);

      const response = await fetch(`${API_BASE}/api/admin/extension-incentive-complaints?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));
      setComplaints(response.ok && Array.isArray(data.complaints) ? data.complaints : []);
    } catch {
      setComplaints([]);
    }
  }, [isAdmin, reportFilters.endDate, reportFilters.operator, reportFilters.startDate, token]);

  const fetchHistory = useCallback(async () => {
    if (!token) return;

    const currentFilters = normalizeFilters(historyFilters);
    setHistoryLoading(true);
    setHistoryError('');

    try {
      const params = new URLSearchParams({
        startYmd: currentFilters.startDate,
        endYmd: currentFilters.endDate,
        page: String(historyPage),
        limit: '20',
      });
      if (currentFilters.operator) params.set('addedBy', currentFilters.operator);
      if (historyFilters.status) params.set('status', historyFilters.status);

      const response = await fetch(`${API_BASE}/api/extension-incentive-history?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.error || 'Failed to load incentive records');
      }

      setHistoryData({
        records: Array.isArray(data.records) ? data.records : [],
        total: data.total || 0,
        totalPages: data.totalPages || 0,
      });
    } catch (fetchError) {
      console.error(fetchError);
      setHistoryError(fetchError.message || 'Failed to load incentive history');
      setHistoryData({ records: [], total: 0, totalPages: 0 });
    } finally {
      setHistoryLoading(false);
    }
  }, [historyFilters, historyPage, token]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const fetchJobsByAdder = useCallback(async (addedBy, page, limit) => {
    const params = new URLSearchParams({
      startDate: reportFilters.startDate,
      endDate: reportFilters.endDate,
      addedBy,
      page: String(page),
      limit: String(limit),
    });
    const response = await fetch(`${API_BASE}/api/extension-jobs-report/jobs?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || 'Failed to load jobs');
    return data;
  }, [reportFilters.endDate, reportFilters.startDate, token]);

  const toggleExpand = async (addedBy) => {
    if (expandedAdder === addedBy) {
      setExpandedAdder(null);
      return;
    }

    setExpandedAdder(addedBy);
    if (previewByAdder[addedBy]) return;

    setPreviewLoading(addedBy);
    try {
      const data = await fetchJobsByAdder(addedBy, 1, 5);
      setPreviewByAdder((prev) => ({ ...prev, [addedBy]: data.jobs || [] }));
    } catch (previewError) {
      console.error(previewError);
      setPreviewByAdder((prev) => ({ ...prev, [addedBy]: [] }));
    } finally {
      setPreviewLoading(null);
    }
  };

  const openModal = async (addedBy) => {
    setModalAdder(addedBy);
    setModalPage(1);
    setModalLoading(true);
    try {
      const data = await fetchJobsByAdder(addedBy, 1, MODAL_PAGE_SIZE);
      setModalData({
        jobs: data.jobs || [],
        total: data.total || 0,
        totalPages: data.totalPages || 0,
        uniqueClients: data.uniqueClients ?? 0,
      });
    } catch (modalError) {
      console.error(modalError);
      setModalData({ jobs: [], total: 0, totalPages: 0, uniqueClients: 0 });
    } finally {
      setModalLoading(false);
    }
  };

  const loadModalPage = async (page) => {
    if (!modalAdder) return;
    setModalLoading(true);
    try {
      const data = await fetchJobsByAdder(modalAdder, page, MODAL_PAGE_SIZE);
      setModalPage(page);
      setModalData({
        jobs: data.jobs || [],
        total: data.total || 0,
        totalPages: data.totalPages || 0,
        uniqueClients: data.uniqueClients ?? 0,
      });
    } catch (modalError) {
      console.error(modalError);
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalAdder(null);
    setModalPage(1);
    setModalData({ jobs: [], total: 0, totalPages: 0, uniqueClients: 0 });
  };

  const openDailyModal = (addedBy, rows = []) => {
    setDailyModal({ addedBy, rows });
    setDailyModalPage(1);
  };

  const closeDailyModal = () => {
    setDailyModal(null);
    setDailyModalPage(1);
  };

  const submitComplaint = async (event) => {
    event.preventDefault();
    if (!token || !complaintDateYmd || !complaintAddedBy.trim()) return;

    setComplaintSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/extension-incentive-complaints`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dateYmd: complaintDateYmd,
          addedBy: complaintAddedBy.trim(),
          clientEmail: complaintClientEmail.trim(),
          note: complaintNote.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Failed to save complaint');

      setComplaintClientEmail('');
      setComplaintNote('');
      await Promise.all([fetchReport(), fetchHistory()]);
    } catch (submitError) {
      console.error(submitError);
      setError(submitError.message || 'Failed to save complaint');
    } finally {
      setComplaintSaving(false);
    }
  };

  const deleteComplaint = async (id) => {
    if (!token || !id || !window.confirm('Remove this complaint flag?')) return;
    try {
      const response = await fetch(`${API_BASE}/api/admin/extension-incentive-complaints/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to delete complaint');
      await Promise.all([fetchReport(), fetchHistory()]);
    } catch (deleteError) {
      console.error(deleteError);
      setError('Failed to delete complaint');
    }
  };

  const rejectIncentive = async () => {
    if (!token || !rejectModal || !rejectReason.trim()) return;

    setRejectSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/admin/extension-daily-incentive/${rejectModal._id}/reject`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Failed to reject incentive');

      setRejectModal(null);
      setRejectReason('');
      await Promise.all([fetchReport(), fetchHistory()]);
    } catch (rejectError) {
      console.error(rejectError);
      setError(rejectError.message || 'Failed to reject incentive');
    } finally {
      setRejectSaving(false);
    }
  };

  const restoreIncentive = async (id) => {
    if (!token || !id || !window.confirm('Restore this incentive?')) return;
    try {
      const response = await fetch(`${API_BASE}/api/admin/extension-daily-incentive/${id}/restore`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to restore incentive');
      await Promise.all([fetchReport(), fetchHistory()]);
    } catch (restoreError) {
      console.error(restoreError);
      setError('Failed to restore incentive');
    }
  };

  const approveIncentive = async (id) => {
    if (!token || !id) return;
    try {
      const response = await fetch(`${API_BASE}/api/admin/extension-daily-incentive/${id}/approve`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to approve incentive');
      await Promise.all([fetchReport(), fetchHistory()]);
    } catch (approveError) {
      console.error(approveError);
      setError('Failed to approve incentive');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-orange-50/40 to-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Extension Jobs</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-600 sm:text-base">
              Track jobs added from the extension, see operator productivity, and review daily incentives.
              Incentive days use the 11:00 PM IST to 12:59 PM IST counting window.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/monitor-clients')}
            className="self-start rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
          >
            Back to portal
          </button>
        </div>

        <div className="mb-8 rounded-3xl border border-orange-100 bg-white/90 shadow-sm backdrop-blur">
          <SectionHeading
            title="Filters"
            description="Use IST dates. The page loads with today selected by default, and the quick filters apply immediately."
            action={(
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => applyPresetFilters(todayPreset)} className={presetButtonClass(samePreset(draftFilters, todayPreset))}>Today</button>
                <button type="button" onClick={() => applyPresetFilters(last7Preset)} className={presetButtonClass(samePreset(draftFilters, last7Preset))}>Last 7 days</button>
                <button type="button" onClick={() => applyPresetFilters(lastMonthPreset)} className={presetButtonClass(samePreset(draftFilters, lastMonthPreset))}>Last month</button>
              </div>
            )}
          />
          <div className="px-6 py-5">
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr_auto]">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Start date</label>
                <input
                  type="date"
                  value={draftFilters.startDate}
                  onChange={(event) => setDraftFilters((prev) => ({ ...prev, startDate: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">End date</label>
                <input
                  type="date"
                  value={draftFilters.endDate}
                  min={draftFilters.startDate}
                  onChange={(event) => setDraftFilters((prev) => ({ ...prev, endDate: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Operator</label>
                <select
                  value={draftFilters.operator}
                  onChange={(event) => setDraftFilters((prev) => ({ ...prev, operator: event.target.value }))}
                  className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100"
                >
                  <option value="">All operators</option>
                  {mergedOperatorOptions.map((operator) => (
                    <option key={operator} value={operator}>{operator}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button type="button" onClick={() => { setOperatorPage(1); applyDraftFilters(); }} disabled={loading} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:opacity-50">
                  {loading ? 'Loading…' : 'Apply'}
                </button>
                <button type="button" onClick={resetToToday} className="rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 transition hover:bg-gray-50">
                  Reset
                </button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <StatusBadge tone="neutral">Applied range: {reportFilters.startDate} to {reportFilters.endDate}</StatusBadge>
              {reportFilters.operator ? <StatusBadge tone="neutral">Operator: {reportFilters.operator}</StatusBadge> : null}
            </div>
            {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
          </div>
        </div>

        {!loading && !error ? (
          <>
            <div className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <SummaryCard label="Jobs added" value={totalJobs.toLocaleString('en-IN')} hint="Current filter range" accent="text-orange-600" />
              <SummaryCard label="Operators active" value={totalOperators.toLocaleString('en-IN')} hint="Distinct extension adders in this range" />
              <SummaryCard label="Clients handled" value={totalClientsHandled.toLocaleString('en-IN')} hint="Sum of clients handled across visible operators" />
              <SummaryCard label="Average jobs per client" value={formatAverage(averageAcrossOperators)} hint="Average of operator-level averages" accent="text-emerald-700" />
            </div>

            <div className="mb-8 rounded-3xl border border-gray-200 bg-white shadow-sm">
              <SectionHeading
                title="Team performance"
                description="Simple view for the team: clients handled, jobs added, average jobs per client, incentive total, and share of volume."
                action={<StatusBadge tone="good">Range incentive: {formatCurrency(totalIncentiveRange)}</StatusBadge>}
              />
              {byAdder.length === 0 ? (
                <p className="px-6 py-12 text-center text-sm text-gray-500">No extension jobs found for the selected filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-600">
                        <th className="w-10 px-3 py-3" aria-hidden />
                        <th className="px-4 py-3 font-medium">Operator</th>
                        <th className="px-4 py-3 text-right font-medium">Clients handled</th>
                        <th className="px-4 py-3 text-right font-medium">Jobs added</th>
                        <th className="px-4 py-3 text-right font-medium">Avg jobs / client</th>
                        <th className="px-4 py-3 text-right font-medium">Incentive</th>
                        <th className="px-4 py-3 font-medium">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byAdder.map((row) => {
                        const isOpen = expandedAdder === row.addedBy;
                        const count = row.count || 0;
                        const clientsHandled = row.clientsHandled || row.uniqueClients || 0;
                        const average = Number(row.avgJobsPerClient) || 0;
                        const share = totalJobs > 0 ? ((count / totalJobs) * 100).toFixed(1) : '0.0';
                        const barWidth = `${Math.max((count / maxCount) * 100, 4)}%`;
                        const incentiveTotal = row.incentiveTotal || 0;
                        const isEligible = average >= 20 && clientsHandled >= 20;
                        const daily = row.incentiveDaily || [];
                        const dailyPreview = daily.slice(0, DAILY_MODAL_PAGE_SIZE);

                        return (
                          <Fragment key={row.addedBy}>
                            <tr className="border-t border-gray-100 align-top hover:bg-orange-50/30">
                              <td className="px-2 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(row.addedBy)}
                                  className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-200 hover:text-gray-900"
                                  aria-expanded={isOpen}
                                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                                >
                                  <svg className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1">
                                  <button type="button" onClick={() => toggleExpand(row.addedBy)} className="text-left font-semibold text-gray-900 hover:text-orange-700">
                                    {row.addedBy}
                                  </button>
                                  <div className="flex flex-wrap gap-2">
                                    <StatusBadge tone={isEligible ? 'good' : 'warn'}>
                                      {isEligible ? 'Meets payout rule' : 'Below payout rule'}
                                    </StatusBadge>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums text-gray-900">{clientsHandled}</td>
                              <td className="px-4 py-3 text-right tabular-nums text-gray-800">{count}</td>
                              <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">{formatAverage(average)}</td>
                              <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700">{formatCurrency(incentiveTotal)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                                    <div className="h-full rounded-full bg-orange-500" style={{ width: barWidth }} />
                                  </div>
                                  <span className="w-12 text-right text-xs text-gray-500">{share}%</span>
                                </div>
                              </td>
                            </tr>
                            {isOpen ? (
                              <tr className="border-t border-gray-100 bg-slate-50/80">
                                <td colSpan={7} className="px-4 py-5 sm:px-6">
                                  <div className="space-y-5">
                                    <div className="grid gap-3 md:grid-cols-4">
                                      <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Clients handled</p>
                                        <p className="mt-2 text-2xl font-bold text-gray-900">{clientsHandled}</p>
                                      </div>
                                      <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Jobs added</p>
                                        <p className="mt-2 text-2xl font-bold text-gray-900">{count}</p>
                                      </div>
                                      <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Average jobs per client</p>
                                        <p className="mt-2 text-2xl font-bold text-gray-900">{formatAverage(average)}</p>
                                      </div>
                                      <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Range incentive</p>
                                        <p className="mt-2 text-2xl font-bold text-emerald-700">{formatCurrency(incentiveTotal)}</p>
                                      </div>
                                    </div>

                                    <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                      <div className="mb-3 flex items-center justify-between gap-3">
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Latest jobs</p>
                                          <p className="text-sm text-gray-500">Newest 5 rows in the selected range.</p>
                                        </div>
                                        {(row.count || 0) > 5 ? (
                                          <button type="button" onClick={() => openModal(row.addedBy)} className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100">
                                            View all {row.count} jobs
                                          </button>
                                        ) : null}
                                      </div>
                                      {previewLoading === row.addedBy ? <p className="py-6 text-sm text-gray-500">Loading preview…</p> : <JobRowsTable jobs={previewByAdder[row.addedBy] || []} dense />}
                                    </div>

                                    <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                      <div className="mb-3">
                                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Daily payout breakdown</p>
                                        <p className="text-sm text-gray-500">Review each day’s handled clients, job volume, average output, and payout readiness in one place.</p>
                                      </div>
                                      {daily.length === 0 ? (
                                        <p className="py-6 text-sm text-gray-500">No daily incentive rows in this range.</p>
                                      ) : (
                                        <div className="overflow-x-auto rounded-xl border border-gray-200">
                                          <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
                                            <p className="text-xs text-gray-500">Showing latest {Math.min(daily.length, DAILY_MODAL_PAGE_SIZE)} of {daily.length} days</p>
                                            {daily.length > DAILY_MODAL_PAGE_SIZE ? (
                                              <button
                                                type="button"
                                                onClick={() => openDailyModal(row.addedBy, daily)}
                                                className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                                              >
                                                View all {daily.length} days
                                              </button>
                                            ) : null}
                                          </div>
                                          <table className="min-w-full text-xs sm:text-sm">
                                            <thead className="bg-gray-50 text-left text-gray-600">
                                              <tr>
                                                <th className="px-3 py-2">Day</th>
                                                <th className="px-3 py-2 text-right">Clients</th>
                                                <th className="px-3 py-2 text-right">Jobs</th>
                                                <th className="px-3 py-2 text-right">Avg</th>
                                                <th className="px-3 py-2 text-right">₹</th>
                                                <th className="px-3 py-2">Status</th>
                                              </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                              {dailyPreview.map((day) => {
                                                const dayHasComplaint = complaintKeySet.has(`${day.dateYmd}|${row.addedBy}`);
                                                return (
                                                  <tr key={day.dateYmd} className={dayHasComplaint ? 'bg-red-50/70' : ''}>
                                                    <td className="px-3 py-2 whitespace-nowrap text-gray-900">
                                                      {day.dateYmd}
                                                      {dayHasComplaint ? <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Complaint</span> : null}
                                                    </td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{day.clientsHandled || 0}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums">{day.totalJobs || 0}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatAverage(day.avgJobsPerClient)}</td>
                                                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{day.incentive || 0}</td>
                                                    <td className="px-3 py-2 min-w-[240px]">
                                                      {day.eligible ? (
                                                        <StatusBadge tone="good">Eligible</StatusBadge>
                                                      ) : (
                                                        <span className="text-xs text-red-600">{day.gateReasons?.join(' · ') || 'Not eligible'}</span>
                                                      )}
                                                    </td>
                                                  </tr>
                                                );
                                              })}
                                            </tbody>
                                          </table>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {totalOperators > OPERATOR_PAGE_SIZE ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
                  <p className="text-sm text-gray-600">Page {operatorPage} of {Math.max(operatorTotalPages, 1)} · {totalOperators} operators</p>
                  <div className="flex gap-2">
                    <button type="button" disabled={operatorPage <= 1 || loading} onClick={() => setOperatorPage((prev) => prev - 1)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Previous</button>
                    <button type="button" disabled={operatorPage >= operatorTotalPages || loading} onClick={() => setOperatorPage((prev) => prev + 1)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Next</button>
                  </div>
                </div>
              ) : null}
            </div>

            {showExtendedSections ? (
            <div className="mb-8 rounded-3xl border border-gray-200 bg-white shadow-sm">
              <SectionHeading
                title="Recent jobs"
                description="Latest extension-added jobs inside the selected range."
              />
              <div className="p-3 sm:p-4">
                {samples.length === 0 ? <p className="px-3 py-8 text-center text-sm text-gray-500">No sample rows found.</p> : <JobRowsTable jobs={samples} />}
              </div>
            </div>
            ) : null}

            {showExtendedSections ? (
            <div className="mb-8 rounded-3xl border border-gray-200 bg-white shadow-sm">
              <SectionHeading
                title="Incentive records"
                description="Pending rows can be approved or rejected before 1 PM IST. If no action is taken, they auto-approve after 1 PM and can still be rejected later if a complaint comes in."
                action={<button type="button" onClick={applyHistoryFilters} className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700">Refresh records</button>}
              />
              <div className="border-b border-gray-100 px-6 py-4">
                <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr_0.9fr_auto]">
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">From</label>
                    <input type="date" value={historyFilters.startDate} onChange={(event) => setHistoryFilters((prev) => ({ ...prev, startDate: event.target.value }))} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">To</label>
                    <input type="date" min={historyFilters.startDate} value={historyFilters.endDate} onChange={(event) => setHistoryFilters((prev) => ({ ...prev, endDate: event.target.value }))} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Operator</label>
                    <select value={historyFilters.operator} onChange={(event) => setHistoryFilters((prev) => ({ ...prev, operator: event.target.value }))} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100">
                      <option value="">All operators</option>
                      {mergedOperatorOptions.map((operator) => (
                        <option key={`history-${operator}`} value={operator}>{operator}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Status</label>
                    <select value={historyFilters.status} onChange={(event) => setHistoryFilters((prev) => ({ ...prev, status: event.target.value }))} className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100">
                      <option value="">All</option>
                      <option value="pending">Pending review</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button type="button" onClick={() => { setHistoryPage(1); applyHistoryFilters(); }} className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                      Apply
                    </button>
                  </div>
                </div>
                {historyError ? <p className="mt-3 text-sm text-red-600">{historyError}</p> : null}
              </div>
              {historyLoading ? (
                <p className="px-6 py-12 text-center text-sm text-gray-500">Loading incentive records…</p>
              ) : historyData.records.length === 0 ? (
                <p className="px-6 py-12 text-center text-sm text-gray-500">No incentive records found for the current filters.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-gray-600">
                          <th className="px-4 py-3 font-medium">Day</th>
                          <th className="px-4 py-3 font-medium">Operator</th>
                          <th className="px-4 py-3 text-right font-medium">Clients</th>
                          <th className="px-4 py-3 text-right font-medium">Jobs</th>
                          <th className="px-4 py-3 text-right font-medium">Avg</th>
                          <th className="px-4 py-3 text-right font-medium">Incentive</th>
                          <th className="px-4 py-3 text-center font-medium">Status</th>
                          {isAdmin ? <th className="px-4 py-3 font-medium">Action</th> : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {historyData.records.map((record) => {
                          const clientsHandled = getHistoryClientsHandled(record);
                          const average = getHistoryAverage(record);
                          return (
                            <tr key={record._id} className={record.status === 'rejected' ? 'bg-red-50/40' : record.status === 'pending' ? 'bg-amber-50/40' : ''}>
                              <td className="px-4 py-3 whitespace-nowrap text-gray-900">{record.dateYmd}</td>
                              <td className="px-4 py-3 font-medium text-gray-900">{record.addedBy}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{clientsHandled}</td>
                              <td className="px-4 py-3 text-right tabular-nums">{record.totalJobs || 0}</td>
                              <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatAverage(average)}</td>
                              <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700">
                                {record.status === 'rejected' ? <span className="text-red-600 line-through">{formatCurrency(record.incentiveAmount)}</span> : formatCurrency(record.incentiveAmount)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {record.status === 'approved' ? (
                                  <StatusBadge tone="good">Approved</StatusBadge>
                                ) : record.status === 'pending' ? (
                                  <StatusBadge tone="warn">Pending</StatusBadge>
                                ) : (
                                  <StatusBadge tone="bad" title={record.rejectionReason || ''}>Rejected</StatusBadge>
                                )}
                              </td>
                              {isAdmin ? (
                                <td className="px-4 py-3">
                                  {record.status === 'approved' ? (
                                    <button type="button" onClick={() => { setRejectModal(record); setRejectReason(''); }} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                                      Reject
                                    </button>
                                  ) : record.status === 'pending' ? (
                                    <div className="flex flex-wrap gap-2">
                                      <button type="button" onClick={() => approveIncentive(record._id)} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                                        Approve
                                      </button>
                                      <button type="button" onClick={() => { setRejectModal(record); setRejectReason(''); }} className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                                        Reject
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      <button type="button" onClick={() => restoreIncentive(record._id)} className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
                                        Restore
                                      </button>
                                      {record.rejectionReason ? <p className="max-w-[220px] truncate text-xs text-gray-500" title={record.rejectionReason}>{record.rejectionReason}</p> : null}
                                    </div>
                                  )}
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
                    <p className="text-sm text-gray-600">Page {historyPage} of {Math.max(historyData.totalPages, 1)} · {historyData.total} records</p>
                    <div className="flex gap-2">
                      <button type="button" disabled={historyPage <= 1} onClick={() => setHistoryPage((prev) => prev - 1)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Previous</button>
                      <button type="button" disabled={historyPage >= historyData.totalPages} onClick={() => setHistoryPage((prev) => prev + 1)} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Next</button>
                    </div>
                  </div>
                </>
              )}
            </div>
            ) : null}

            {showExtendedSections ? (
            <div className="mb-8 rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 shadow-sm">
              <SectionHeading
                title="Incentive rules"
                description="Keep this below the working tables so the page starts with action, then shows the policy."
              />
              <div className="grid gap-6 px-6 py-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-2xl border border-amber-100 bg-white/80 p-5">
                  <p className="text-sm leading-6 text-gray-700">
                    Daily incentive is paid only when the operator handled at least <span className="font-semibold text-gray-900">20 clients</span> and the
                    average stays at <span className="font-semibold text-gray-900">20+ jobs per client</span>.
                    After that, the slab is decided by <span className="font-semibold text-gray-900">clients handled that day</span>.
                  </p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-white/80 p-5">
                  <div className="space-y-2">
                    {INCENTIVE_RULES.map((rule) => (
                      <div key={rule.label} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm">
                        <span className="font-medium text-gray-800">{rule.label}</span>
                        <span className="font-semibold text-gray-900">{rule.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            ) : null}

            {showExtendedSections && isAdmin ? (
              <div className="rounded-3xl border border-gray-200 bg-white shadow-sm">
                <SectionHeading
                  title="Complaint log"
                  description="Record an issue for a day and operator. That day’s incentive becomes zero."
                />
                <div className="px-6 py-5">
                  <form onSubmit={submitComplaint} className="grid gap-4 lg:grid-cols-[1fr_1.2fr_1.1fr_1.5fr_auto]">
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Day</label>
                      <input type="date" required value={complaintDateYmd} onChange={(event) => setComplaintDateYmd(event.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Operator</label>
                      <select value={complaintAddedBy} onChange={(event) => setComplaintAddedBy(event.target.value)} required className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100">
                        <option value="">Select operator</option>
                        {mergedOperatorOptions.map((operator) => (
                          <option key={`complaint-${operator}`} value={operator}>{operator}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Client email</label>
                      <input type="text" value={complaintClientEmail} onChange={(event) => setComplaintClientEmail(event.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Reason</label>
                      <input type="text" value={complaintNote} onChange={(event) => setComplaintNote(event.target.value)} className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100" />
                    </div>
                    <div className="flex items-end">
                      <button type="submit" disabled={complaintSaving} className="w-full rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                        {complaintSaving ? 'Saving…' : 'Log complaint'}
                      </button>
                    </div>
                  </form>

                  {complaints.length > 0 ? (
                    <div className="mt-5 overflow-x-auto rounded-2xl border border-gray-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left text-gray-600">
                          <tr>
                            <th className="px-4 py-3 font-medium">Day</th>
                            <th className="px-4 py-3 font-medium">Operator</th>
                            <th className="px-4 py-3 font-medium">Client</th>
                            <th className="px-4 py-3 font-medium">Reason</th>
                            <th className="px-4 py-3 font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {complaints.map((complaint) => (
                            <tr key={complaint._id} className="bg-red-50/30">
                              <td className="px-4 py-3 whitespace-nowrap">{complaint.dateYmd}</td>
                              <td className="px-4 py-3 font-medium text-gray-900">{complaint.addedBy}</td>
                              <td className="px-4 py-3 text-gray-600">{complaint.clientEmail || '—'}</td>
                              <td className="px-4 py-3 max-w-[340px] truncate text-gray-600" title={complaint.note}>{complaint.note || '—'}</td>
                              <td className="px-4 py-3">
                                <button type="button" onClick={() => deleteComplaint(complaint._id)} className="text-sm font-semibold text-red-600 hover:text-red-800">
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-3xl border border-gray-200 bg-white px-6 py-12 text-center text-sm text-gray-500 shadow-sm">
            {loading ? 'Loading report…' : 'Unable to load report.'}
          </div>
        )}

        {modalAdder ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={(event) => event.target === event.currentTarget && closeModal()}>
            <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{modalAdder}</h3>
                  <p className="mt-1 text-sm text-gray-500">{modalData.total} jobs · {modalData.uniqueClients} clients · {MODAL_PAGE_SIZE} rows per page</p>
                </div>
                <button type="button" onClick={closeModal} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden px-6 py-4">
                {modalLoading ? <p className="py-10 text-center text-sm text-gray-500">Loading jobs…</p> : <JobRowsTable jobs={modalData.jobs} />}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
                <p className="text-sm text-gray-600">Page {modalPage} of {Math.max(modalData.totalPages, 1)}</p>
                <div className="flex gap-2">
                  <button type="button" disabled={modalPage <= 1 || modalLoading} onClick={() => loadModalPage(modalPage - 1)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Previous</button>
                  <button type="button" disabled={modalPage >= modalData.totalPages || modalLoading || modalData.totalPages === 0} onClick={() => loadModalPage(modalPage + 1)} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40">Next</button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {dailyModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={(event) => event.target === event.currentTarget && closeDailyModal()}>
            <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl">
              <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{dailyModal.addedBy}</h3>
                  <p className="mt-1 text-sm text-gray-500">Daily payout breakdown · {dailyModal.rows.length} days · {DAILY_MODAL_PAGE_SIZE} rows per page</p>
                </div>
                <button type="button" onClick={closeDailyModal} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Close">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-6 py-4">
                <div className="overflow-x-auto rounded-xl border border-gray-200">
                  <table className="min-w-full text-xs sm:text-sm">
                    <thead className="bg-gray-50 text-left text-gray-600">
                      <tr>
                        <th className="px-3 py-2">Day</th>
                        <th className="px-3 py-2 text-right">Clients</th>
                        <th className="px-3 py-2 text-right">Jobs</th>
                        <th className="px-3 py-2 text-right">Avg</th>
                        <th className="px-3 py-2 text-right">₹</th>
                        <th className="px-3 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {dailyModal.rows
                        .slice((dailyModalPage - 1) * DAILY_MODAL_PAGE_SIZE, dailyModalPage * DAILY_MODAL_PAGE_SIZE)
                        .map((day) => {
                          const dayHasComplaint = complaintKeySet.has(`${day.dateYmd}|${dailyModal.addedBy}`);
                          return (
                            <tr key={`${dailyModal.addedBy}-${day.dateYmd}`} className={dayHasComplaint ? 'bg-red-50/70' : ''}>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-900">
                                {day.dateYmd}
                                {dayHasComplaint ? <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">Complaint</span> : null}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums">{day.clientsHandled || 0}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{day.totalJobs || 0}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatAverage(day.avgJobsPerClient)}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold">{day.incentive || 0}</td>
                              <td className="px-3 py-2 min-w-[240px]">
                                {day.eligible ? (
                                  <StatusBadge tone="good">Eligible</StatusBadge>
                                ) : (
                                  <span className="text-xs text-red-600">{day.gateReasons?.join(' · ') || 'Not eligible'}</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-6 py-4">
                <p className="text-sm text-gray-600">
                  Page {dailyModalPage} of {Math.max(Math.ceil(dailyModal.rows.length / DAILY_MODAL_PAGE_SIZE), 1)}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={dailyModalPage <= 1}
                    onClick={() => setDailyModalPage((prev) => prev - 1)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={dailyModalPage >= Math.ceil(dailyModal.rows.length / DAILY_MODAL_PAGE_SIZE)}
                    onClick={() => setDailyModalPage((prev) => prev + 1)}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {rejectModal ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" onClick={(event) => event.target === event.currentTarget && !rejectSaving && setRejectModal(null)}>
            <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-2xl">
              <h3 className="text-lg font-semibold text-gray-900">Reject incentive</h3>
              <p className="mt-1 text-sm text-gray-500">{rejectModal.addedBy} · {rejectModal.dateYmd} · {formatCurrency(rejectModal.incentiveAmount)}</p>
              <div className="mt-4">
                <label className="mb-1 block text-sm font-medium text-gray-700">Reason</label>
                <textarea
                  value={rejectReason}
                  onChange={(event) => setRejectReason(event.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100"
                  placeholder="Explain why this record should be rejected…"
                />
              </div>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={() => setRejectModal(null)} disabled={rejectSaving} className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
                <button type="button" onClick={rejectIncentive} disabled={rejectSaving || !rejectReason.trim()} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                  {rejectSaving ? 'Rejecting…' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
