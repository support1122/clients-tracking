import React, { useEffect, useState, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_BASE || 'https://clients-tracking-backend.onrender.com';

function GoogleIcon({ size = 18 }) {
  // Multi-color official-style "G" mark.
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.6-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/>
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 18.9 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
      <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2 14-5.3l-6.5-5.5c-2 1.5-4.6 2.4-7.5 2.4-5.3 0-9.7-3.4-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z"/>
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.5l6.5 5.5c-.4.4 7.1-5.2 7.1-15 0-1.3-.1-2.4-.4-3.5z"/>
    </svg>
  );
}

export default function ConnectGmailButton() {
  const [status, setStatus] = useState({ connected: false, email: '' });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const loadStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('authToken');
      if (!token) { setLoading(false); return; }
      const res = await fetch(`${API_BASE}/api/gmail/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { setStatus({ connected: false, email: '' }); return; }
      const data = await res.json();
      setStatus({ connected: !!data.connected, email: data.email || '' });
    } catch {
      setStatus({ connected: false, email: '' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  useEffect(() => {
    const onFocus = () => loadStatus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadStatus]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleConnect = () => {
    setOpen(false);
    window.open(`${API_BASE}/auth/google?email=system`, '_blank', 'noopener,noreferrer');
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect the current Google account? System emails will fail until you reconnect.')) return;
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`${API_BASE}/api/gmail/disconnect`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) await loadStatus();
    } catch (_) { /* ignore */ }
    setOpen(false);
  };

  if (loading) return null;

  const dotColor = status.connected ? 'bg-emerald-500' : 'bg-red-500';

  return (
    <div ref={wrapRef} className="relative inline-flex items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={status.connected ? `Google connected: ${status.email}` : 'Connect Google account'}
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-full border border-slate-300 bg-white hover:bg-slate-50 shadow-sm transition-all"
      >
        <GoogleIcon size={18} />
        <span className={`absolute -bottom-0.5 -right-0.5 inline-block h-2.5 w-2.5 rounded-full ${dotColor} ring-2 ring-white`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 w-64 rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
            <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Google account</div>
            <div className="text-sm text-slate-800 truncate mt-0.5">
              {status.connected ? status.email : 'Not connected'}
            </div>
          </div>
          <div className="p-2 flex flex-col gap-1">
            <button
              type="button"
              onClick={handleConnect}
              className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-2"
            >
              <GoogleIcon size={14} />
              <span>{status.connected ? 'Change account' : 'Connect Google account'}</span>
            </button>
            {status.connected && (
              <button
                type="button"
                onClick={handleDisconnect}
                className="w-full text-left px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
