import React, { useEffect, useState, useCallback } from 'react';
import Layout from './Layout';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_BASE || 'https://clients-tracking-backend.onrender.com';

export default function ClientJobAnalysis() {
  const [date, setDate] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortDir, setSortDir] = useState('desc'); // 'asc' | 'desc'
  const [operationsNames, setOperationsNames] = useState([]);
  const [savingOperations, setSavingOperations] = useState(new Set());
  const [dashboardManagerNames, setDashboardManagerNames] = useState([]);
  const [savingDashboardManager, setSavingDashboardManager] = useState(new Set());

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
      const url = `${API_BASE}/api/analytics/client-job-analysis?t=${Date.now()}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify(body)
      });
      if (!resp.ok) throw new Error('Failed');
      const data = await resp.json();
      setRows(data.rows || []);
    } catch (e) {
      toast.error('Failed to load client job analysis');
    } finally {
      setLoading(false);
    }
  }, [convertToDMY]);

  // Fetch operations names on mount
  useEffect(() => {
    const fetchOperationsNames = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/operations/names`);
        if (!resp.ok) throw new Error('Failed to fetch operations names');
        const data = await resp.json();
        if (data.success) {
          setOperationsNames(data.names || []);
        }
      } catch (e) {
        console.error('Failed to load operations names:', e);
      }
    };
    fetchOperationsNames();
  }, []);

  // Fetch dashboard manager names on mount
  useEffect(() => {
    const fetchDashboardManagerNames = async () => {
      try {
        const resp = await fetch(`${API_BASE}/api/managers/names`);
        if (!resp.ok) throw new Error('Failed to fetch dashboard manager names');
        const data = await resp.json();
        if (data.success) {
          setDashboardManagerNames(data.names || []);
        }
      } catch (e) {
        console.error('Failed to load dashboard manager names:', e);
      }
    };
    fetchDashboardManagerNames();
  }, []);

  useEffect(() => {
    fetchAnalysis();
  }, [fetchAnalysis]);

  const onRefresh = () => fetchAnalysis(date);

  const findAppliedOnDate = useCallback(async () => {
    if (!date) {
      toast.error('Pick a date first');
      return;
    }
    try {
      const body = { date: convertToDMY(date) };
      const url = `${API_BASE}/api/analytics/applied-by-date?t=${Date.now()}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
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

  const handleOperationsNameChange = async (email, operationsName) => {
    setSavingOperations(prev => new Set(prev).add(email));
    try {
      const resp = await fetch(`${API_BASE}/api/clients/update-operations-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, operationsName })
      });
      if (!resp.ok) throw new Error('Failed to save');
      const data = await resp.json();
      if (data.success) {
        // Update the row in state
        setRows(prev => prev.map(r => 
          r.email === email ? { ...r, operationsName } : r
        ));
        toast.success('Operations name updated successfully');
      }
    } catch (e) {
      toast.error('Failed to update operations name');
    } finally {
      setSavingOperations(prev => {
        const next = new Set(prev);
        next.delete(email);
        return next;
      });
    }
  };

  const handleDashboardManagerChange = async (email, dashboardTeamLeadName) => {
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

  return (
    <Layout>
      <div className="p-6 w-full">
        
          <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-gray-900">Client Job Analysis</h1>
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              <label className="text-xs text-gray-700">Select Date:</label>
              <input
                type="date"
                value={date}
                onChange={(e)=>setDate(e.target.value)}
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
                {loading? 'Loading...' : 'Refresh'}
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
                  <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Plan</th>
                  <th className="px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-700">Operations</th>
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
              <tbody className="divide-y divide-gray-100">
                {[...(rows||[])].sort((a,b)=>{
                  // When date is selected, sort by applied-on-date metric
                  if (date) {
                    const av = Number(a?.appliedOnDate || 0);
                    const bv = Number(b?.appliedOnDate || 0);
                    const cmp = sortDir === 'asc' ? av - bv : bv - av;
                    if (cmp !== 0) return cmp;
                  }
                  // Sort by status: active first, then inactive
                  const statusOrder = { 'active': 0, 'inactive': 1 };
                  const statusA = statusOrder[a.status] ?? 2;
                  const statusB = statusOrder[b.status] ?? 2;
                  if (statusA !== statusB) return statusA - statusB;
                  // Secondary sort: email alphabetically
                  return a.email.localeCompare(b.email);
                }).map((r, idx) => {
                  const totalApplications = (Number(r.saved||0) + Number(r.applied||0) + Number(r.interviewing||0) + Number(r.offer||0));
                  const plan = String(r.planType || '')
                    .trim()
                    .toLowerCase();
                  const isIgnite = plan.includes('ignite');
                  const isProfessional = plan.includes('professional');
                  const isExecutive = plan.includes('executive');
                  const threshold = isIgnite ? 250 : isProfessional ? 500 : isExecutive ? 1000 : Infinity;
                  const exceeded = totalApplications > threshold;
                  const rowColor = exceeded ? 'bg-red-100' : (idx%2===0 ? 'bg-white' : 'bg-gray-50');
                  return (
                  <tr key={r.email+idx} className={rowColor}>
                    <td className="px-2 py-1">
                      <div className="text-gray-900 font-medium truncate max-w-[160px]">{r.name || r.email}</div>
                      <div className="text-gray-500 text-[10px] truncate max-w-[180px]">{r.email}</div>
                    </td>
                    <td className="px-2 py-1">
                      {r.status ? (
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${
                          r.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-2 py-1">
                      {r.planType ? (
                        <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-semibold ${
                          r.planType === 'executive' ? 'bg-purple-100 text-purple-700' :
                          r.planType === 'professional' ? 'bg-blue-100 text-blue-700' :
                          'bg-green-100 text-green-700'
                        }`}>
                          {r.planType.charAt(0).toUpperCase() + r.planType.slice(1)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={r.operationsName || ''}
                        onChange={(e) => handleOperationsNameChange(r.email, e.target.value)}
                        disabled={savingOperations.has(r.email)}
                        className="px-2 py-1 text-[11px] border border-slate-300 rounded-full bg-white shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">-- Select --</option>
                        {operationsNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1">
                      <select
                        value={r.dashboardTeamLeadName || ''}
                        onChange={(e) => handleDashboardManagerChange(r.email, e.target.value)}
                        disabled={savingDashboardManager.has(r.email)}
                        className="px-2 py-1 text-[11px] border border-slate-300 rounded-full bg-white shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="">-- Select --</option>
                        {dashboardManagerNames.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1 text-right">{totalApplications}</td>
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
                )})}
                {rows.length===0 && (
                  <tr>
                    <td colSpan={13} className="px-2 py-8 text-center text-gray-500 text-sm">No data</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      
    </Layout>
  );
}


