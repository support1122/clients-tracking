import React, { useState, useEffect, useMemo } from 'react';
import { TopPerformersBarChart, MonthlyLeaderboard, TeamPerformanceSummary } from './OperationsCharts';
import { AnimatedCounter } from './AnimatedCounter';

const API_BASE = import.meta.env.VITE_BASE || "https://applications-monitor-api.flashfirejobs.com";

export default function OperatorsPerformanceReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [operations, setOperations] = useState([]);
  const [operationsPerformance, setOperationsPerformance] = useState({});
  const [loading, setLoading] = useState(false);
  const [totalApplied, setTotalApplied] = useState(0);

  useEffect(() => {
    fetchOperations();
  }, []);

  useEffect(() => {
    if (startDate && endDate && operations.length > 0) {
      fetchPerformanceReport();
    }
  }, [startDate, endDate, operations]);

  const fetchOperations = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/operations`);
      if (response.ok) {
        const data = await response.json();
        setOperations(data.operations || []);
      }
    } catch (error) {
      console.error('Error fetching operations:', error);
    }
  };

  const fetchPerformanceReport = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        startDate,
        endDate
      });
      
      const response = await fetch(`${API_BASE}/api/operations/performance-report?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setOperationsPerformance(data.performanceMap || {});
        setTotalApplied(data.totalApplied || 0);
      } else {
        console.error('Error fetching performance report');
        setOperationsPerformance({});
        setTotalApplied(0);
      }
    } catch (error) {
      console.error('Error fetching performance report:', error);
      setOperationsPerformance({});
      setTotalApplied(0);
    } finally {
      setLoading(false);
    }
  };

  const formatDateForInput = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  };

  const sortedOperators = useMemo(() => {
    return operations
      .map(op => ({
        ...op,
        applications: operationsPerformance[op.email] || 0
      }))
      .sort((a, b) => b.applications - a.applications);
  }, [operations, operationsPerformance]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Operators Performance Report</h1>
          <p className="text-slate-600 mb-6">Shows jobs applied within selected date range</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white shadow-sm"
              />
              {startDate && (
                <p className="text-xs text-slate-500 mt-1">
                  Selected: {formatDateForDisplay(startDate)}
                </p>
              )}
            </div>
            
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-all duration-200 bg-white shadow-sm"
              />
              {endDate && (
                <p className="text-xs text-slate-500 mt-1">
                  Selected: {formatDateForDisplay(endDate)}
                </p>
              )}
            </div>
          </div>

          {startDate && endDate && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-green-800">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-semibold">
                  Showing jobs applied from {formatDateForDisplay(startDate)} to {formatDateForDisplay(endDate)}
                </span>
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
              <span className="ml-4 text-slate-600">Loading performance data...</span>
            </div>
          </div>
        )}

        {!loading && startDate && endDate && (
          <>
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 border border-blue-200">
                  <div className="text-sm font-semibold text-blue-700 mb-2">Total Applications</div>
                  <div className="text-3xl font-bold text-blue-900">
                    <AnimatedCounter value={totalApplied} loading={loading} />
                  </div>
                  <div className="text-xs text-blue-600 mt-1">In selected date range</div>
                </div>
                
                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-6 border border-green-200">
                  <div className="text-sm font-semibold text-green-700 mb-2">Active Operators</div>
                  <div className="text-3xl font-bold text-green-900">
                    {sortedOperators.filter(op => op.applications > 0).length}
                  </div>
                  <div className="text-xs text-green-600 mt-1">With applications</div>
                </div>
                
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-6 border border-purple-200">
                  <div className="text-sm font-semibold text-purple-700 mb-2">Average per Operator</div>
                  <div className="text-3xl font-bold text-purple-900">
                    {sortedOperators.length > 0 
                      ? Math.round((totalApplied / sortedOperators.length) * 10) / 10 
                      : 0}
                  </div>
                  <div className="text-xs text-purple-600 mt-1">Applications per operator</div>
                </div>
              </div>
            </div>

            {sortedOperators.length > 0 && (
              <>
                <TeamPerformanceSummary 
                  operations={operations} 
                  operationsPerformance={operationsPerformance}
                  loading={loading}
                />
                
                <TopPerformersBarChart 
                  operations={operations} 
                  operationsPerformance={operationsPerformance}
                  loading={loading}
                />
                
                <MonthlyLeaderboard 
                  operations={operations} 
                  operationsPerformance={operationsPerformance}
                />

                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                  <h3 className="text-lg font-semibold text-slate-900 mb-4">Complete Performance List</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Rank</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Operator Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Email</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase">Applications</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase">Percentage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {sortedOperators.map((operator, index) => {
                          const percentage = totalApplied > 0 
                            ? ((operator.applications / totalApplied) * 100).toFixed(1)
                            : '0.0';
                          
                          return (
                            <tr 
                              key={operator.email}
                              className={index === 0 ? 'bg-yellow-50' : index === 1 ? 'bg-gray-50' : index === 2 ? 'bg-orange-50' : 'hover:bg-slate-50'}
                            >
                              <td className="px-4 py-3 text-sm font-semibold text-slate-900">
                                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-slate-900">
                                {operator.name || operator.email.split('@')[0]}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-600">
                                {operator.email}
                              </td>
                              <td className="px-4 py-3 text-sm font-bold text-slate-900 text-right">
                                {operator.applications.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 text-sm text-slate-600 text-right">
                                {percentage}%
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {sortedOperators.length === 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
                <div className="text-slate-400 mb-4">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <p className="text-slate-600 font-medium">No data available for the selected date range</p>
                <p className="text-slate-400 text-sm mt-2">Please select a different date range or check back later</p>
              </div>
            )}
          </>
        )}

        {!startDate || !endDate ? (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
            <div className="text-slate-400 mb-4">
              <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-slate-600 font-medium">Select a date range to view performance report</p>
            <p className="text-slate-400 text-sm mt-2">Choose start and end dates above to see operator performance data</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

