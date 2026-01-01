import React, { useState, useEffect, useMemo } from 'react';
import { TopPerformersBarChart, MonthlyLeaderboard, TeamPerformanceSummary } from './OperationsCharts';
import { AnimatedCounter } from './AnimatedCounter';

const API_BASE = import.meta.env.VITE_BASE || "https://applications-monitor-api.flashfirejobs.com";

const INCENTIVE_TIERS = [
  { min: 3000, max: Infinity, payout: 'Stipend + ₹5,000', color: 'from-purple-500 to-purple-600', bgColor: 'from-purple-50 to-purple-100', textColor: 'text-purple-700', borderColor: 'border-purple-200' },
  { min: 2501, max: 3000, payout: 'Stipend + ₹4,000', color: 'from-indigo-500 to-indigo-600', bgColor: 'from-indigo-50 to-indigo-100', textColor: 'text-indigo-700', borderColor: 'border-indigo-200' },
  { min: 2201, max: 2500, payout: 'Stipend + ₹3,000', color: 'from-blue-500 to-blue-600', bgColor: 'from-blue-50 to-blue-100', textColor: 'text-blue-700', borderColor: 'border-blue-200' },
  { min: 1801, max: 2200, payout: 'Stipend + ₹2,500', color: 'from-cyan-500 to-cyan-600', bgColor: 'from-cyan-50 to-cyan-100', textColor: 'text-cyan-700', borderColor: 'border-cyan-200' },
  { min: 1501, max: 1800, payout: 'Stipend + ₹1,500', color: 'from-teal-500 to-teal-600', bgColor: 'from-teal-50 to-teal-100', textColor: 'text-teal-700', borderColor: 'border-teal-200' },
  { min: 1300, max: 1500, payout: 'Stipend + ₹500', color: 'from-green-500 to-green-600', bgColor: 'from-green-50 to-green-100', textColor: 'text-green-700', borderColor: 'border-green-200' },
  { min: 1000, max: 1299, payout: 'Stipend only', color: 'from-slate-400 to-slate-500', bgColor: 'from-slate-50 to-slate-100', textColor: 'text-slate-700', borderColor: 'border-slate-200' },
];

export default function OperatorsPerformanceReport() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [operations, setOperations] = useState([]);
  const [operationsPerformance, setOperationsPerformance] = useState({});
  const [loading, setLoading] = useState(false);
  const [totalApplied, setTotalApplied] = useState(0);
  const [incentiveStructureExpanded, setIncentiveStructureExpanded] = useState(false);

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

  // Calculate monthly applications from date range
  const calculateMonthlyApplications = (applications, startDate, endDate) => {
    if (!startDate || !endDate || applications === 0) return 0;
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
    
    if (daysDiff <= 0) return 0;
    
    // Calculate average per day and project to 30 days (monthly)
    const avgPerDay = applications / daysDiff;
    const monthlyProjected = Math.round(avgPerDay * 30);
    
    return monthlyProjected;
  };

  // Get tier information for a given monthly application count
  const getTierInfo = (monthlyApplications) => {
    if (monthlyApplications < 1000) {
      return { tier: 'Under 1,000', payout: 'Stipend only', tierIndex: -1, min: 0, max: 999 };
    }
    
    for (let i = 0; i < INCENTIVE_TIERS.length; i++) {
      const tier = INCENTIVE_TIERS[i];
      if (monthlyApplications >= tier.min && monthlyApplications <= tier.max) {
        return { ...tier, tierIndex: i, tier: `${tier.min === 3000 ? '3000+' : `${tier.min}-${tier.max}`}` };
      }
    }
    
    return { tier: '3000+', payout: 'Stipend + ₹5,000', tierIndex: 0, min: 3000, max: Infinity };
  };

  // Get next tier and progress
  const getNextTierProgress = (monthlyApplications) => {
    const currentTier = getTierInfo(monthlyApplications);
    
    if (currentTier.tierIndex === -1) {
      // Below threshold, next tier is 1000-1299
      const nextTier = INCENTIVE_TIERS[INCENTIVE_TIERS.length - 1];
      const progress = (monthlyApplications / nextTier.min) * 100;
      return {
        nextTier: nextTier,
        progress: Math.min(progress, 100),
        remaining: Math.max(0, nextTier.min - monthlyApplications)
      };
    }
    
    if (currentTier.tierIndex === 0) {
      // Already at highest tier
      return {
        nextTier: null,
        progress: 100,
        remaining: 0
      };
    }
    
    // Get next tier
    const nextTier = INCENTIVE_TIERS[currentTier.tierIndex - 1];
    // Calculate progress from current tier min to next tier min
    const range = nextTier.min - currentTier.min;
    const progress = ((monthlyApplications - currentTier.min) / range) * 100;
    
    return {
      nextTier: nextTier,
      progress: Math.min(Math.max(progress, 0), 100),
      remaining: Math.max(0, nextTier.min - monthlyApplications)
    };
  };

  const sortedOperators = useMemo(() => {
    return operations
      .map(op => ({
        ...op,
        applications: operationsPerformance[op.email] || 0
      }))
      .sort((a, b) => b.applications - a.applications);
  }, [operations, operationsPerformance]);

  // Get tier distribution (only show operators who qualify for tiers - 1,000+)
  const getTierDistribution = useMemo(() => {
    if (!startDate || !endDate) return {};
    
    const distribution = {};
    
    sortedOperators.forEach(operator => {
      // Use actual applications for tier calculation
      const tierInfo = getTierInfo(operator.applications);
      
      // Only include operators who have reached at least 1,000 applications
      if (tierInfo.tierIndex !== -1) {
        const tierKey = tierInfo.tier;
        
        if (!distribution[tierKey]) {
          distribution[tierKey] = {
            count: 0,
            tierInfo: tierInfo
          };
        }
        distribution[tierKey].count++;
      }
    });
    
    return distribution;
  }, [sortedOperators, startDate, endDate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Operators Performance Report</h1>
          <p className="text-slate-600 mb-6">Shows jobs applied within selected date range</p>
          
          {/* Incentive Structure Card - Collapsible */}
          <div className="mb-6 border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setIncentiveStructureExpanded(!incentiveStructureExpanded)}
              className="w-full bg-gradient-to-r from-indigo-50 to-purple-50 hover:from-indigo-100 hover:to-purple-100 transition-all duration-200 p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-lg font-semibold text-slate-900">Monthly Incentive Structure</span>
              </div>
              <svg
                className={`w-5 h-5 text-slate-600 transition-transform duration-200 ${incentiveStructureExpanded ? 'transform rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            
            {incentiveStructureExpanded && (
              <div className="p-6 bg-white border-t border-slate-200">
                <p className="text-sm text-slate-600 mb-4">
                  This incentive structure rewards high performance and consistency. There are no penalties for submitting fewer applications.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Monthly Applications</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Payout</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {INCENTIVE_TIERS.map((tier, index) => (
                        <tr key={index} className="hover:bg-slate-50">
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">
                            {tier.min === 3000 ? '3,000+' : `${tier.min.toLocaleString()}–${tier.max.toLocaleString()}`}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-700">{tier.payout}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-xs text-blue-800">
                    <strong>Note:</strong> Tiers are calculated based on actual applications in the selected date range. Select a date range to see current tier status for each operator.
                  </p>
                </div>
              </div>
            )}
          </div>
          
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              </div>
            </div>

            {/* Tier Distribution Summary */}
            {Object.keys(getTierDistribution).length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">Tier Distribution</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
                  {Object.entries(getTierDistribution)
                    .sort((a, b) => {
                      const aIndex = a[1].tierInfo.tierIndex === -1 ? 999 : a[1].tierInfo.tierIndex;
                      const bIndex = b[1].tierInfo.tierIndex === -1 ? 999 : b[1].tierInfo.tierIndex;
                      return aIndex - bIndex;
                    })
                    .map(([tierName, data]) => (
                      <div
                        key={tierName}
                        className={`bg-gradient-to-br ${data.tierInfo.bgColor || 'from-slate-50 to-slate-100'} rounded-lg p-4 border ${data.tierInfo.borderColor || 'border-slate-200'}`}
                      >
                        <div className={`text-xs font-semibold ${data.tierInfo.textColor || 'text-slate-700'} mb-1`}>
                          {tierName}
                        </div>
                        <div className={`text-2xl font-bold ${data.tierInfo.textColor || 'text-slate-900'}`}>
                          {data.count}
                        </div>
                        <div className={`text-xs ${data.tierInfo.textColor || 'text-slate-600'} mt-1`}>
                          {data.count === 1 ? 'operator' : 'operators'}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

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
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Current Tier</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">Progress to Next Tier</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-slate-700 uppercase">Percentage</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {sortedOperators.map((operator, index) => {
                          const percentage = totalApplied > 0 
                            ? ((operator.applications / totalApplied) * 100).toFixed(1)
                            : '0.0';
                          
                          // Use actual applications for tier calculation
                          const tierInfo = getTierInfo(operator.applications);
                          const nextTierProgress = getNextTierProgress(operator.applications);
                          
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
                              <td className="px-4 py-3">
                                <div className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r ${tierInfo.bgColor || 'from-slate-100 to-slate-200'} border ${tierInfo.borderColor || 'border-slate-300'} ${tierInfo.textColor || 'text-slate-700'}`}>
                                  {tierInfo.tier}
                                </div>
                                <div className="text-xs text-slate-500 mt-1">{tierInfo.payout}</div>
                              </td>
                              <td className="px-4 py-3">
                                {nextTierProgress.nextTier ? (
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                                      <span>Next: {nextTierProgress.nextTier.min === 3000 ? '3000+' : `${nextTierProgress.nextTier.min}-${nextTierProgress.nextTier.max}`}</span>
                                      <span className="font-semibold">{Math.round(nextTierProgress.progress)}%</span>
                                    </div>
                                    <div className="w-full bg-slate-200 rounded-full h-2">
                                      <div
                                        className={`bg-gradient-to-r ${nextTierProgress.nextTier.color} h-2 rounded-full transition-all duration-300`}
                                        style={{ width: `${Math.min(nextTierProgress.progress, 100)}%` }}
                                      ></div>
                                    </div>
                                    {nextTierProgress.remaining > 0 && (
                                      <div className="text-xs text-slate-500">
                                        {nextTierProgress.remaining.toLocaleString()} more to next tier
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-xs text-green-600 font-semibold">
                                    ✓ Maximum tier achieved!
                                  </div>
                                )}
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

