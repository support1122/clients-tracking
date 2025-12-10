import React, { useEffect, useMemo, useState } from 'react';
import Layout from './Layout';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { sanitizePhoneNumber } from '../utils/phoneUtils';

const API_BASE = import.meta.env.VITE_BASE || 'https://clients-tracking-backend.onrender.com';

export default function CallScheduler() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [announceTimeText, setAnnounceTimeText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

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

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const token = localStorage.getItem('authToken');
      const resp = await fetch(`${API_BASE}/api/calls/logs?limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!resp.ok) throw new Error('Failed to load logs');
      const data = await resp.json();
      setLogs(data.logs || []);
    } catch (e) {
      toast.error('Failed to load call logs');
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

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
      fetchLogs();
    } catch (e) {
      toast.error(e.message || 'Failed to schedule');
    } finally {
      setSubmitting(false);
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
            <button onClick={fetchLogs} disabled={loadingLogs} className="ml-auto px-3 py-1.5 text-sm bg-gray-100 rounded border hover:bg-gray-200 disabled:opacity-50">
              {loadingLogs ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
          <div className="px-6 py-4 overflow-x-auto">
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
        </div>
      </div>
    </Layout>
  );
}


