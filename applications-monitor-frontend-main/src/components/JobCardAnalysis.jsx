import React, { useState, useEffect, useMemo } from 'react';
import { handleAuthFailure } from '../utils/authUtils';

const API_BASE = import.meta.env.VITE_BASE || 'https://applications-monitor-api.flashfirejobs.com';
const AUTH_HEADERS = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${localStorage.getItem('authToken') || ''}`
});

export default function JobCardAnalysis() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedOp, setExpandedOp] = useState(null);
  const [searchClient, setSearchClient] = useState('');
  const [searchOperator, setSearchOperator] = useState('');

  // Default to current month
  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    setStartDate(`${y}-${m}-01`);
    setEndDate(`${y}-${m}-${String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`);
  }, []);

  useEffect(() => {
    if (startDate && endDate) fetchData();
  }, [startDate, endDate]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/api/analytics/job-card-analysis?startDate=${startDate}&endDate=${endDate}`,
        { headers: AUTH_HEADERS() }
      );
      if (handleAuthFailure(res)) return;
      const json = await res.json();
      if (json.success) setData(json);
    } catch (err) {
      console.error('Failed to fetch job card analysis:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filter operators by search
  const filteredOperators = useMemo(() => {
    if (!data?.operators) return [];
    let ops = data.operators;

    if (searchOperator) {
      const q = searchOperator.toLowerCase();
      ops = ops.filter(op => op.name.toLowerCase().includes(q) || op.email.toLowerCase().includes(q));
    }

    if (searchClient) {
      const q = searchClient.toLowerCase();
      ops = ops.map(op => {
        const matchingClients = op.clients.filter(c =>
          c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
        );
        if (matchingClients.length === 0) return null;
        return { ...op, clients: matchingClients, totalAdded: matchingClients.reduce((s, c) => s + c.count, 0) };
      }).filter(Boolean).sort((a, b) => b.totalAdded - a.totalAdded);
    }

    return ops;
  }, [data, searchOperator, searchClient]);

  // Recalculate totals based on filtered data
  const filteredTotals = useMemo(() => {
    if (!filteredOperators.length) return { totalAdded: 0, totalOperators: 0, totalClients: 0 };
    const uniqueClients = new Set();
    let totalAdded = 0;
    filteredOperators.forEach(op => {
      totalAdded += op.totalAdded;
      op.clients.forEach(c => uniqueClients.add(c.email));
    });
    return { totalAdded, totalOperators: filteredOperators.length, totalClients: uniqueClients.size };
  }, [filteredOperators]);

  const getRankBadge = (index) => {
    if (index === 0) return <span className="text-lg">&#x1f947;</span>;
    if (index === 1) return <span className="text-lg">&#x1f948;</span>;
    if (index === 2) return <span className="text-lg">&#x1f949;</span>;
    return <span className="text-xs font-bold text-slate-400">#{index + 1}</span>;
  };

  const getBarWidth = (count) => {
    if (!filteredOperators.length) return 0;
    const max = filteredOperators[0]?.totalAdded || 1;
    return Math.max((count / max) * 100, 2);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">Job Card Analysis</h1>
        <p className="text-sm text-slate-500 mt-1">Jobs added via extension — who added how many, for which clients</p>
      </div>

      {/* Date Range + Search */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Search Operator</label>
            <input type="text" value={searchOperator} onChange={e => setSearchOperator(e.target.value)}
              placeholder="Filter by operator name..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400" />
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Search Client</label>
            <input type="text" value={searchClient} onChange={e => setSearchClient(e.target.value)}
              placeholder="Filter by client name or email..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400" />
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-xl p-4 text-white shadow-lg">
            <p className="text-xs font-medium opacity-80">Total Jobs Added</p>
            <p className="text-3xl font-bold mt-1">{filteredTotals.totalAdded.toLocaleString()}</p>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-amber-600 rounded-xl p-4 text-white shadow-lg">
            <p className="text-xs font-medium opacity-80">Operators</p>
            <p className="text-3xl font-bold mt-1">{filteredTotals.totalOperators}</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-4 text-white shadow-lg">
            <p className="text-xs font-medium opacity-80">Clients Served</p>
            <p className="text-3xl font-bold mt-1">{filteredTotals.totalClients}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-rose-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Operator Table */}
      {!loading && filteredOperators.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-12">#</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Operator</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 w-48">Jobs Added</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600 w-24">Clients</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600 w-20">Avg/Client</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {filteredOperators.map((op, i) => (
                <React.Fragment key={op.email}>
                  <tr
                    className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${expandedOp === op.email ? 'bg-rose-50' : ''}`}
                    onClick={() => setExpandedOp(expandedOp === op.email ? null : op.email)}
                  >
                    <td className="px-4 py-3">{getRankBadge(i)}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{op.name}</div>
                      <div className="text-xs text-slate-400">{op.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500 transition-all duration-500"
                            style={{ width: `${getBarWidth(op.totalAdded)}%` }}
                          />
                        </div>
                        <span className="font-bold text-slate-700 min-w-[40px] text-right">{op.totalAdded}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                        {op.clients.length}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-medium text-slate-600">
                      {op.clients.length > 0 ? (op.totalAdded / op.clients.length).toFixed(1) : 0}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block transition-transform duration-200 ${expandedOp === op.email ? 'rotate-180' : ''}`}>
                        &#9660;
                      </span>
                    </td>
                  </tr>

                  {/* Expanded client breakdown */}
                  {expandedOp === op.email && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <div className="bg-slate-50 border-t border-b border-slate-200 px-6 py-3">
                          <div className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                            Client Breakdown for {op.name}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            {op.clients.map(c => {
                              const clientMax = op.clients[0]?.count || 1;
                              const pct = Math.max((c.count / clientMax) * 100, 8);
                              return (
                                <div key={c.email} className="bg-white rounded-lg p-3 border border-slate-200 hover:shadow-sm transition-shadow">
                                  <div className="flex items-center justify-between mb-1.5">
                                    <div className="font-medium text-slate-700 text-xs truncate flex-1 mr-2" title={c.email}>
                                      {c.name}
                                    </div>
                                    <span className="text-sm font-bold text-rose-600">{c.count}</span>
                                  </div>
                                  <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div
                                      className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-400"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && data && filteredOperators.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg">No results found</p>
          <p className="text-sm mt-1">Try adjusting your date range or search filters</p>
        </div>
      )}
    </div>
  );
}
