import React, { useEffect, useMemo, useState } from 'react';
import Layout from './Layout';
import toast from 'react-hot-toast';
import { sanitizePhoneNumber } from '../utils/phoneUtils';

const API_BASE = import.meta.env.VITE_BASE || 'https://clients-tracking-backend.onrender.com';
const PAGE_SIZE = 5;

export default function CallScheduler() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [announceTimeText, setAnnounceTimeText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsPage, setLogsPage] = useState(1);
  const [logsTotalPages, setLogsTotalPages] = useState(0);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [discordLogs, setDiscordLogs] = useState([]);
  const [discordPage, setDiscordPage] = useState(1);
  const [discordTotalPages, setDiscordTotalPages] = useState(0);
  const [loadingDiscordLogs, setLoadingDiscordLogs] = useState(false);
  const [retryingId, setRetryingId] = useState('');
  const [triggeringReminder, setTriggeringReminder] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [currentRole, setCurrentRole] = useState('');

  const minDateTimeLocal = useMemo(() => {
    const d = new Date(Date.now() + 60_000);
    const pad = (n) => String(n).padStart(2, '0');
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${y}-${m}-${day}T${hh}:${mm}`;
  }, []);

  useEffect(() => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      setCurrentRole(user?.role || '');
    } catch {
      setCurrentRole('');
    }
  }, []);

  const fetchLogs = async (page = logsPage) => {
    setLoadingLogs(true);
    try {
      const token = localStorage.getItem('authToken');
      const resp = await fetch(`${API_BASE}/api/calls/logs?page=${page}&limit=${PAGE_SIZE}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error('Failed to load logs');
      const data = await resp.json();
      setLogs(data.logs || []);
      setLogsPage(data.page || page);
      setLogsTotalPages(data.totalPages || 0);
    } catch {
      toast.error('Failed to load call logs');
    } finally {
      setLoadingLogs(false);
    }
  };

  const fetchDiscordLogs = async (page = discordPage) => {
    setLoadingDiscordLogs(true);
    try {
      const token = localStorage.getItem('authToken');
      const resp = await fetch(`${API_BASE}/api/admin/discord-reminder-logs?page=${page}&limit=${PAGE_SIZE}&reminderType=zero_saved`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error('Failed to load discord logs');
      const data = await resp.json();
      setDiscordLogs(data.logs || []);
      setDiscordPage(data.page || page);
      setDiscordTotalPages(data.totalPages || 0);
    } catch {
      toast.error('Failed to load Discord reminder logs');
    } finally {
      setLoadingDiscordLogs(false);
    }
  };

  useEffect(() => { fetchLogs(1); }, []);
  useEffect(() => {
    if (currentRole === 'admin') fetchDiscordLogs(1);
  }, [currentRole]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanPhoneNumber = sanitizePhoneNumber(phoneNumber);
    if (!/^\+?[1-9]\d{7,14}$/.test(cleanPhoneNumber)) {
      toast.error('Enter a valid number with country code, e.g. +14155551234');
      return;
    }
    if (!scheduleTime) {
      toast.error('Pick a time to schedule the call');
      return;
    }
    const iso = new Date(scheduleTime).toISOString();
    setSubmitting(true);
    try {
      const token = localStorage.getItem('authToken');
      const resp = await fetch(`${API_BASE}/api/calls/schedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ phoneNumber: cleanPhoneNumber, scheduleTime: iso, announceTimeText: announceTimeText?.trim() || undefined })
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed');
      toast.success('Call scheduled');
      setPhoneNumber('');
      setScheduleTime('');
      setAnnounceTimeText('');
      fetchLogs(1);
    } catch (e) {
      toast.error(e.message || 'Failed to schedule');
    } finally {
      setSubmitting(false);
    }
  };

  const clearCallLogs = async () => {
    if (!window.confirm('Clear all call history logs?')) return;
    setClearingLogs(true);
    try {
      const token = localStorage.getItem('authToken');
      const resp = await fetch(`${API_BASE}/api/calls/logs`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) throw new Error(data.error || 'Failed to clear logs');
      toast.success('Call logs cleared');
      fetchLogs(1);
    } catch (e) {
      toast.error(e.message || 'Failed to clear logs');
    } finally {
      setClearingLogs(false);
    }
  };

  const retryDiscordLog = async (id) => {
    setRetryingId(id);
    try {
      const token = localStorage.getItem('authToken');
      const resp = await fetch(`${API_BASE}/api/admin/discord-reminder-logs/${id}/retry`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) throw new Error(data.error || 'Retry failed');
      toast.success('Reminder sent again');
      fetchDiscordLogs(discordPage);
    } catch (e) {
      toast.error(e.message || 'Retry failed');
    } finally {
      setRetryingId('');
    }
  };

  const triggerZeroSavedNow = async () => {
    setTriggeringReminder(true);
    try {
      const token = localStorage.getItem('authToken');
      const resp = await fetch(`${API_BASE}/api/admin/trigger-zero-saved-reminder`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || !data.success) throw new Error(data.error || 'Trigger failed');
      const sent = data?.result?.sentCount ?? 0;
      const failed = data?.result?.failedCount ?? 0;
      toast.success(`Reminder run completed: sent ${sent}, failed ${failed}`);
      fetchDiscordLogs(1);
    } catch (e) {
      toast.error(e.message || 'Failed to trigger reminders');
    } finally {
      setTriggeringReminder(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">Call Scheduler</h1>
            {/* <div className="ml-auto">
              <Link to="/client-job-analysis" className="text-sm text-blue-700 hover:underline">Back to Client Job Analysis</Link>
            </div> */}
          </div>
          <form onSubmit={handleSubmit} className="px-6 py-5 grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">Phone Number (with country code)</label>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e)=>setPhoneNumber(sanitizePhoneNumber(e.target.value))}
                placeholder="+14155551234"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Schedule Time</label>
              <input
                type="datetime-local"
                min={minDateTimeLocal}
                value={scheduleTime}
                onChange={(e)=>setScheduleTime(e.target.value)}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-gray-700">Announce Time (what to say)</label>
              <input
                type="text"
                value={announceTimeText}
                onChange={(e)=>setAnnounceTimeText(e.target.value)}
                placeholder="e.g., 5:30 PM"
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-500">If left empty, it will say scheduled time + 10 minutes.</p>
            </div>
            <div className="sm:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50"
              >{submitting ? 'Scheduling...' : 'Schedule Call'}</button>
            </div>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow mt-6">
          <div className="px-6 py-3 border-b border-gray-200 flex items-center">
            <h2 className="text-lg font-semibold text-gray-900">Recent Call Logs</h2>
            {currentRole === 'admin' ? (
              <button
                onClick={clearCallLogs}
                disabled={clearingLogs}
                className="ml-auto mr-2 px-3 py-1.5 text-sm bg-red-50 text-red-700 rounded border border-red-200 hover:bg-red-100 disabled:opacity-50"
              >
                {clearingLogs ? 'Clearing...' : 'Clear history'}
              </button>
            ) : null}
            <button onClick={() => fetchLogs(logsPage)} disabled={loadingLogs} className="px-3 py-1.5 text-sm bg-gray-100 rounded border hover:bg-gray-200 disabled:opacity-50">
              {loadingLogs ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          <div className="px-6 py-4">
            <div className="h-[320px] overflow-auto border border-gray-100 rounded-lg">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Phone</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Scheduled For</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Last Update</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(logs||[]).map((l, idx) => (
                  <tr key={l._id || idx} className={idx%2===0? 'bg-white':'bg-gray-50'}>
                    <td className="px-4 py-2 text-sm text-gray-900">{l.phoneNumber}</td>
                    <td className="px-4 py-2 text-sm">{new Date(l.scheduledFor).toLocaleString()}</td>
                    <td className="px-4 py-2 text-sm">
                      <span className={`px-2 py-0.5 rounded-full text-xs border ${ (l.derivedStatus||l.status)==='completed' ? 'bg-green-100 border-green-300 text-green-700' : (l.derivedStatus||l.status)==='failed' ? 'bg-red-100 border-red-300 text-red-700' : (l.derivedStatus||l.status)==='in_progress' || (l.derivedStatus||l.status)==='calling' ? 'bg-yellow-100 border-yellow-300 text-yellow-800' : (l.derivedStatus||l.status)==='queued' ? 'bg-slate-100 border-slate-300 text-slate-700' : 'bg-slate-100 border-slate-300 text-slate-700'}`}>
                        {(l.derivedStatus || l.status || '').replace('_',' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm">{l.lastUpdated ? new Date(l.lastUpdated).toLocaleString() : (l.attemptAt ? new Date(l.attemptAt).toLocaleString() : '-')}</td>
                    <td className="px-4 py-2 text-sm text-red-600">{l.error || ''}</td>
                  </tr>
                ))}
                {(!logs || logs.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">No logs</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-gray-600">Page {logsPage} of {Math.max(logsTotalPages, 1)}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={logsPage <= 1 || loadingLogs}
                  onClick={() => fetchLogs(logsPage - 1)}
                  className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={logsPage >= logsTotalPages || loadingLogs || logsTotalPages === 0}
                  onClick={() => fetchLogs(logsPage + 1)}
                  className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>

        {currentRole === 'admin' ? (
          <div className="bg-white rounded-lg shadow mt-6">
            <div className="px-6 py-3 border-b border-gray-200 flex items-center gap-2">
              <h2 className="text-lg font-semibold text-gray-900">Discord Reminder Audit (Zero Saved)</h2>
              <button
                onClick={triggerZeroSavedNow}
                disabled={triggeringReminder}
                className="ml-auto px-3 py-1.5 text-sm bg-indigo-600 text-white rounded border border-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                {triggeringReminder ? 'Sending...' : 'Send Now'}
              </button>
              <button onClick={() => fetchDiscordLogs(discordPage)} disabled={loadingDiscordLogs} className="px-3 py-1.5 text-sm bg-gray-100 rounded border hover:bg-gray-200 disabled:opacity-50">
                {loadingDiscordLogs ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            <div className="px-6 py-4">
              <div className="h-[320px] overflow-auto border border-gray-100 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Client</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Adder</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Status</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Time</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Error</th>
                      <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(discordLogs || []).map((item) => (
                      <tr key={item._id} className="bg-white">
                        <td className="px-4 py-2 text-sm text-gray-900">{item.clientName || item.clientEmail || '—'}</td>
                        <td className="px-4 py-2 text-sm text-gray-700">{item.addedBy || '—'}</td>
                        <td className="px-4 py-2 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-xs border ${item.status === 'sent' ? 'bg-green-100 text-green-700 border-green-300' : 'bg-red-100 text-red-700 border-red-300'}`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-sm">{item.createdAt ? new Date(item.createdAt).toLocaleString() : '-'}</td>
                        <td className="px-4 py-2 text-sm text-red-600 max-w-[280px] truncate" title={item.error || ''}>{item.error || ''}</td>
                        <td className="px-4 py-2 text-sm">
                          {item.status === 'failed' ? (
                            <button
                              type="button"
                              onClick={() => retryDiscordLog(item._id)}
                              disabled={retryingId === item._id}
                              className="px-2.5 py-1 rounded border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                            >
                              {retryingId === item._id ? 'Sending...' : 'Retry'}
                            </button>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(!discordLogs || discordLogs.length === 0) && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">No Discord reminder logs</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <p className="text-sm text-gray-600">Page {discordPage} of {Math.max(discordTotalPages, 1)}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={discordPage <= 1 || loadingDiscordLogs}
                    onClick={() => fetchDiscordLogs(discordPage - 1)}
                    className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={discordPage >= discordTotalPages || loadingDiscordLogs || discordTotalPages === 0}
                    onClick={() => fetchDiscordLogs(discordPage + 1)}
                    className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}


