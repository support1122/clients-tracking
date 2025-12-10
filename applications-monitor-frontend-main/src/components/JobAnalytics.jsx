import React, { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import Layout from './Layout';

const API_BASE = import.meta.env.VITE_BASE || 'https://clients-tracking-backend.onrender.com' ;

if (!API_BASE) {
  console.error('❌ VITE_BASE environment variable is required');
}

export default function JobAnalytics() {
  const [selectedDate, setSelectedDate] = useState('');
  const [jobData, setJobData] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetchTime, setLastFetchTime] = useState(null);
  const [performanceData, setPerformanceData] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(1000);
  const [pagination, setPagination] = useState(null);
  const [clearingCache, setClearingCache] = useState(false);


  useEffect(() => {
    const today = new Date();
    const todayString = today.toISOString().split('T')[0]; 
    setSelectedDate(todayString);
  }, []);

  const convertDateFormat = useCallback((dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }, []);

  const fetchJobsByDate = useCallback(async (date, page = 1, limit = 1000) => {
    if (!date) {
      toast.error('Please select a date');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const startTime = Date.now();
      const convertedDate = convertDateFormat(date);
      const response = await fetch(`${API_BASE}/api/jobs/by-date`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          date: convertedDate,
          page: page,
          limit: limit
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch job data: ${response.status}`);
      }

      const data = await response.json();
      setJobData(data);
      setLastFetchTime(Date.now());
      
      if (data._performance) {
        setPerformanceData(data._performance);
      }
      
      if (data.pagination) {
        setPagination(data.pagination);
        setCurrentPage(data.pagination.currentPage);
      }
      
      const fetchTime = Date.now() - startTime;
      const method = data._performance?.method || 'unknown';
      toast.success(`Job data loaded successfully in ${fetchTime}ms (${method})`);
    } catch (error) {
      console.error('Error fetching job data:', error);
      setError(error.message);
      toast.error(`Failed to load job data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-fetch data when date changes
  useEffect(() => {
    if (selectedDate) {
      fetchJobsByDate(selectedDate, currentPage, pageSize);
    }
  }, [selectedDate, fetchJobsByDate]);

  useEffect(() => {
    if (selectedDate && currentPage > 1) {
      fetchJobsByDate(selectedDate, currentPage, pageSize);
    }
  }, [currentPage, pageSize, selectedDate, fetchJobsByDate]);

  const getStatusCount = useCallback((status) => {
    return jobData[status]?.count || 0;
  }, [jobData]);

  const getStatusClients = useCallback((status) => {
    return jobData[status]?.clients || [];
  }, [jobData]);

  const formatDate = useCallback((dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return dateString;
    }
  }, []);

  const statusRows = useMemo(() => {
    const statuses = [
      { key: 'saved', label: 'Saved', bgColor: 'bg-blue-100', textColor: 'text-blue-800' },
      { key: 'applied', label: 'Applied', bgColor: 'bg-green-100', textColor: 'text-green-800' },
      { key: 'interviewing', label: 'Interviewing', bgColor: 'bg-yellow-100', textColor: 'text-yellow-800' },
      { key: 'offer', label: 'Offer', bgColor: 'bg-purple-100', textColor: 'text-purple-800' },
      { key: 'deleted', label: 'Deleted', bgColor: 'bg-red-100', textColor: 'text-red-800' }
    ];

    return statuses.map(status => ({
      ...status,
      count: getStatusCount(status.key),
      clients: getStatusClients(status.key)
    }));
  }, [getStatusCount, getStatusClients]);

  const totalJobs = useMemo(() => {
    return jobData.totalJobs || 0;
  }, [jobData.totalJobs]);

  const clearCache = useCallback(async () => {
    setClearingCache(true);
    try {
      const response = await fetch(`${API_BASE}/api/analytics/clear-cache`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (response.ok) {
        toast.success('Cache cleared successfully!');
        await fetchJobsByDate(selectedDate, 1, pageSize);
      } else {
        throw new Error('Failed to clear cache');
      }
    } catch (error) {
      console.error('Error clearing cache:', error);
      toast.error('Failed to clear cache');
    } finally {
      setClearingCache(false);
    }
  }, [selectedDate, pageSize, fetchJobsByDate]);

  return (
    <Layout>
      <div className="p-6 max-w-7xl mx-auto">
        
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h1 className="text-2xl font-bold text-gray-900">Job Status Dashboard</h1>
            <p className="text-gray-600 mt-1">View job counts by status for a specific date (based on last updated)</p>
            {selectedDate && (
              <p className="text-sm text-blue-600 mt-1">
                Searching for jobs updated on: {convertDateFormat(selectedDate)}
              </p>
            )}
          </div>

          {/* Date Selector */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Select Date:</label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() => fetchJobsByDate(selectedDate, currentPage, pageSize)}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Loading...' : 'Refresh'}
              </button>
              
              <button
                onClick={clearCache}
                disabled={clearingCache || loading}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {clearingCache ? 'Clearing...' : 'Clear Cache & Refresh'}
              </button>
              
              {/* Page Size Selector */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700">Page Size:</label>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(parseInt(e.target.value))}
                  className="px-2 py-1 border border-gray-300 rounded-md text-sm"
                >
                  <option value={100}>100</option>
                  <option value={500}>500</option>
                  <option value={1000}>1,000</option>
                  <option value={5000}>5,000</option>
                  <option value={10000}>10,000</option>
                </select>
              </div>
              {lastFetchTime && (
                <div className="flex flex-col text-sm text-gray-500">
                  <span>Last updated: {new Date(lastFetchTime).toLocaleTimeString()}</span>
                  {performanceData && (
                    <div className="flex gap-4 text-xs">
                      <span className={performanceData.fromCache ? 'text-green-600' : 'text-blue-600'}>
                        {performanceData.fromCache ? '📦 Cached' : '🔄 Fresh'}
                      </span>
                      <span>Response: {performanceData.responseTime}ms</span>
                      <span>Method: {performanceData.method}</span>
                      <span>Cache Hit Rate: {performanceData.cacheHitRate}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Job Status Table */}
          <div className="px-6 py-4">
            {loading ? (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600">Loading job data...</span>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <div className="text-red-500 text-lg">Error loading data</div>
                <div className="text-red-400 text-sm mt-2">{error}</div>
                <button
                  onClick={() => fetchJobsByDate(selectedDate)}
                  className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  Retry
                </button>
              </div>
            ) : Object.keys(jobData).length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Count
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Clients
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    <tr className="bg-blue-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-200 text-blue-900">
                          Total Jobs Found
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <span className="font-bold text-xl text-blue-600">{totalJobs}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <span className="text-gray-400">All jobs for selected date</span>
                      </td>
                    </tr>
                    {statusRows.map((status, index) => (
                      <tr key={status.key} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${status.bgColor} ${status.textColor}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className="font-semibold text-lg">{status.count}</span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {status.clients.map((client, clientIndex) => (
                            <div key={clientIndex} className="mb-1 text-gray-700">
                              {client.count} job{client.count !== 1 ? 's' : ''} <span className="text-gray-500">({client.email})</span>
                            </div>
                          ))}
                          {status.clients.length === 0 && (
                            <span className="text-gray-400">No clients</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="text-gray-500 text-lg">No job data found for the selected date</div>
                <div className="text-gray-400 text-sm mt-2">Try selecting a different date</div>
              </div>
            )}
          </div>

          {/* Pagination Controls */}
          {pagination && pagination.totalPages > 1 && (
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing page {pagination.currentPage} of {pagination.totalPages} 
                  ({pagination.totalCount.toLocaleString()} total jobs)
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={!pagination.hasPrevPage || loading}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    First
                  </button>
                  
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={!pagination.hasPrevPage || loading}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  
                  <span className="px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-md">
                    {pagination.currentPage}
                  </span>
                  
                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={!pagination.hasNextPage || loading}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                  
                  <button
                    onClick={() => setCurrentPage(pagination.totalPages)}
                    disabled={!pagination.hasNextPage || loading}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Last
                  </button>
                </div>
              </div>
            </div>
          )}
       
      </div>
    </Layout>
  );
}
