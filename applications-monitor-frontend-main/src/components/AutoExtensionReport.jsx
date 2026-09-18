// Auto Extension — admin-only report on the Flashfire Autopilot.
//
// The autopilot runs the jr-direct-extension unattended on a VPS. It always
// knew how each client's run went; those numbers only ever reached a terminal
// log nobody watches. This page is where they land.
//
// Three numbers per client, in the words ops uses:
//   Captured — job cards the extension pulled off JobRight
//   Pushed   — of those, how many reached the client's dashboard
//   Rejected — captured minus pushed (AI skips, duplicates, blocked, errors)
//
// The Scrape button queues a request rather than calling the autopilot. The
// portal is HTTPS and the autopilot serves plain HTTP, so a browser blocks a
// direct call as mixed content; the autopilot polls this queue instead. See
// Schema_Models/AutopilotRunRequest.js in the dashboard backend.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import toast from 'react-hot-toast';

// The dashboard backend, same env var the AI Summary panel already uses.
const DASHBOARD_BASE = (import.meta.env.VITE_DASHBOARD_BASE || 'http://localhost:8086').replace(/\/+$/, '');
// No ops key is sent from here on purpose. Vite inlines env vars at build
// time, so shipping OPS_SECRET_KEY in this bundle would publish the same key
// that guards /operations/reminders/*, which can email clients. The queue and
// cancel routes are therefore open server-side, like the other portal-facing
// dashboard routes; the routes only the autopilot calls stay gated.

const WINDOWS = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' }
];

// Severity comes from the autopilot's own describe_outcome(), so the colour
// here and the colour in the autopilot UI can never drift apart.
const SEVERITY_STYLES = {
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200',
  bad: 'bg-red-50 text-red-700 ring-red-200',
  '': 'bg-slate-100 text-slate-600 ring-slate-200'
};

const QUEUE_STYLES = {
  queued: 'bg-blue-50 text-blue-700 ring-blue-200',
  claimed: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed: 'bg-red-50 text-red-700 ring-red-200',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-200'
};

const QUEUE_LABELS = {
  queued: 'Queued',
  claimed: 'Running',
  done: 'Finished',
  failed: 'Failed',
  cancelled: 'Cancelled'
};

function fmtWhen(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
  const days = Math.round(mins / (60 * 24));
  if (days <= 14) return `${days}d ago`;
  return d.toLocaleDateString();
}

const fmtExact = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

function Pill({ tone, children, title }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tone}`}
    >
      {children}
    </span>
  );
}

function StatTile({ label, value, hint, tone = 'text-slate-900' }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div> : null}
    </div>
  );
}

export default function AutoExtensionReport() {
  const { user, userRole } = useOutletContext() || {};
  const isAdmin = userRole === 'admin';

  const [days, setDays] = useState(7);
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState(null);
  // The server decides where the window starts (00:00 IST) and says so. We
  // render its label rather than re-deriving one from `days` in the browser's
  // timezone, which is how "Today" ended up meaning two different things on
  // the same screen.
  const [windowLabel, setWindowLabel] = useState('');
  const [queue, setQueue] = useState([]);
  const [search, setSearch] = useState('');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [queueing, setQueueing] = useState({});

  // Guards against a slow response from an earlier window overwriting a newer
  // one, and against setting state after unmount.
  const reqId = useRef(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const load = useCallback(async ({ quiet = false } = {}) => {
    const mine = ++reqId.current;
    if (!quiet) setLoading(true);
    try {
      const [summaryRes, queueRes] = await Promise.all([
        fetch(`${DASHBOARD_BASE}/autopilot/runs/summary?days=${days}`),
        fetch(`${DASHBOARD_BASE}/autopilot/queue?status=queued,claimed&limit=200`)
      ]);
      if (!summaryRes.ok) throw new Error(`Report unavailable (HTTP ${summaryRes.status})`);
      const summary = await summaryRes.json();
      // A failing queue lookup must not blank the whole report.
      const queueBody = queueRes.ok ? await queueRes.json() : { data: [] };

      if (!alive.current || mine !== reqId.current) return;
      setRows(summary.data || []);
      setTotals(summary.totals || null);
      setWindowLabel(summary.windowLabel || '');
      setQueue(queueBody.data || []);
      setErr('');
    } catch (e) {
      if (!alive.current || mine !== reqId.current) return;
      setErr(e.message || 'Could not load the autopilot report');
    } finally {
      if (alive.current && mine === reqId.current) setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // Refresh quietly while anything is queued or running, so the operator sees
  // a run finish without touching the page. Polling stops when the queue
  // empties, so an idle page makes no requests.
  const hasLiveWork = queue.length > 0;
  useEffect(() => {
    if (!hasLiveWork) return undefined;
    const t = setInterval(() => load({ quiet: true }), 20000);
    return () => clearInterval(t);
  }, [hasLiveWork, load]);

  const queueByEmail = useMemo(() => {
    const map = {};
    for (const q of queue) {
      if (q.clientEmail && !map[q.clientEmail]) map[q.clientEmail] = q;
    }
    return map;
  }, [queue]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyProblems && r.lastSeverity !== 'bad' && r.lastSeverity !== 'warn') return false;
      if (!needle) return true;
      return (
        String(r.clientName || '').toLowerCase().includes(needle) ||
        String(r.clientEmail || '').toLowerCase().includes(needle)
      );
    });
  }, [rows, search, onlyProblems]);

  const openDetail = useCallback(async (row) => {
    setSelected(row);
    setDetail(null);
    setDetailLoading(true);
    try {
      const res = await fetch(
        `${DASHBOARD_BASE}/autopilot/runs/client/${encodeURIComponent(row.clientEmail)}?limit=50`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (alive.current) setDetail(body);
    } catch (e) {
      if (alive.current) {
        setDetail({ error: e.message });
        toast.error('Could not load this client\'s run history');
      }
    } finally {
      if (alive.current) setDetailLoading(false);
    }
  }, []);

  const requestScrape = useCallback(async (row, event) => {
    // The button lives inside a clickable row; without this the detail panel
    // opens at the same time.
    if (event) event.stopPropagation();
    const email = row.clientEmail;
    if (queueing[email]) return;
    setQueueing((q) => ({ ...q, [email]: true }));
    try {
      const res = await fetch(`${DASHBOARD_BASE}/autopilot/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientEmail: email,
          clientName: row.clientName || '',
          requestedBy: user?.email || ''
        })
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        toast(body.message || 'Already queued for this client', { icon: '⏳' });
      } else if (!res.ok) {
        throw new Error(body.message || `HTTP ${res.status}`);
      } else {
        toast.success(`Scrape queued for ${row.clientName || email}`);
      }
      await load({ quiet: true });
    } catch (e) {
      toast.error(e.message || 'Could not queue the scrape');
    } finally {
      if (alive.current) setQueueing((q) => ({ ...q, [email]: false }));
    }
  }, [queueing, user, load]);

  const cancelRequest = useCallback(async (request, event) => {
    if (event) event.stopPropagation();
    try {
      const res = await fetch(`${DASHBOARD_BASE}/autopilot/queue/${request._id}/cancel`, {
        method: 'POST'
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.message || `HTTP ${res.status}`);
      toast.success('Request cancelled');
      await load({ quiet: true });
    } catch (e) {
      toast.error(e.message || 'Could not cancel');
    }
  }, [load]);

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Auto Extension</h1>
        <p className="mt-2 text-sm text-slate-600">This report is available to admins only.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] px-3 py-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Auto Extension</h1>
          <p className="mt-0.5 text-sm text-slate-600">
            What the autopilot scraped for each client, and how each run ended.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-300">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                onClick={() => setDays(w.days)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  days === w.days ? 'bg-slate-800 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => load()}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      </div>

      {totals ? (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatTile
            label="Clients"
            value={totals.clients}
            hint={windowLabel || (days === 1 ? 'today (since 00:00 IST)' : `the last ${days} days (IST)`)}
          />
          <StatTile label="Runs" value={totals.runs} />
          <StatTile label="Captured" value={totals.captured} hint="cards pulled off JobRight" />
          <StatTile label="Pushed" value={totals.pushed} tone="text-emerald-700" hint="reached the dashboard" />
          {/* Not "captured minus pushed": this is the sum of each run's own
              rejected count, and a run that pushed a job it captured in an
              earlier batch floors at 0 rather than going negative. Subtracting
              the two tiles above will not always land on this number, and the
              old hint promised that it would. */}
          <StatTile label="Rejected" value={totals.rejected} tone="text-slate-700" hint="captured but not pushed" />
          <StatTile
            label="Failed runs"
            value={totals.failedRuns}
            tone={totals.failedRuns > 0 ? 'text-red-700' : 'text-slate-900'}
            hint={totals.failedRuns > 0 ? 'need a person' : 'nothing to fix'}
          />
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search client name or email…"
          className="min-w-[220px] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        />
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={onlyProblems}
            onChange={(e) => setOnlyProblems(e.target.checked)}
            className="h-4 w-4"
          />
          Only runs that need attention
        </label>
        {queue.length > 0 ? (
          <Pill tone={QUEUE_STYLES.queued}>{queue.length} queued or running</Pill>
        ) : null}
      </div>

      {err ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
          <div className="mt-1 text-xs text-red-600">
            Dashboard backend at <code>{DASHBOARD_BASE}</code> reachable?
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Client</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last run</th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Captured</th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pushed</th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rejected</th>
              <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">How it ended</th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Runs</th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total pushed</th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Scrape</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">Loading…</td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">
                  {rows.length === 0
                    ? 'No autopilot runs recorded yet in this window. Runs appear here as the autopilot finishes them.'
                    : 'No client matches this filter.'}
                </td>
              </tr>
            ) : (
              visible.map((r) => {
                const live = queueByEmail[r.clientEmail];
                const busy = Boolean(live) || queueing[r.clientEmail];
                return (
                  <tr
                    key={r.clientEmail}
                    onClick={() => openDetail(r)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="px-3 py-2">
                      <div className="text-sm font-semibold text-slate-900">{r.clientName || '—'}</div>
                      <div className="text-[11px] text-slate-500">{r.clientEmail}</div>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700" title={fmtExact(r.lastRunAt)}>
                      {fmtWhen(r.lastRunAt)}
                      <div className="text-[11px] text-slate-500">
                        {r.lastMinutes ? `${r.lastMinutes} min` : ''}
                        {r.lastTrigger === 'portal' ? ' · from portal' : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-800">{r.lastCaptured ?? 0}</td>
                    <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-emerald-700">{r.lastPushed ?? 0}</td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-600">{r.lastRejected ?? 0}</td>
                    <td className="px-3 py-2">
                      <Pill tone={SEVERITY_STYLES[r.lastSeverity] ?? SEVERITY_STYLES['']}>
                        {r.lastOutcomeLabel || r.lastOutcome || 'Unknown'}
                      </Pill>
                      {r.lastWhy ? (
                        <div className="mt-0.5 max-w-md text-[11px] leading-snug text-slate-500">{r.lastWhy}</div>
                      ) : null}
                      {r.lastError ? (
                        <div className="mt-0.5 max-w-md text-[11px] leading-snug text-red-600">{r.lastError}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-700">
                      {r.runs}
                      {r.failedRuns > 0 ? (
                        <span className="ml-1 text-[11px] font-semibold text-red-600">({r.failedRuns} failed)</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-700">{r.totalPushed}</td>
                    <td className="px-3 py-2 text-right">
                      {live ? (
                        <div className="flex items-center justify-end gap-1">
                          <Pill tone={QUEUE_STYLES[live.status]}>{QUEUE_LABELS[live.status] || live.status}</Pill>
                          {live.status === 'queued' ? (
                            <button
                              onClick={(e) => cancelRequest(live, e)}
                              className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <button
                          onClick={(e) => requestScrape(r, e)}
                          disabled={busy}
                          className="rounded-md bg-orange-600 px-3 py-1 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                        >
                          {queueing[r.clientEmail] ? 'Queueing…' : 'Scrape'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        <strong>Captured</strong> is how many job cards the extension pulled off JobRight.{' '}
        <strong>Pushed</strong> is how many of those reached the client&apos;s dashboard.{' '}
        <strong>Rejected</strong> is the rest — AI skips, duplicates, blocked cards and errors.
        Scrape queues a run; the autopilot picks it up within about half a minute and it
        takes roughly 20 minutes to finish. A run stops at the client&apos;s <strong>daily cap</strong>,
        which manual operator pushes share — so a client an operator already worked by hand
        may only have a few slots left, and a short run is correct rather than broken.
      </p>

      {selected ? (
        <ClientRunDetail
          row={selected}
          detail={detail}
          loading={detailLoading}
          onClose={() => { setSelected(null); setDetail(null); }}
          onScrape={(e) => requestScrape(selected, e)}
          live={queueByEmail[selected.clientEmail]}
          queueing={Boolean(queueing[selected.clientEmail])}
        />
      ) : null}
    </div>
  );
}

// Run history for one client — the panel behind a table row.
function ClientRunDetail({ row, detail, loading, onClose, onScrape, live, queueing }) {
  // Escape closes, matching every other overlay in this portal.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const totals = detail?.totals;
  const runs = detail?.runs || [];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div
        className="mt-8 w-full max-w-4xl rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{row.clientName || row.clientEmail}</h2>
            <p className="text-xs text-slate-500">{row.clientEmail}</p>
            {row.profile ? (
              <p className="mt-0.5 text-[11px] text-slate-400">Chrome profile: {row.profile}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {live ? (
              <Pill tone={QUEUE_STYLES[live.status]}>{QUEUE_LABELS[live.status] || live.status}</Pill>
            ) : (
              <button
                onClick={onScrape}
                disabled={queueing}
                className="rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {queueing ? 'Queueing…' : 'Scrape now'}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="px-5 py-4">
          {loading ? (
            <div className="py-10 text-center text-sm text-slate-500">Loading run history…</div>
          ) : detail?.error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {detail.error}
            </div>
          ) : (
            <>
              {totals ? (
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <StatTile label="Runs" value={totals.runs} />
                  <StatTile label="Captured" value={totals.captured} />
                  <StatTile label="Pushed" value={totals.pushed} tone="text-emerald-700" />
                  <StatTile label="Rejected" value={totals.rejected} />
                </div>
              ) : null}

              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Run history</h3>
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">When</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Captured</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pushed</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Rejected</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500" title="The client's daily cap (ProfileModel.targetJobCount). Manual operator pushes spend the same allowance; it resets at 22:00 IST.">Daily cap</th>
                      <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">Minutes</th>
                      <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">How it ended</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {runs.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-3 py-8 text-center text-sm text-slate-500">
                          No runs recorded for this client yet.
                        </td>
                      </tr>
                    ) : (
                      runs.map((run) => (
                        <tr key={run._id}>
                          <td className="px-3 py-2 text-sm text-slate-700" title={fmtExact(run.finishedAt)}>
                            {fmtWhen(run.finishedAt)}
                            {run.trigger === 'portal' ? (
                              <div className="text-[11px] text-slate-400">
                                from portal{run.requestedBy ? ` · ${run.requestedBy}` : ''}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-800">{run.captured}</td>
                          <td className="px-3 py-2 text-right text-sm font-semibold tabular-nums text-emerald-700">{run.pushed}</td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-600">{run.rejected}</td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-500">{run.cap || '—'}</td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums text-slate-600">{run.minutes}</td>
                          <td className="px-3 py-2">
                            <Pill tone={SEVERITY_STYLES[run.severity] ?? SEVERITY_STYLES['']}>
                              {run.outcomeLabel || run.outcome || 'Unknown'}
                            </Pill>
                            {run.why ? (
                              <div className="mt-0.5 max-w-lg text-[11px] leading-snug text-slate-500">{run.why}</div>
                            ) : null}
                            {run.errorText ? (
                              <div className="mt-0.5 max-w-lg text-[11px] leading-snug text-red-600">{run.errorText}</div>
                            ) : null}
                            {run.attempts > 1 ? (
                              <div className="mt-0.5 text-[11px] text-amber-600">{run.attempts} attempts</div>
                            ) : null}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {detail?.requests?.length ? (
                <>
                  <h3 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Scrape requests from this portal
                  </h3>
                  <ul className="space-y-1">
                    {detail.requests.map((q) => (
                      <li key={q._id} className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                        <Pill tone={QUEUE_STYLES[q.status] ?? QUEUE_STYLES.cancelled}>
                          {QUEUE_LABELS[q.status] || q.status}
                        </Pill>
                        <span>{fmtExact(q.createdAt)}</span>
                        {q.requestedBy ? <span className="text-slate-400">by {q.requestedBy}</span> : null}
                        {q.message ? <span className="text-slate-500">— {q.message}</span> : null}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
