import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Layout from './Layout';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { Pencil, X, Loader2 } from 'lucide-react';
import {
  buildDashboardManagerSelectOptions,
  selectValueMatchingOption
} from '../utils/dashboardManagerSelect.js';
import { fetchDashboardManagerFullNames } from '../utils/fetchDashboardManagerCatalog.js';

const API_BASE = import.meta.env.VITE_BASE || 'https://clients-tracking-backend.onrender.com';
const AUTH_HEADERS = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
});

/** Capitalize first letter of operator name (e.g. sonali -> Sonali, raj deep -> Raj deep). */
function capitalizeOperatorName(name) {
  if (!name || typeof name !== 'string') return '';
  const t = name.trim();
  if (!t) return '';
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Format client display as number-name-plan (e.g. 5711-akrati-executive). Optimal: single pass, handles missing fields. */
function formatClientLabel(row) {
  const num = row.clientNumber != null && row.clientNumber !== '' ? String(row.clientNumber) : '';
  const nameRaw = row.name || row.email || '';
  const nameSlug = (nameRaw.split(/\s+/)[0] || nameRaw.split('@')[0] || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') || 'unknown';
  const plan = (row.planType || '').toLowerCase().replace(/\s+/g, '') || 'unknown';
  const parts = num ? [num, nameSlug, plan] : [nameSlug, plan];
  return parts.join('-') || nameRaw || row.email || '-';
}

export default function ClientJobAnalysis() {
  const [date, setDate] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortDir, setSortDir] = useState('desc');
  const [dashboardManagerNames, setDashboardManagerNames] = useState([]);
  const [savingDashboardManager, setSavingDashboardManager] = useState(new Set());
  const [savingStatus, setSavingStatus] = useState(new Set());
  const [savingPause, setSavingPause] = useState(new Set());
  const [userRole, setUserRole] = useState(null);
  const [lastAppliedByFilter, setLastAppliedByFilter] = useState(''); // Filter for "Last applied by" operator name
  const [editingClientNumberEmail, setEditingClientNumberEmail] = useState(null);
  const [editingClientNumberValue, setEditingClientNumberValue] = useState('');
  const [savingClientNumber, setSavingClientNumber] = useState(false);
  const [summaryCounts, setSummaryCounts] = useState({ active: 0, inactive: 0, new: 0, paused: 0, unpaused: 0 });
  const lastAppliedRef = useRef({}); // Canonical lastAppliedOperatorName from initial (no-date) load

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    setUserRole(user?.role || null);
  }, []);

  const convertToDMY = useCallback((iso) => {
    if (!iso) return '';
    const dt = new Date(iso);
    const d = dt.getDate();
    const m = dt.getMonth() + 1;
    const y = dt.getFullYear();
    return `${d}/${m}/${y}`;
  }, []);

  const fetchAnalysis = useCallback(async (selected) => {
    setLoading(true);
    try {
      const body = selected ? { date: convertToDMY(selected) } : {};
      const resp = await fetch(`${API_BASE}/api/analytics/client-job-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store'
      });
      if (!resp.ok) throw new Error('Failed');
      const data = await resp.json();
      const newRows = data.rows || [];

      if (!selected) {
        // Initial load (no date filter): capture canonical lastAppliedOperatorName
        const map = {};
        newRows.forEach(r => { map[r.email] = r.lastAppliedOperatorName || ''; });
        lastAppliedRef.current = map;
        setRows(newRows);
      } else {
        // Date-filtered refresh: preserve lastAppliedOperatorName from initial load
        setRows(newRows.map(r => ({
          ...r,
          lastAppliedOperatorName: lastAppliedRef.current[r.email] ?? r.lastAppliedOperatorName ?? ''
        })));
      }

      if (data.summary) setSummaryCounts(data.summary);
    } catch (e) {
      toast.error('Failed to load client job analysis');
    } finally {
      setLoading(false);
    }
  }, [convertToDMY]);

  const handleSaveClientNumber = useCallback(async () => {
    if (!editingClientNumberEmail || userRole !== 'admin') return;
    const val = String(editingClientNumberValue || '').trim();
    setSavingClientNumber(true);
    try {
      const res = await fetch(`${API_BASE}/api/clients/${encodeURIComponent(editingClientNumberEmail)}/client-number`, {
        method: 'PATCH',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({ clientNumber: val ? parseInt(val, 10) : null })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      toast.success('Client number updated');
      setEditingClientNumberEmail(null);
      setEditingClientNumberValue('');
      fetchAnalysis(date);
    } catch (e) {
      toast.error(e.message || 'Failed');
    } finally {
      setSavingClientNumber(false);
    }
  }, [editingClientNumberEmail, editingClientNumberValue, userRole, date, fetchAnalysis]);

  useEffect(() => {
    (async () => {
      try {
        const names = await fetchDashboardManagerFullNames(API_BASE, AUTH_HEADERS);
        setDashboardManagerNames(names);
      } catch (e) {
        console.error('Failed to load dashboard managers (same source as Manager Dashboard):', e);
      }
    })();
  }, []);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  const dashboardSelectOptions = useMemo(
    () =>
      buildDashboardManagerSelectOptions(
        dashboardManagerNames,
        rows.map((r) => r.dashboardTeamLeadName)
      ),
    [dashboardManagerNames, rows]
  );

  const onRefresh = () => fetchAnalysis(date);

  const findAppliedOnDate = useCallback(async () => {
    if (!date) {
      toast.error('Pick a date first');
      return;
    }
    try {
      const body = { date: convertToDMY(date) };
      const resp = await fetch(`${API_BASE}/api/analytics/applied-by-date`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error('Failed');
      const data = await resp.json();
      const map = data.counts || {};
      // Merge counts into current rows optimally without extra fetch
      setRows(prev => (prev || []).map(r => ({ ...r, appliedOnDate: Number(map[r.email] || 0) })));
      toast.success(`Updated applied-on-date for ${Object.keys(map).length} client(s)`);
    } catch (e) {
      toast.error('Failed to fetch applied-on-date');
    }
  }, [date, convertToDMY]);

  const handleDashboardManagerChange = async (email, dashboardTeamLeadName) => {
    if (userRole !== 'admin') {
      toast.error('Only admins can change Dashboard Manager');
      return;
    }
    setSavingDashboardManager(prev => new Set(prev).add(email));
    try {
      const resp = await fetch(`${API_BASE}/api/clients/update-dashboard-team-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, dashboardTeamLeadName })
      });
      if (!resp.ok) throw new Error('Failed to save');
      const data = await resp.json();
      if (data.success) {
        // Update the row in state
        setRows(prev => prev.map(r =>
          r.email === email ? { ...r, dashboardTeamLeadName } : r
        ));
        toast.success('Dashboard Manager updated successfully');
      }
    } catch (e) {
      toast.error('Failed to update dashboard manager');
    } finally {
      setSavingDashboardManager(prev => {
        const next = new Set(prev);
        next.delete(email);
        return next;
      });
    }
  };

  const handleStatusChange = async (email, status) => {
    if (userRole !== 'admin') {
      toast.error('Only admins can change client status');
      return;
    }

    setSavingStatus(prev => new Set(prev).add(email));
    try {
      const resp = await fetch(`${API_BASE}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, status, currentPath: window.location.pathname })
      });
      if (!resp.ok) throw new Error('Failed to save');
      const data = await resp.json();
      if (data.message || data.updatedClientsTracking) {
        setRows(prev => prev.map(r =>
          r.email === email ? { ...r, status } : r
        ));
        fetchAnalysis();
        toast.success('Client status updated successfully');
      }
    } catch (e) {
      toast.error('Failed to update client status');
    } finally {
      setSavingStatus(prev => {
        const next = new Set(prev);
        next.delete(email);
        return next;
      });
    }
  }

  /** value: 'new' | 'paused' | 'unpaused'. New = onboarding phase (no reminders); Paused = paused; Unpaused = active reminders. */
  const handlePhasePauseChange = async (email, value) => {
    if (userRole !== 'admin') {
      toast.error('Only admins can change client phase/pause status');
      return;
    }
    const onboardingPhase = value === 'new';
    const isPaused = value === 'new' || value === 'paused';

    setSavingPause(prev => new Set(prev).add(email));
    try {
      const resp = await fetch(`${API_BASE}/api/clients`, {
        method: 'POST',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({ email, isPaused, onboardingPhase, currentPath: window.location.pathname })
      });
      if (!resp.ok) throw new Error('Failed to save');
      const data = await resp.json();
      if (data.message || data.updatedClientsTracking) {
        setRows(prev => prev.map(r =>
          r.email === email ? { ...r, isPaused, onboardingPhase } : r
        ));
        fetchAnalysis();
        const msg = value === 'new' ? 'Client set to New (onboarding phase)' : value === 'paused' ? 'Client paused' : 'Client unpaused';
        toast.success(msg);
      }
    } catch (e) {
      toast.error('Failed to update phase/pause status');
    } finally {
      setSavingPause(prev => {
        const next = new Set(prev);
        next.delete(email);
        return next;
      });
    }
  };

  // Memoize unique operator names for filter dropdown
  const uniqueOperatorNames = useMemo(
    () => [...new Set(rows.map(r => r.lastAppliedOperatorName).filter(Boolean))].sort(),
    [rows]
  );

  // Get sorting number (same logic as Client Onboarding)
  const getSortingNumber = useCallback((r) => {
    if (r.clientNumber != null) return Number(r.clientNumber);
    const name = r.name || '';
    const m = name.match(/^(\d{4,})/);
    if (m) return parseInt(m[1], 10);
    const m2 = name.match(/^(\d+)/);
    if (m2) return parseInt(m2[1], 10);
    return 0;
  }, []);

  // Memoize filtered + sorted rows: active first, then by clientNumber ascending (same as Client Onboarding)
  const processedRows = useMemo(() => {
    let filtered = rows;
    if (lastAppliedByFilter) {
      const filterLower = lastAppliedByFilter.toLowerCase();
      filtered = rows.filter(r => (r.lastAppliedOperatorName || '').toLowerCase() === filterLower);
    }
    return [...filtered].sort((a, b) => {
      if (date) {
        const av = Number(a?.appliedOnDate || 0);
        const bv = Number(b?.appliedOnDate || 0);
        const cmp = sortDir === 'asc' ? av - bv : bv - av;
        if (cmp !== 0) return cmp;
      }
      const statusOrder = { 'active': 0, 'inactive': 1 };
      const statusA = statusOrder[a.status] ?? 2;
      const statusB = statusOrder[b.status] ?? 2;
      if (statusA !== statusB) return statusA - statusB;
      const numA = getSortingNumber(a);
      const numB = getSortingNumber(b);
      return numA - numB;
    });
  }, [rows, date, sortDir, lastAppliedByFilter, getSortingNumber]);

  const isAdmin = userRole === 'admin';

  return (
    <Layout>
      <div className="p-6 w-full">

        {/* Summary from DB (dashboardtrackings): Active, Inactive, New, Paused, Unpaused */}
        {isAdmin && (
          <div className="px-4 py-2 flex items-center gap-6 flex-wrap">
            <span className="text-sm font-medium text-gray-700">
              <span className="text-green-600 font-semibold">{summaryCounts.active}</span> Active
            </span>
            <span className="text-sm font-medium text-gray-700">
              <span className="text-red-600 font-semibold">{summaryCounts.inactive}</span> Inactive
            </span>
            <span className="text-sm font-medium text-gray-700">
              <span className="text-slate-600 font-semibold">{summaryCounts.new}</span> New
            </span>
            <span className="text-sm font-medium text-gray-700">
              <span className="text-yellow-600 font-semibold">{summaryCounts.paused}</span> Paused
            </span>
            <span className="text-sm font-medium text-gray-700">
              <span className="text-emerald-600 font-semibold">{summaryCounts.unpaused}</span> Unpaused
            </span>
          </div>
        )}

        <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3 flex-wrap">
          <h1 className="text-xl font-semibold text-gray-900">Client Job Analysis</h1>
          <div className="ml-auto flex items-center gap-2 flex-wrap">
            <label className="text-xs text-gray-700">Select Date:</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-2 py-1 text-xs border border-gray-300 rounded-md"
            />
            <button
              onClick={findAppliedOnDate}
              className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              Find Applied
            </button>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            {/* <Link to="/call-scheduler" className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700">Call Scheduler</Link> */}
          </div>
        </div>
        <div className="px-4 py-3 overflow-x-auto">
          <table className="w-full divide-y divide-gray-200 text-xs">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Client</th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Status</th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Pause/Unpause/New</th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Paused</th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Plan</th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                  <div className="flex items-center gap-2">
                    <span>Last applied by</span>
                    <select
                      value={lastAppliedByFilter}
                      onChange={(e) => setLastAppliedByFilter(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="px-1.5 py-0.5 text-[10px] border border-gray-300 rounded-md bg-white hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      title="Filter by operator"
                    >
                      <option value="">All</option>
                      {uniqueOperatorNames.map((name) => (
                        <option key={name} value={name}>
                          {capitalizeOperatorName(name)}
                        </option>
                      ))}
                    </select>
                    {lastAppliedByFilter && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLastAppliedByFilter('');
                        }}
                        className="px-1 py-0.5 text-[10px] text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded border border-gray-300"
                        title="Clear filter"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Dashboard Mgr</th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Total Apps</th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Saved</th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Applied</th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Interview</th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Offer</th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Rejected</th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Removed</th>
                <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {date ? `Applied on ${convertToDMY(date)}` : 'Applied on Date'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'))}
                      title={`Sort ${sortDir === 'asc' ? 'descending' : 'ascending'}`}
                      className="px-1.5 py-0.5 text-[10px] border border-gray-300 rounded-md bg-white hover:bg-gray-50"
                    >
                      {sortDir === 'asc' ? '▲' : '▼'}
                    </button>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y divide-gray-100 ${loading && processedRows.length > 0 ? 'opacity-50 pointer-events-none' : ''}`}>
              {loading && processedRows.length === 0 ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skel-${i}`} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2 py-2"><div className="space-y-1.5"><div className="h-3.5 bg-gray-200 rounded animate-pulse w-28" /><div className="h-2.5 bg-gray-100 rounded animate-pulse w-36" /></div></td>
                    <td className="px-2 py-2"><div className="h-5 bg-gray-200 rounded animate-pulse w-16" /></td>
                    <td className="px-2 py-2"><div className="h-5 bg-gray-200 rounded animate-pulse w-20" /></td>
                    <td className="px-2 py-2"><div className="h-5 bg-amber-200/80 rounded animate-pulse w-14" /></td>
                    <td className="px-2 py-2"><div className="h-5 bg-gray-200 rounded animate-pulse w-16" /></td>
                    <td className="px-2 py-2"><div className="h-3.5 bg-gray-200 rounded animate-pulse w-20" /></td>
                    <td className="px-2 py-2"><div className="h-5 bg-gray-200 rounded animate-pulse w-24" /></td>
                    <td className="px-2 py-2"><div className="h-3.5 bg-gray-200 rounded animate-pulse w-10 ml-auto" /></td>
                    <td className="px-2 py-2"><div className="h-3.5 bg-gray-200 rounded animate-pulse w-8 ml-auto" /></td>
                    <td className="px-2 py-2"><div className="h-3.5 bg-gray-200 rounded animate-pulse w-8 ml-auto" /></td>
                    <td className="px-2 py-2"><div className="h-3.5 bg-gray-200 rounded animate-pulse w-8 ml-auto" /></td>
                    <td className="px-2 py-2"><div className="h-3.5 bg-gray-200 rounded animate-pulse w-8 ml-auto" /></td>
                    <td className="px-2 py-2"><div className="h-3.5 bg-gray-200 rounded animate-pulse w-8 ml-auto" /></td>
                    <td className="px-2 py-2"><div className="h-3.5 bg-gray-200 rounded animate-pulse w-8 ml-auto" /></td>
                    <td className="px-2 py-2"><div className="h-3.5 bg-gray-200 rounded animate-pulse w-10 ml-auto" /></td>
                  </tr>
                ))
              ) : processedRows.length === 0 ? (
                <tr>
                  <td colSpan={15} className="px-2 py-8 text-center text-gray-500 text-sm">
                    {lastAppliedByFilter ? 'No clients found for selected operator' : 'No data'}
                  </td>
                </tr>
              ) : processedRows.map((r, idx) => {
                // Total applications = saved + applied + interviewing + offer + rejected (removed is excluded)
                const totalApplications = (Number(r.saved || 0) + Number(r.applied || 0) + Number(r.interviewing || 0) + Number(r.offer || 0) + Number(r.rejected || 0));
                const plan = String(r.planType || '').trim().toLowerCase();
                const isPrime = plan.includes('prime');
                const isIgnite = plan.includes('ignite');
                const isProfessional = plan.includes('professional');
                const isExecutive = plan.includes('executive');

                const planLimit = isPrime ? 160 : isIgnite ? 250 : isProfessional ? 500 : isExecutive ? 1000 : Infinity;
                const addonLimit = Number(r.addonLimit || 0);
                const referralBonus = Number(r.referralApplicationsAdded || 0);
                const totalLimit = planLimit + addonLimit + referralBonus;
                const exceeded = totalLimit !== Infinity && totalApplications > totalLimit;

                // Normalize status: API/legacy rows may omit status or use different casing — must match select value and colors.
                const normalizedClientStatus = (() => {
                  const s = r.status;
                  if (s === undefined || s === null || String(s).trim() === '') return 'active';
                  const low = String(s).toLowerCase().trim();
                  return low === 'inactive' ? 'inactive' : 'active';
                })();
                const isClientRowActive = normalizedClientStatus === 'active';

                const isActiveWithNoSaved = isClientRowActive && Number(r.saved || 0) === 0;

                let rowColor;
                if (exceeded) {
                  rowColor = 'bg-red-100';
                } else if (isActiveWithNoSaved) {
                  rowColor = 'bg-orange-100';
                } else {
                  rowColor = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50';
                }

                return (
                  <tr key={r.email + idx} className={rowColor}>
                    <td className="px-2 py-1">
                      <div className="flex items-center gap-1.5 max-w-[180px]">
                        <div className="text-gray-900 font-medium truncate min-w-0 flex-1" title={r.email}>
                          {formatClientLabel(r)}
                        </div>
                      </div>
                      <div className="text-gray-500 text-[10px] truncate max-w-[180px]">{r.email}</div>
                    </td>
                    <td className="px-2 py-1">
                      {userRole === 'admin' ? (
                        <select
                          value={normalizedClientStatus}
                          onChange={(e) => handleStatusChange(r.email, e.target.value)}
                          disabled={savingStatus.has(r.email)}
                          className={`px-2 py-1 text-[11px] border rounded-md text-xs font-semibold shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${isClientRowActive ? 'bg-green-100 text-green-700 border-green-300' :
                            'bg-red-100 text-red-700 border-red-300'
                            }`}
                        >
                          <option value="active">Active</option>
                          <option value="inactive">Inactive</option>
                        </select>
                      ) : r.status !== undefined && r.status !== null && String(r.status).trim() !== '' ? (
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${isClientRowActive ? 'bg-green-100 text-green-700' :
                          'bg-red-100 text-red-700'
                          }`}>
                          {isClientRowActive ? 'Active' : 'Inactive'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold bg-green-100 text-green-700">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {(() => {
                        const phaseValue = r.onboardingPhase ? 'new' : r.isPaused ? 'paused' : 'unpaused';
                        const phaseLabel = phaseValue === 'new' ? 'New' : phaseValue === 'paused' ? 'Paused' : 'Unpaused';
                        return userRole === 'admin' ? (
                          <select
                            value={phaseValue}
                            onChange={(e) => handlePhasePauseChange(r.email, e.target.value)}
                            disabled={savingPause.has(r.email)}
                            className={`px-2 py-1 text-[11px] border rounded-md text-xs font-semibold shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed ${phaseValue === 'new' ? 'bg-slate-100 text-slate-700 border-slate-300' :
                              phaseValue === 'paused' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
                                'bg-green-50 text-green-700 border-green-200'
                              }`}
                          >
                            <option value="new">New</option>
                            <option value="paused">Paused</option>
                            <option value="unpaused">Unpaused</option>
                          </select>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${phaseValue === 'new' ? 'bg-slate-100 text-slate-700' :
                            phaseValue === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-green-50 text-green-700'
                            }`}>
                            {phaseLabel}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-1">
                      {loading && r.isPaused && !r.onboardingPhase ? (
                        <div className="h-4 w-12 rounded bg-amber-100 animate-pulse" />
                      ) : r.isPaused && !r.onboardingPhase ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex w-fit text-[10px] font-semibold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-200">Paused</span>
                          <span className="text-[10px] text-amber-800">{r.pausedDays != null ? `${r.pausedDays}d` : '—'}</span>
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {r.planType ? (
                        <div className="flex flex-col gap-1">
                          <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${r.planType.toLowerCase() === 'executive' ? 'bg-purple-100 text-purple-700' :
                            r.planType.toLowerCase() === 'professional' ? 'bg-blue-100 text-blue-700' :
                              r.planType.toLowerCase() === 'ignite' ? 'bg-orange-100 text-orange-700' :
                                r.planType.toLowerCase() === 'prime' ? 'bg-green-100 text-green-700' :
                                  'bg-gray-100 text-gray-700'
                            }`}>
                            {r.planType.charAt(0).toUpperCase() + r.planType.slice(1)}
                          </span>
                          <div className="flex flex-col gap-0.5">
                            {addonLimit > 0 && (
                              <span className="text-[10px] text-blue-600 font-medium">
                                Addon: +{addonLimit}
                              </span>
                            )}
                            {referralBonus > 0 && (
                              <span className="text-[10px] text-emerald-700 font-medium">
                                Referrals: +{referralBonus}
                              </span>
                            )}
                            {exceeded && (
                              <span className="text-[10px] text-red-600 font-semibold">
                                Total: {totalLimit} (Exceeded)
                              </span>
                            )}
                          </div>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="px-2 py-1">
                      <span className="text-[11px] text-slate-700 truncate max-w-[120px] block" title={r.lastAppliedOperatorName || ''}>
                        {r.lastAppliedOperatorName ? capitalizeOperatorName(r.lastAppliedOperatorName) : '-'}
                      </span>
                    </td>
                    <td className="px-2 py-1">
                      {userRole === 'admin' ? (
                        <select
                          value={selectValueMatchingOption(r.dashboardTeamLeadName, dashboardSelectOptions)}
                          onChange={(e) => handleDashboardManagerChange(r.email, e.target.value)}
                          disabled={savingDashboardManager.has(r.email)}
                          className="px-2 py-1 text-[11px] border border-slate-300 rounded-full bg-white shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="">Not assigned</option>
                          {dashboardSelectOptions.map((name) => (
                            <option key={name} value={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-slate-700">
                          {r.dashboardTeamLeadName || 'Not assigned'}
                        </span>
                      )}
                    </td>
                    <td className={`px-2 py-1 text-right font-semibold ${exceeded ? 'text-red-600' : ''}`}>
                      {totalApplications}
                      {exceeded && <span className="text-[10px] block text-red-500">Exceeded</span>}
                    </td>
                    <td className="px-2 py-1 text-right">{r.saved}</td>
                    <td className="px-2 py-1 text-right">{r.applied}</td>
                    <td className="px-2 py-1 text-right">{r.interviewing}</td>
                    <td className="px-2 py-1 text-right">{r.offer}</td>
                    <td className="px-2 py-1 text-right">{r.rejected}</td>
                    <td className="px-2 py-1 text-right">{r.removed}</td>
                    <td className={`px-2 py-1 font-semibold text-right ${date ? (r.appliedOnDate > 0 ? 'text-blue-800' : 'text-slate-500') : ''}`}>
                      {date ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] ${r.appliedOnDate > 0 ? 'bg-blue-100 border border-blue-300' : 'bg-slate-100 border border-slate-300 text-slate-600'}`}>
                          {r.appliedOnDate}
                        </span>
                      ) : (
                        r.appliedOnDate
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Client Number Modal */}
      {editingClientNumberEmail && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget && !savingClientNumber) { setEditingClientNumberEmail(null); setEditingClientNumberValue(''); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Edit Client Number</h2>
              <button type="button" onClick={() => { setEditingClientNumberEmail(null); setEditingClientNumberValue(''); }} disabled={savingClientNumber} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Client Number</label>
                <input
                  type="number"
                  min={1}
                  value={editingClientNumberValue}
                  onChange={(e) => setEditingClientNumberValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveClientNumber(); if (e.key === 'Escape') { setEditingClientNumberEmail(null); setEditingClientNumberValue(''); } }}
                  placeholder="e.g. 5810"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary text-sm"
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">Leave empty to clear the number</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
              <button type="button" onClick={() => { setEditingClientNumberEmail(null); setEditingClientNumberValue(''); }} disabled={savingClientNumber} className="px-4 py-2 text-sm font-semibold text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={handleSaveClientNumber} disabled={savingClientNumber} className="px-4 py-2 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2">
                {savingClientNumber ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Save
              </button>
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
}


