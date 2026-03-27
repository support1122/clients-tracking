import React, { useState, useEffect, useMemo, useCallback, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_BASE || 'https://applications-monitor-api.flashfirejobs.com';

const MODAL_PAGE_SIZE = 15;

/** Local calendar YYYY-MM-DD (avoids UTC shift from toISOString). */
function toYmdLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Pull a readable "applied by …" snippet from job currentStatus (e.g. "applied by sohith"). */
function parseAppliedByLabel(currentStatus) {
  if (!currentStatus || typeof currentStatus !== 'string') return '—';
  const m = currentStatus.match(/\bapplied\s+by\s+(.+?)(?:\s*$|,)/i);
  if (m) return m[1].trim();
  if (/applied/i.test(currentStatus)) return currentStatus.trim();
  return '—';
}

function JobRowsTable({ jobs, dense }) {
  if (!jobs?.length) {
    return <p className="text-sm text-gray-500 py-2">No rows.</p>;
  }
  return (
    <div className={`overflow-x-auto ${dense ? '' : 'max-h-[50vh] overflow-y-auto'}`}>
      <table className="min-w-full text-sm">
        <thead className={dense ? '' : 'sticky top-0 bg-gray-100 z-10'}>
          <tr className="text-left text-gray-600">
            <th className={`${dense ? 'px-3 py-1.5' : 'px-3 py-2'} font-medium`}>Job</th>
            <th className={`${dense ? 'px-3 py-1.5' : 'px-3 py-2'} font-medium`}>Company</th>
            <th className={`${dense ? 'px-3 py-1.5' : 'px-3 py-2'} font-medium`}>Client</th>
            <th className={`${dense ? 'px-3 py-1.5' : 'px-3 py-2'} font-medium`}>Added</th>
            <th className={`${dense ? 'px-3 py-1.5' : 'px-3 py-2'} font-medium`}>Applied by</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => (
            <tr key={j._id || `${j.jobID}-${j.userID}`} className="border-t border-gray-200/80">
              <td className={`${dense ? 'px-3 py-1.5' : 'px-3 py-2'} text-gray-900 max-w-[200px] truncate`} title={j.jobTitle}>
                {j.jobTitle}
              </td>
              <td className={`${dense ? 'px-3 py-1.5' : 'px-3 py-2'} text-gray-700 max-w-[140px] truncate`} title={j.companyName}>
                {j.companyName}
              </td>
              <td className={`${dense ? 'px-3 py-1.5' : 'px-3 py-2'} text-gray-600 max-w-[160px] truncate text-xs`} title={j.userID}>
                {j.userID}
              </td>
              <td className={`${dense ? 'px-3 py-1.5' : 'px-3 py-2'} text-gray-500 whitespace-nowrap text-xs`}>
                {j.dateAdded || j.createdAt || '—'}
              </td>
              <td className={`${dense ? 'px-3 py-1.5' : 'px-3 py-2'} text-violet-700 font-medium text-xs max-w-[140px] truncate`} title={j.currentStatus || ''}>
                {parseAppliedByLabel(j.currentStatus)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const INCENTIVE_SLAB_ROWS = [
  { label: 'Under 20 jobs', value: '₹0' },
  { label: '20 – 29', value: '₹50 / day' },
  { label: '30 – 34', value: '₹70 / day' },
  { label: '35 – 39', value: '₹80 / day' },
  { label: '40+', value: '₹100 / day' },
];

export default function ExtensionJobsReport() {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [totalJobs, setTotalJobs] = useState(0);
  const [byAdder, setByAdder] = useState([]);
  const [incentiveByAdder, setIncentiveByAdder] = useState([]);
  const [samples, setSamples] = useState([]);

  const [complaints, setComplaints] = useState([]);
  const [complaintDateYmd, setComplaintDateYmd] = useState('');
  const [complaintAddedBy, setComplaintAddedBy] = useState('');
  const [complaintClientEmail, setComplaintClientEmail] = useState('');
  const [complaintNote, setComplaintNote] = useState('');
  const [complaintSaving, setComplaintSaving] = useState(false);

  const [expandedAdder, setExpandedAdder] = useState(null);
  const [previewByAdder, setPreviewByAdder] = useState({});
  const [previewLoading, setPreviewLoading] = useState(null);

  const [modalAdder, setModalAdder] = useState(null);
  const [modalPage, setModalPage] = useState(1);
  const [modalData, setModalData] = useState({
    jobs: [],
    total: 0,
    totalPages: 0,
    uniqueClients: 0,
  });
  const [modalLoading, setModalLoading] = useState(false);

  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('authToken') : null;

  useEffect(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    setEndDate(toYmdLocal(end));
    setStartDate(toYmdLocal(start));
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        if (u?.role !== 'admin') {
          navigate('/admin-dashboard', { replace: true });
        }
      } catch {
        navigate('/', { replace: true });
      }
    }
  }, [navigate]);

  const setQuickToday = useCallback(() => {
    const t = toYmdLocal(new Date());
    setStartDate(t);
    setEndDate(t);
  }, []);

  const setQuickLast7 = useCallback(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 6);
    setStartDate(toYmdLocal(start));
    setEndDate(toYmdLocal(end));
  }, []);

  const setQuickLastMonth = useCallback(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    setStartDate(toYmdLocal(start));
    setEndDate(toYmdLocal(end));
  }, []);

  const fetchComplaints = useCallback(async () => {
    if (!startDate || !endDate || !token) return;
    try {
      const params = new URLSearchParams({ startYmd: startDate, endYmd: endDate });
      const res = await fetch(`${API_BASE}/api/admin/extension-incentive-complaints?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.complaints)) setComplaints(data.complaints);
      else setComplaints([]);
    } catch {
      setComplaints([]);
    }
  }, [startDate, endDate, token]);

  const fetchReport = async () => {
    if (!startDate || !endDate) {
      setError('Choose a start and end date.');
      return;
    }
    if (!token) {
      setError('Not signed in.');
      return;
    }
    setError('');
    setLoading(true);
    setExpandedAdder(null);
    setPreviewByAdder({});
    try {
      const params = new URLSearchParams({ startDate, endDate });
      const res = await fetch(`${API_BASE}/api/admin/extension-jobs-report?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        setError(data?.error || 'Access denied. Admin only.');
        setByAdder([]);
        setIncentiveByAdder([]);
        setSamples([]);
        setTotalJobs(0);
        return;
      }
      if (!res.ok) {
        setError(data?.error || 'Failed to load report');
        setByAdder([]);
        setIncentiveByAdder([]);
        setSamples([]);
        setTotalJobs(0);
        return;
      }
      setTotalJobs(data.totalJobs || 0);
      setByAdder(Array.isArray(data.byAdder) ? data.byAdder : []);
      setIncentiveByAdder(Array.isArray(data.incentiveByAdder) ? data.incentiveByAdder : []);
      setSamples(Array.isArray(data.samples) ? data.samples : []);
      await fetchComplaints();
    } catch (e) {
      console.error(e);
      setError('Network error');
      setByAdder([]);
      setIncentiveByAdder([]);
      setSamples([]);
      setTotalJobs(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startDate && endDate && token) {
      fetchReport();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  useEffect(() => {
    if (startDate) setComplaintDateYmd(startDate);
  }, [startDate]);

  const submitComplaint = async (e) => {
    e.preventDefault();
    if (!complaintDateYmd || !complaintAddedBy.trim() || !token) return;
    setComplaintSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/extension-incentive-complaints`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateYmd: complaintDateYmd,
          addedBy: complaintAddedBy.trim(),
          clientEmail: complaintClientEmail.trim(),
          note: complaintNote.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed');
      setComplaintNote('');
      setComplaintClientEmail('');
      await fetchReport();
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to save complaint');
    } finally {
      setComplaintSaving(false);
    }
  };

  const deleteComplaint = async (id) => {
    if (!token || !id) return;
    if (!window.confirm('Remove this complaint flag?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/extension-incentive-complaints/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed');
      await fetchReport();
    } catch (err) {
      console.error(err);
      setError('Failed to delete complaint');
    }
  };

  const fetchJobsByAdder = useCallback(
    async (addedBy, page, limit) => {
      const params = new URLSearchParams({
        startDate,
        endDate,
        addedBy,
        page: String(page),
        limit: String(limit),
      });
      const res = await fetch(`${API_BASE}/api/admin/extension-jobs-report/jobs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Failed to load jobs');
      return data;
    },
    [startDate, endDate, token]
  );

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
    } catch (e) {
      console.error(e);
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
    } catch (e) {
      console.error(e);
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
    } catch (e) {
      console.error(e);
    } finally {
      setModalLoading(false);
    }
  };

  const closeModal = () => {
    setModalAdder(null);
    setModalPage(1);
    setModalData({ jobs: [], total: 0, totalPages: 0, uniqueClients: 0 });
  };

  const maxCount = useMemo(() => {
    if (!byAdder.length) return 1;
    return Math.max(...byAdder.map((r) => r.count || 0), 1);
  }, [byAdder]);

  const totalIncentiveRange = useMemo(
    () => incentiveByAdder.reduce((s, x) => s + (x.totalIncentive || 0), 0),
    [incentiveByAdder]
  );

  const incentiveDailyMap = useMemo(() => {
    const m = new Map();
    for (const x of incentiveByAdder) {
      m.set(x.addedBy, x.daily || []);
    }
    return m;
  }, [incentiveByAdder]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-orange-50/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Extension jobs report
            </h1>
            <p className="mt-1 text-gray-600 text-sm sm:text-base max-w-2xl">
              Jobs added through the FlashFire extension, grouped by operator (<span className="font-medium">addedBy</span>).
              Dates use parsed timestamps in IST so filters match the &quot;Added&quot; column. Daily incentive applies only when
              all jobs that day are before 1:00 PM IST, average applications per client is at least 20, and no complaint is
              logged for that operator-day.
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/monitor-clients')}
            className="self-start px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            ← Back to portal
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Date range</h2>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Quick filters</span>
            <button
              type="button"
              onClick={setQuickToday}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-50 text-orange-800 border border-orange-200 hover:bg-orange-100"
            >
              Today
            </button>
            <button
              type="button"
              onClick={setQuickLast7}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200"
            >
              Last 7 days
            </button>
            <button
              type="button"
              onClick={setQuickLastMonth}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-800 border border-slate-200 hover:bg-slate-200"
            >
              Last calendar month
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={fetchReport}
              disabled={loading}
              className="px-5 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>

        {startDate && endDate && !loading && !error && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <p className="text-sm text-gray-500">Total extension jobs (range)</p>
                <p className="text-3xl font-bold text-orange-600 mt-1">{totalJobs}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm">
                <p className="text-sm text-gray-500">Distinct operators</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{byAdder.length}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-sm md:col-span-2">
                <p className="text-sm text-gray-500">Total incentive (range, eligible days)</p>
                <p className="text-3xl font-bold text-emerald-700 mt-1">₹{totalIncentiveRange.toLocaleString('en-IN')}</p>
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-6 mb-8 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-2">Incentive (polished)</h3>
              <p className="text-sm text-gray-600 mb-4">
                Tier is based on <span className="font-semibold">total jobs added that calendar day (IST)</span> for the operator,
                after gates pass. Any complaint flag for that operator on that day zeros incentive for that day.
              </p>
              <div className="overflow-x-auto rounded-xl border border-amber-100 bg-white/80">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-600">
                      <th className="px-4 py-3 font-semibold">Jobs that day (IST)</th>
                      <th className="px-4 py-3 font-semibold">Incentive</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {INCENTIVE_SLAB_ROWS.map((r) => (
                      <tr key={r.label} className="hover:bg-amber-50/50">
                        <td className="px-4 py-2.5 text-gray-900">{r.label}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 mb-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Record complaint (zeros that day&apos;s incentive)</h3>
              <p className="text-sm text-gray-500 mb-4">
                Flags the operator + calendar day (IST). Re-run refresh after adding; incentive recalculates automatically.
              </p>
              <form onSubmit={submitComplaint} className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Day (IST)</label>
                  <input
                    type="date"
                    value={complaintDateYmd}
                    onChange={(e) => setComplaintDateYmd(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Operator (addedBy)</label>
                  <input
                    type="text"
                    value={complaintAddedBy}
                    onChange={(e) => setComplaintAddedBy(e.target.value)}
                    placeholder="e.g. sarah@flashfirehq"
                    className="border rounded-lg px-3 py-2 text-sm w-56 max-w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Client email (optional)</label>
                  <input
                    type="text"
                    value={complaintClientEmail}
                    onChange={(e) => setComplaintClientEmail(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm w-48 max-w-full"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-gray-500 mb-1">Note</label>
                  <input
                    type="text"
                    value={complaintNote}
                    onChange={(e) => setComplaintNote(e.target.value)}
                    className="border rounded-lg px-3 py-2 text-sm w-full"
                  />
                </div>
                <button
                  type="submit"
                  disabled={complaintSaving}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
                >
                  {complaintSaving ? 'Saving…' : 'Log complaint'}
                </button>
              </form>
              {complaints.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="text-left text-gray-500 border-b">
                        <th className="py-2 pr-2">Date</th>
                        <th className="py-2 pr-2">Operator</th>
                        <th className="py-2 pr-2">Client</th>
                        <th className="py-2 pr-2">Note</th>
                        <th className="py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {complaints.map((c) => (
                        <tr key={c._id} className="border-t border-gray-100">
                          <td className="py-2 pr-2 whitespace-nowrap">{c.dateYmd}</td>
                          <td className="py-2 pr-2">{c.addedBy}</td>
                          <td className="py-2 pr-2">{c.clientEmail || '—'}</td>
                          <td className="py-2 pr-2 max-w-xs truncate" title={c.note}>
                            {c.note || '—'}
                          </td>
                          <td className="py-2">
                            <button
                              type="button"
                              onClick={() => deleteComplaint(c._id)}
                              className="text-red-600 hover:underline"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mb-8">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">By operator name</h2>
                <p className="text-sm text-gray-500">
                  Click a name to expand (latest 5 + daily incentive). Use <span className="font-medium">View all</span> for
                  full list with pages.
                </p>
              </div>
              {byAdder.length === 0 ? (
                <p className="p-8 text-gray-500 text-center">No jobs with an extension operator name in this range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-600">
                        <th className="px-6 py-3 font-medium w-10" aria-hidden />
                        <th className="px-6 py-3 font-medium">Operator (addedBy)</th>
                        <th className="px-6 py-3 font-medium text-right" title="Distinct client emails (userID) in this date range">
                          Unique clients
                        </th>
                        <th className="px-6 py-3 font-medium text-right">Jobs</th>
                        <th className="px-6 py-3 font-medium text-right">Incentive (₹)</th>
                        <th className="px-6 py-3 font-medium">Share</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byAdder.map((row) => {
                        const pct = totalJobs ? Math.round((row.count / totalJobs) * 1000) / 10 : 0;
                        const barPct = (row.count / maxCount) * 100;
                        const isOpen = expandedAdder === row.addedBy;
                        const inc = row.incentiveTotal ?? 0;
                        const daily = incentiveDailyMap.get(row.addedBy) || [];
                        return (
                          <Fragment key={row.addedBy}>
                            <tr className="border-t border-gray-100 hover:bg-gray-50/80">
                              <td className="px-2 py-2 text-center align-middle">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(row.addedBy)}
                                  className="p-1.5 rounded-md text-gray-500 hover:bg-gray-200/80 hover:text-gray-800 transition-colors"
                                  aria-expanded={isOpen}
                                  aria-label={isOpen ? 'Collapse' : 'Expand'}
                                >
                                  <svg
                                    className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(row.addedBy)}
                                  className="font-medium text-gray-900 text-left hover:text-orange-700 focus:outline-none focus:underline"
                                >
                                  {row.addedBy}
                                </button>
                              </td>
                              <td className="px-6 py-3 text-right tabular-nums text-gray-800">
                                {row.uniqueClients ?? '—'}
                              </td>
                              <td className="px-6 py-3 text-right tabular-nums text-gray-800">{row.count}</td>
                              <td className="px-6 py-3 text-right tabular-nums font-semibold text-emerald-800">₹{inc}</td>
                              <td className="px-6 py-3 w-48">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-orange-500 rounded-full transition-all"
                                      style={{ width: `${barPct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-500 w-12 text-right">{pct}%</span>
                                </div>
                              </td>
                            </tr>
                            {isOpen && (
                              <tr className="bg-slate-50/90 border-t border-gray-100">
                                <td colSpan={6} className="px-4 sm:px-8 py-4 space-y-4">
                                  {daily.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                        Daily incentive (IST days in range)
                                      </p>
                                      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
                                        <table className="min-w-full text-xs">
                                          <thead>
                                            <tr className="bg-gray-50 text-left text-gray-600">
                                              <th className="px-3 py-2">Day</th>
                                              <th className="px-3 py-2 text-right">Jobs</th>
                                              <th className="px-3 py-2 text-right">Clients</th>
                                              <th className="px-3 py-2 text-right">Avg/client</th>
                                              <th className="px-3 py-2 text-center">Before 1 PM</th>
                                              <th className="px-3 py-2 text-right">₹</th>
                                              <th className="px-3 py-2">Status</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-100">
                                            {daily.map((d) => (
                                              <tr key={d.dateYmd}>
                                                <td className="px-3 py-2 whitespace-nowrap">{d.dateYmd}</td>
                                                <td className="px-3 py-2 text-right">{d.totalJobs}</td>
                                                <td className="px-3 py-2 text-right">{d.uniqueClients}</td>
                                                <td className="px-3 py-2 text-right">{d.avgPerClient}</td>
                                                <td className="px-3 py-2 text-center">{d.allBefore1pm ? 'Yes' : 'No'}</td>
                                                <td className="px-3 py-2 text-right font-semibold">{d.incentive}</td>
                                                <td className="px-3 py-2 text-gray-700">
                                                  {d.eligible ? (
                                                    <span className="text-emerald-700">Eligible</span>
                                                  ) : (
                                                    <span className="text-red-700">{d.gateReasons?.join(' · ') || '—'}</span>
                                                  )}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )}
                                  {previewLoading === row.addedBy ? (
                                    <p className="text-sm text-gray-500">Loading…</p>
                                  ) : (
                                    <>
                                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                        Latest 5 in range (newest first)
                                      </p>
                                      <JobRowsTable jobs={previewByAdder[row.addedBy] || []} dense />
                                      {(row.count || 0) > 5 && (
                                        <div className="mt-3 flex justify-end">
                                          <button
                                            type="button"
                                            onClick={() => openModal(row.addedBy)}
                                            className="text-sm font-medium text-orange-700 hover:text-orange-900 px-3 py-1.5 rounded-lg border border-orange-200 bg-white hover:bg-orange-50"
                                          >
                                            View all · {row.count} jobs
                                          </button>
                                        </div>
                                      )}
                                    </>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="text-lg font-semibold text-gray-900">Recent jobs in range</h2>
                <p className="text-sm text-gray-500">Up to 50 rows, newest by added time first</p>
              </div>
              {samples.length === 0 ? (
                <p className="p-8 text-gray-500 text-center">No sample rows.</p>
              ) : (
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto p-2">
                  <JobRowsTable jobs={samples} dense={false} />
                </div>
              )}
            </div>
          </>
        )}

        {modalAdder && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="extension-modal-title"
            onClick={(e) => e.target === e.currentTarget && closeModal()}
          >
            <div className="bg-white rounded-2xl shadow-xl max-w-5xl w-full max-h-[90vh] flex flex-col border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
                <div>
                  <h2 id="extension-modal-title" className="text-lg font-semibold text-gray-900">
                    Jobs by {modalAdder}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {modalData.total} job{modalData.total !== 1 ? 's' : ''} in selected range ·{' '}
                    {modalData.uniqueClients} unique client
                    {modalData.uniqueClients !== 1 ? 's' : ''} · {MODAL_PAGE_SIZE} per page
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-hidden flex flex-col px-6 py-4 min-h-0">
                {modalLoading ? (
                  <div className="flex justify-center py-12 text-gray-500">Loading…</div>
                ) : (
                  <JobRowsTable jobs={modalData.jobs} dense={false} />
                )}
              </div>
              <div className="px-6 py-4 border-t border-gray-100 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-gray-600">
                  Page {modalPage} of {Math.max(modalData.totalPages, 1)}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={modalPage <= 1 || modalLoading}
                    onClick={() => loadModalPage(modalPage - 1)}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={modalPage >= modalData.totalPages || modalLoading || modalData.totalPages === 0}
                    onClick={() => loadModalPage(modalPage + 1)}
                    className="px-4 py-2 text-sm rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
