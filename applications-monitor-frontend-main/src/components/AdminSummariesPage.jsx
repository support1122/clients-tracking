// Admin AI Summaries — dedicated page.
//
// Layout: master/detail.
//   • Top bar          — title + 4 stat tiles (clients / built / coverage / ops total)
//   • Left column      — sticky search + filter chips + scrollable client list with
//                        status pills + cap progress bars + recency timestamps
//   • Right column     — selected-client summary editor + push-history bar chart +
//                        target-cap editor. Empty state with hint when nothing picked.
//
// All admin-editable AI fields live in dashboard-backend's ProfileModel
// (aiSummary, aiSummaryMeta, targetJobCount). This page calls:
//   GET  /summaries-overview        — master list
//   GET  /get-profile?email=        — full profile for selected
//   POST /build-ai-summary          — server-side OpenAI build
//   POST /update-ai-summary         — manual edit save
//   POST /update-target-jobs        — set/remove cap
//   GET  /push-history?email=       — daily pushes (chart)

import React, { useEffect, useMemo, useState, useRef } from 'react';

const DASHBOARD_BASE = (import.meta.env.VITE_DASHBOARD_BASE || 'http://localhost:8086').replace(/\/+$/, '');

const FILTER_LABELS = {
    all: 'All',
    built: 'Summary built',
    missing: 'Missing summary',
    stale: 'Profile changed',
    capped: 'Has cap',
    'cap-reached': 'Cap reached',
    'no-cap': 'No cap',
};

export default function AdminSummariesPage() {
    const [overview, setOverview] = useState(null);
    const [overviewLoading, setOverviewLoading] = useState(false);
    const [overviewError, setOverviewError] = useState(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [selectedEmail, setSelectedEmail] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    // Bulk-build state for "Build all" button.
    const [bulkRunning, setBulkRunning] = useState(false);
    const [bulkProgress, setBulkProgress] = useState(null); // {done,total,current,errors:[]}
    const bulkAbortRef = useRef(false);

    // Read deep-link param so the page can be linked to with a preselected client.
    useEffect(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            const email = params.get('clientEmail');
            if (email) setSelectedEmail(email.toLowerCase());
        } catch { /* ignore */ }
    }, []);

    useEffect(() => {
        loadOverview();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshKey]);

    async function loadOverview() {
        setOverviewLoading(true);
        setOverviewError(null);
        try {
            const r = await fetch(`${DASHBOARD_BASE}/summaries-overview`);
            const body = await r.json();
            if (!r.ok || !body?.success) {
                setOverviewError(body?.message || `HTTP ${r.status}`);
                return;
            }
            setOverview(body);
        } catch (e) {
            setOverviewError(e.message);
        } finally {
            setOverviewLoading(false);
        }
    }

    const rows = overview?.rows || [];
    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter((r) => {
            if (q) {
                const blob = `${r.email} ${r.name} ${(r.preferredRoles || []).join(' ')} ${(r.preferredLocations || []).join(' ')}`.toLowerCase();
                if (!blob.includes(q)) return false;
            }
            if (filter === 'built' && !r.hasSummary) return false;
            if (filter === 'missing' && r.hasSummary) return false;
            if (filter === 'stale' && !(r.hasSummary && r.summaryStale)) return false;
            if (filter === 'capped' && r.targetJobCount == null) return false;
            if (filter === 'no-cap' && r.targetJobCount != null) return false;
            if (filter === 'cap-reached' && r.capStatus !== 'reached' && r.capStatus !== 'over') return false;
            return true;
        });
    }, [rows, search, filter]);

    const totals = overview?.totals || { clients: 0, withSummary: 0, withoutSummary: 0, stale: 0, withCap: 0, opsTotal: 0 };
    const coverage = totals.clients > 0 ? Math.round((totals.withSummary / totals.clients) * 100) : 0;
    const bulkTargets = useMemo(
        () => rows.filter((r) => !r.hasSummary || r.summaryStale),
        [rows],
    );

    // Build summaries for every client missing one OR flagged stale,
    // sequentially so we never hammer OpenAI. Refreshes overview after
    // each call so the UI reflects progress live.
    async function bulkBuildAll() {
        if (bulkRunning) return;
        const targets = bulkTargets;
        if (targets.length === 0) return;
        setBulkRunning(true);
        bulkAbortRef.current = false;
        const errors = [];
        setBulkProgress({ done: 0, total: targets.length, current: targets[0].email, errors });
        for (let i = 0; i < targets.length; i += 1) {
            if (bulkAbortRef.current) break;
            const t = targets[i];
            setBulkProgress({ done: i, total: targets.length, current: t.email, errors: [...errors] });
            try {
                const r = await fetch(`${DASHBOARD_BASE}/build-ai-summary`, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ email: t.email }),
                });
                const body = await r.json().catch(() => null);
                if (!r.ok || !body?.success) {
                    errors.push({ email: t.email, error: body?.error || `HTTP ${r.status}`, message: body?.message || '' });
                }
            } catch (e) {
                errors.push({ email: t.email, error: 'NETWORK', message: e.message });
            }
        }
        setBulkProgress({ done: targets.length, total: targets.length, current: '', errors });
        setBulkRunning(false);
        await loadOverview();
    }
    function abortBulk() { bulkAbortRef.current = true; }

    const selected = useMemo(
        () => filtered.find((r) => r.email === selectedEmail) || rows.find((r) => r.email === selectedEmail) || null,
        [selectedEmail, filtered, rows],
    );

    return (
        <div className="min-h-screen bg-slate-50">
            {/* HEADER */}
            <div className="bg-white border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-6 py-5">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-slate-900">AI Summaries</h1>
                            <p className="text-sm text-slate-500 mt-1">
                                Manage candidate briefs + per-client push caps used by the JR-Direct extension's grader.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            {bulkRunning ? (
                                <button
                                    onClick={abortBulk}
                                    className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium border border-red-200"
                                >
                                    ✕ Stop bulk build
                                </button>
                            ) : (
                                <button
                                    onClick={bulkBuildAll}
                                    disabled={bulkTargets.length === 0}
                                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Build summaries for every client missing one or flagged stale (profile changed)."
                                >
                                    ⚡ Build all ({bulkTargets.length})
                                </button>
                            )}
                            <button
                                onClick={() => setRefreshKey((k) => k + 1)}
                                disabled={bulkRunning}
                                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium border border-slate-200 disabled:opacity-50"
                            >
                                ↻ Refresh
                            </button>
                        </div>
                    </div>

                    {/* BULK PROGRESS STRIP */}
                    {bulkProgress && (
                        <div className="mt-4 px-4 py-3 rounded-xl bg-slate-900 text-white">
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="font-semibold">
                                    {bulkRunning ? 'Building…' : 'Bulk build complete'}
                                </span>
                                <span className="text-slate-300 font-mono">
                                    {bulkProgress.done} / {bulkProgress.total}
                                    {bulkProgress.current && ` · ${bulkProgress.current}`}
                                </span>
                            </div>
                            <div className="mt-2 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-400 transition-all duration-300"
                                    style={{ width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }}
                                />
                            </div>
                            {bulkProgress.errors?.length > 0 && (
                                <div className="mt-2 text-xs text-red-300">
                                    {bulkProgress.errors.length} error{bulkProgress.errors.length > 1 ? 's' : ''}
                                    {bulkProgress.errors.slice(0, 3).map((e, i) => (
                                        <span key={i} className="ml-2 opacity-80">· {e.email}: {e.error}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* GLOBAL OPENAI KEY — single source of truth for every
                        client. Extension falls back to this when a profile
                        doesn't carry its own override. */}
                    <GlobalOpenaiKeyCard />

                    {/* STAT TILES */}
                    <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mt-5">
                        <StatTile label="Clients" value={totals.clients} />
                        <StatTile label="Summaries built" value={totals.withSummary} sub={`${coverage}% coverage`} accent="emerald" />
                        <StatTile label="Missing summary" value={totals.withoutSummary} sub="needs build" accent="amber" />
                        <StatTile label="Profile changed" value={totals.stale || 0} sub="needs rebuild" accent="orange" />
                        <StatTile label="Ops today" value={totals.opsToday || 0} sub={`${totals.opsTotal} lifetime`} accent="blue" />
                        <StatTile label="LinkedIn skipped" value={totals.linkedinSkippedTotal || 0} sub="ext sessions" accent="rose" />
                    </div>

                    {/* TOP OPERATORS — who pushed how many today + lifetime */}
                    <OperatorsLeaderboard operators={overview?.operators || []} />

                    {/* PER-CODE PER-DAY ACTIVITY — captures / linkedin-skip /
                        role-mismatch / other / picks / pushed for each operator
                        identified by their 5-digit extension code. */}
                    <OperatorActivityTable />
                </div>
            </div>

            {/* BODY */}
            <div className="max-w-7xl mx-auto px-6 py-6">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    {/* LEFT — list */}
                    <aside className="lg:col-span-4 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] flex flex-col bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                        <div className="p-4 border-b border-slate-200 bg-slate-50">
                            <div className="relative">
                                <input
                                    type="search"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    placeholder="Search name, email, roles…"
                                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                                />
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                            </div>
                            <div className="flex gap-1.5 flex-wrap mt-3">
                                {Object.keys(FILTER_LABELS).map((k) => (
                                    <button
                                        key={k}
                                        onClick={() => setFilter(k)}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                                            filter === k
                                                ? 'bg-slate-900 text-white'
                                                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                        }`}
                                    >
                                        {FILTER_LABELS[k]}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                            {overviewLoading && !overview && (
                                <div className="p-6 text-center text-slate-500 text-sm">Loading clients…</div>
                            )}
                            {overviewError && (
                                <div className="p-6 text-center">
                                    <div className="text-red-700 text-sm font-medium">Failed to load</div>
                                    <div className="text-xs text-red-600 mt-1 font-mono">{overviewError}</div>
                                    <div className="text-xs text-slate-500 mt-2">
                                        Dashboard backend at <code>{DASHBOARD_BASE}</code> reachable?
                                    </div>
                                </div>
                            )}
                            {overview && filtered.length === 0 && (
                                <div className="p-6 text-center text-slate-500 text-sm">No clients match.</div>
                            )}
                            {filtered.map((r) => (
                                <ClientRow
                                    key={r.email}
                                    row={r}
                                    selected={r.email === selectedEmail}
                                    onClick={() => setSelectedEmail(r.email)}
                                />
                            ))}
                        </div>

                        <div className="p-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 text-center">
                            Showing {filtered.length} of {rows.length} · sorted by recent ops pushes
                        </div>
                    </aside>

                    {/* RIGHT — detail */}
                    <main className="lg:col-span-8">
                        {!selected ? (
                            <EmptyState rowCount={rows.length} />
                        ) : (
                            <ClientDetailPane
                                key={selected.email}
                                row={selected}
                                onProfileChanged={() => setRefreshKey((k) => k + 1)}
                            />
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
}

// -------------------------------------------------------------------------
// LEFT — list row
// -------------------------------------------------------------------------

function ClientRow({ row, selected, onClick }) {
    const initials = (row.name || row.email).split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
    const cap = row.targetJobCount;
    const ops = row.currentOpsCount;
    const capPct = cap ? Math.min(100, Math.round((ops / cap) * 100)) : null;
    return (
        <button
            onClick={onClick}
            className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${
                selected ? 'bg-blue-50 border-l-4 border-l-blue-500 -ml-1 pl-3' : 'hover:bg-slate-50'
            }`}
        >
            <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    selected ? 'bg-blue-100 text-blue-900' : 'bg-slate-200 text-slate-700'
                }`}>
                    {initials}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 text-sm truncate">{row.name}</span>
                        {row.hasSummary
                            ? (row.summaryStale
                                ? <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-700 flex-shrink-0" title="Profile changed since last summary build — rebuild recommended.">↻ CHANGED</span>
                                : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 flex-shrink-0">✓ BUILT</span>)
                            : <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 flex-shrink-0">⚠ MISSING</span>}
                    </div>
                    <div className="text-xs text-slate-500 truncate">{row.email}</div>
                    {row.planType && <div className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">{row.planType}</div>}
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-slate-600">
                        <span>📤 {ops}</span>
                        {cap != null ? (
                            <>
                                <span className="text-slate-300">/</span>
                                <span className={row.capStatus === 'reached' || row.capStatus === 'over' ? 'text-red-600 font-bold' : ''}>{cap}</span>
                                <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full ${
                                            capPct >= 100 ? 'bg-red-500'
                                            : capPct >= 80 ? 'bg-amber-500'
                                            : 'bg-emerald-500'
                                        }`}
                                        style={{ width: `${capPct}%` }}
                                    />
                                </div>
                            </>
                        ) : (
                            <span className="text-slate-400 italic">no cap</span>
                        )}
                    </div>
                </div>
            </div>
        </button>
    );
}

// -------------------------------------------------------------------------
// RIGHT — detail pane
// -------------------------------------------------------------------------

function ClientDetailPane({ row, onProfileChanged }) {
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [error, setError] = useState(null);
    const [message, setMessage] = useState(null);
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState('');
    const [building, setBuilding] = useState(false);
    const [saving, setSaving] = useState(false);
    const [targetDraft, setTargetDraft] = useState('');
    const [savingTarget, setSavingTarget] = useState(false);
    function showMessage(text, kind = 'ok') {
        setMessage({ text, kind });
        setError(null);
        setTimeout(() => setMessage(null), 4500);
    }
    function showError(text) {
        setError(text);
        setMessage(null);
    }

    async function loadProfile() {
        setLoading(true);
        try {
            const r = await fetch(`${DASHBOARD_BASE}/get-profile?email=${encodeURIComponent(row.email)}`);
            const body = await r.json().catch(() => null);
            if (!r.ok) {
                showError(`Profile load failed: ${body?.message || `HTTP ${r.status}`}`);
                setProfile(null);
                return;
            }
            const p = body?.userProfile || null;
            setProfile(p);
            setDraft(p?.aiSummary || '');
            setTargetDraft(p?.targetJobCount != null ? String(p.targetJobCount) : '');
        } catch (e) {
            showError(`Network error: ${e.message}`);
        } finally {
            setLoading(false);
        }
    }

    async function loadHistory(days = 30) {
        setHistoryLoading(true);
        try {
            const r = await fetch(`${DASHBOARD_BASE}/push-history?email=${encodeURIComponent(row.email)}&days=${days}`);
            const body = await r.json().catch(() => null);
            setHistory(r.ok && body?.success ? body : null);
        } catch {
            setHistory(null);
        } finally {
            setHistoryLoading(false);
        }
    }

    useEffect(() => {
        loadProfile();
        loadHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [row.email]);

    async function buildSummary() {
        setBuilding(true);
        setError(null);
        try {
            const r = await fetch(`${DASHBOARD_BASE}/build-ai-summary`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: row.email }),
            });
            const body = await r.json().catch(() => null);
            if (!r.ok || !body?.success) {
                const step = body?.step ? ` [step: ${body.step}]` : '';
                showError(`Build failed: ${body?.error || `HTTP ${r.status}`}${step} — ${body?.message || ''}`);
                return;
            }
            showMessage(`Summary built (${body.wordCount} words, ${body.source}).`);
            setEditing(false);
            await loadProfile();
            onProfileChanged?.();
        } catch (e) {
            showError(`Network error: ${e.message}`);
        } finally {
            setBuilding(false);
        }
    }

    async function saveEdit() {
        const text = draft.trim();
        if (!text) { showError('Summary cannot be empty.'); return; }
        setSaving(true);
        try {
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            const r = await fetch(`${DASHBOARD_BASE}/update-ai-summary`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    email: row.email,
                    aiSummary: text,
                    model: 'manual-edit',
                    source: 'admin-summaries-page',
                    wordCount,
                }),
            });
            const body = await r.json().catch(() => null);
            if (!r.ok || body?.success === false) {
                showError(`Save failed: ${body?.message || `HTTP ${r.status}`}`);
                return;
            }
            showMessage(`Saved (${wordCount} words).`);
            setEditing(false);
            await loadProfile();
            onProfileChanged?.();
        } catch (e) {
            showError(`Network error: ${e.message}`);
        } finally {
            setSaving(false);
        }
    }

    async function saveTarget() {
        const val = targetDraft.trim();
        const n = val === '' ? null : Number.parseInt(val, 10);
        if (n !== null && (!Number.isInteger(n) || n < 0 || n > 10000)) {
            showError('Target must be 0-10000 (or empty for no cap).');
            return;
        }
        setSavingTarget(true);
        try {
            const r = await fetch(`${DASHBOARD_BASE}/update-target-jobs`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: row.email, targetJobCount: n }),
            });
            const body = await r.json().catch(() => null);
            if (!r.ok || body?.success === false) {
                showError(`Save target failed: ${body?.message || `HTTP ${r.status}`}`);
                return;
            }
            showMessage(n === null ? 'Target removed (no cap).' : `Target set to ${n} jobs.`);
            await loadProfile();
            await loadHistory();
            onProfileChanged?.();
        } catch (e) {
            showError(`Network error: ${e.message}`);
        } finally {
            setSavingTarget(false);
        }
    }

    const summary = profile?.aiSummary || '';
    const meta = profile?.aiSummaryMeta || {};
    const builtAt = meta.builtAt ? new Date(meta.builtAt).toLocaleString() : null;

    return (
        <div className="space-y-5">
            {/* Client identity card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">{row.name}</h2>
                        <div className="text-sm text-slate-500 font-mono">{row.email}</div>
                        <div className="flex flex-wrap gap-1.5 mt-3">
                            {row.planType && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-blue-100 text-blue-700">
                                    {row.planType}
                                </span>
                            )}
                            {(row.preferredRoles || []).slice(0, 4).map((rr) => (
                                <span key={rr} className="px-2 py-0.5 rounded text-[11px] bg-blue-50 text-blue-700 border border-blue-200">{rr}</span>
                            ))}
                            {(row.preferredLocations || []).slice(0, 3).map((loc) => (
                                <span key={loc} className="px-2 py-0.5 rounded text-[11px] bg-slate-100 text-slate-600 border border-slate-200">📍 {loc}</span>
                            ))}
                        </div>
                    </div>
                    <a
                        href={`/monitor-clients?clientEmail=${encodeURIComponent(row.email)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 hover:underline"
                    >
                        View full profile ↗
                    </a>
                </div>
            </div>

            {/* Messages */}
            {message && (
                <div className="px-4 py-2.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-sm">
                    {message.text}
                </div>
            )}
            {error && (
                <div className="px-4 py-2.5 rounded-lg bg-red-50 text-red-800 border border-red-200 text-sm font-mono">
                    {error}
                </div>
            )}

            {/* Operator breakdown — who worked this client */}
            <OperatorBreakdownCard rows={row.operatorBreakdown || []} ext={row.extensionStats} />

            {/* Push history */}
            <PushHistoryCard history={history} loading={historyLoading} onReload={loadHistory} />

            {/* Target cap */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            🎯 Target job count cap
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Daily cap. <code>/addjob</code> refuses ops pushes once today's count hits this number — resets at 00:00 IST. Empty = falls back to default 30/day.
                        </p>
                    </div>
                    {(() => {
                        const ci = history?.capInfo || {};
                        const todayOps = Number.isFinite(Number(ci.currentOps)) ? ci.currentOps : 0;
                        const eff = ci.effectiveCap ?? row.targetJobCount ?? 30;
                        const isDefault = ci.isDefaultCap === true || row.targetJobCount == null;
                        const reached = todayOps >= eff;
                        return (
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                                reached ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                                {todayOps} / {eff}{isDefault ? ' (default)' : ''} today
                            </span>
                        );
                    })()}
                </div>
                <div className="flex gap-2">
                    <input
                        type="number"
                        min="0"
                        max="10000"
                        step="5"
                        value={targetDraft}
                        onChange={(e) => setTargetDraft(e.target.value)}
                        placeholder="(empty = no cap)"
                        className="flex-1 px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <button
                        onClick={saveTarget}
                        disabled={savingTarget}
                        className="px-4 py-2 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 disabled:opacity-50"
                    >
                        {savingTarget ? 'Saving…' : 'Update cap'}
                    </button>
                </div>
            </div>

            {/* AI summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
                    <div>
                        <h3 className="font-bold text-slate-900">Candidate Summary</h3>
                        <div className="text-xs mt-1">
                            {summary ? (
                                profile?.summaryStale ? (
                                    <span className="text-orange-700 font-semibold">
                                        ↻ Profile changed — rebuild recommended.
                                        {builtAt && <span className="text-slate-500 ml-1 font-normal">(saved {builtAt})</span>}
                                    </span>
                                ) : (
                                    <span className="text-emerald-700">
                                        Saved · {meta.wordCount || '?'} words {builtAt && `· ${builtAt}`}
                                        {meta.source && <span className="text-slate-500 ml-1">({meta.source})</span>}
                                    </span>
                                )
                            ) : (
                                <span className="text-amber-700">Not built yet — click Build to generate.</span>
                            )}
                        </div>
                    </div>
                    {!editing && (
                        <div className="flex gap-2 flex-shrink-0">
                            <button
                                onClick={buildSummary}
                                disabled={building}
                                className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
                            >
                                {building ? 'Building (~15s)…' : (summary ? '↻ Rebuild' : 'Build summary')}
                            </button>
                            {summary && (
                                <button
                                    onClick={() => { setDraft(summary); setEditing(true); }}
                                    className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                                >
                                    ✎ Edit
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-5">
                    {loading && !profile && <div className="text-slate-400 text-sm">Loading…</div>}
                    {!editing && (
                        summary ? (
                            <pre className="whitespace-pre-wrap text-sm text-slate-800 font-sans leading-relaxed max-h-[480px] overflow-y-auto pr-1">{summary}</pre>
                        ) : (
                            <div className="text-slate-400 italic text-sm">No summary on file. Click <strong>Build summary</strong> above.</div>
                        )
                    )}
                    {editing && (
                        <>
                            <textarea
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                rows={22}
                                className="w-full p-3 border border-blue-300 rounded-xl bg-blue-50/30 text-sm font-mono text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-500"
                                placeholder="Edit candidate summary…"
                            />
                            <div className="flex justify-between items-center mt-3">
                                <span className="text-xs text-slate-500">{draft.trim().split(/\s+/).filter(Boolean).length} words</span>
                                <div className="flex gap-2">
                                    <button onClick={() => { setEditing(false); setDraft(summary); }} className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300">Cancel</button>
                                    <button onClick={saveEdit} disabled={saving} className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Per-client OpenAI key card removed — single global key now lives
                in the page header. Extension falls back to that global key
                whenever a client profile doesn't carry its own. */}
        </div>
    );
}

// -------------------------------------------------------------------------
// Push history card with bar chart + table
// -------------------------------------------------------------------------

function PushHistoryCard({ history, loading, onReload }) {
    if (loading && !history) {
        return <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 text-slate-400 text-sm">Loading push history…</div>;
    }
    const totalOps = history?.totals?.ops || 0;
    const totalAll = history?.totals?.all || 0;
    const ci = history?.capInfo || {};
    const explicitCap = ci.targetJobCount;
    const effectiveCap = ci.effectiveCap ?? explicitCap;
    const isDefaultCap = ci.isDefaultCap === true;
    const todayOps = Number.isFinite(Number(ci.currentOps)) ? ci.currentOps : 0;
    const remaining = ci.remaining;
    const rows = history?.history || [];
    const days = history?.days || 30;
    const today = new Date();
    const denseDays = [];
    for (let i = days - 1; i >= 0; i -= 1) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const found = rows.find((r) => r.date === key);
        denseDays.push({ date: key, ops: found?.ops || 0, all: found?.all || 0 });
    }
    const maxOps = denseDays.reduce((m, r) => (r.ops > m ? r.ops : m), 0) || 1;
    const recent = denseDays.slice(-7);

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                    <h3 className="font-bold text-slate-900 flex items-center gap-2">📊 Push History</h3>
                    <p className="text-xs text-slate-500 mt-1">Operator-pushed jobs · last {days} days</p>
                </div>
                <button onClick={() => onReload(days)} className="text-xs text-blue-600 hover:underline">↻ Refresh</button>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
                <MiniStat label="Today" value={todayOps} sub={isDefaultCap ? `of ${effectiveCap} (default)` : `of ${effectiveCap}`} color="blue" />
                <MiniStat label="Cap left" value={effectiveCap == null ? '∞' : remaining ?? Math.max(0, effectiveCap - todayOps)} color="amber" />
                <MiniStat label="Ops lifetime" value={totalOps} color="indigo" />
                <MiniStat label="All jobs" value={totalAll} color="emerald" />
            </div>

            {/* Bar chart — full window */}
            <div className="flex items-end gap-1 h-24 mb-4 bg-slate-50 rounded-lg p-2 border border-slate-100">
                {denseDays.map((d) => {
                    const h = (d.ops / maxOps) * 100;
                    return (
                        <div
                            key={d.date}
                            title={`${d.date}: ${d.ops} ops · ${d.all} total`}
                            className="flex-1 min-w-[4px] flex flex-col justify-end"
                        >
                            <div
                                className={`rounded-t transition-all ${d.ops > 0 ? 'bg-blue-500' : 'bg-slate-200'}`}
                                style={{ height: `${Math.max(h, 4)}%` }}
                            />
                        </div>
                    );
                })}
            </div>

            {/* Recent days table */}
            <div className="text-xs">
                <div className="text-slate-500 mb-1">Last 7 days</div>
                <div className="grid grid-cols-7 gap-1">
                    {recent.map((d) => (
                        <div
                            key={d.date}
                            className={`p-2 rounded text-center ${d.ops > 0 ? 'bg-blue-50 border border-blue-200' : 'bg-slate-50 border border-slate-200'}`}
                        >
                            <div className="text-[10px] text-slate-500 font-mono">{d.date.slice(5)}</div>
                            <div className={`text-base font-bold ${d.ops > 0 ? 'text-blue-700' : 'text-slate-400'}`}>{d.ops}</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function MiniStat({ label, value, sub, color }) {
    const colorMap = {
        blue: 'bg-blue-50 border-blue-200 text-blue-900',
        emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
        amber: 'bg-amber-50 border-amber-200 text-amber-900',
        indigo: 'bg-indigo-50 border-indigo-200 text-indigo-900',
        slate: 'bg-slate-50 border-slate-200 text-slate-900',
    };
    return (
        <div className={`border rounded-lg p-2 text-center ${colorMap[color] || colorMap.slate}`}>
            <div className="text-[10px] uppercase tracking-wide opacity-70">{label}</div>
            <div className="text-xl font-bold">{value}</div>
            {sub && <div className="text-[9px] opacity-60 mt-0.5">{sub}</div>}
        </div>
    );
}

// -------------------------------------------------------------------------
// Empty state + header tile
// -------------------------------------------------------------------------

function EmptyState({ rowCount }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="text-6xl mb-4">👈</div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Pick a client</h2>
            <p className="text-sm text-slate-500">
                {rowCount === 0
                    ? 'No clients found. Onboard one in Register Client first.'
                    : 'Select from the list to manage their summary, target cap, and push history.'}
            </p>
        </div>
    );
}

function StatTile({ label, value, sub, accent = 'slate' }) {
    const accentMap = {
        slate: 'text-slate-900',
        emerald: 'text-emerald-700',
        amber: 'text-amber-700',
        orange: 'text-orange-700',
        blue: 'text-blue-700',
        rose: 'text-rose-700',
    };
    return (
        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
            <div className={`text-2xl font-bold mt-1 ${accentMap[accent]}`}>{value}</div>
            {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
        </div>
    );
}

// -------------------------------------------------------------------------
// OperatorsLeaderboard: shows who's pushing jobs and how much. Lifetime +
// today + clients-served, sorted by today desc. Drives ops visibility for
// admins ("who is working and who is not"). Renders nothing when empty.
// -------------------------------------------------------------------------
function OperatorsLeaderboard({ operators }) {
    if (!operators || operators.length === 0) return null;
    const top = operators.slice(0, 12);
    const max = Math.max(...top.map((o) => o.jobsToday), 1);
    return (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    👥 Operator activity
                    <span className="text-[11px] font-normal text-slate-500">
                        sorted by today's pushes — top {top.length} of {operators.length}
                    </span>
                </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {top.map((o) => (
                    <div key={o.operator} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-slate-100 bg-slate-50/40 hover:bg-slate-50 transition">
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-900 truncate">{o.operator}</div>
                            <div className="text-[10px] text-slate-500">
                                {o.clientsServed} client{o.clientsServed === 1 ? '' : 's'} · {o.jobsLifetime} lifetime
                            </div>
                        </div>
                        <div className="text-right">
                            <div className={`text-base font-bold ${o.jobsToday > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>
                                {o.jobsToday}
                            </div>
                            <div className="text-[9px] text-slate-500 uppercase tracking-wide">today</div>
                        </div>
                        <div className="w-12 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${(o.jobsToday / max) * 100}%` }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// -------------------------------------------------------------------------
// OperatorActivityTable: per-day per-extension-code rollup of every metric
// the JR-direct extension reports. One row per (code, date). Filter buttons
// for "today / 7d / 30d". Sortable by code. Tight table — fits on screen.
// -------------------------------------------------------------------------
function OperatorActivityTable() {
    const [days, setDays] = useState(7);
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const [collapsed, setCollapsed] = useState(false);

    async function load(d = days) {
        setLoading(true); setErr(null);
        try {
            const r = await fetch(`${DASHBOARD_BASE}/admin/operator-activity?days=${d}`);
            const body = await r.json().catch(() => null);
            if (r.ok && body?.success) setRows(body.rows || []);
            else setErr(body?.message || `HTTP ${r.status}`);
        } catch (e) {
            setErr(e.message);
        } finally { setLoading(false); }
    }
    useEffect(() => { load(days); /* eslint-disable-next-line */ }, [days]);

    // Group rows by extension code so we can render code → days collapsed.
    const byCode = useMemo(() => {
        const m = new Map();
        for (const r of rows) {
            const key = r.extensionCode || '(no code)';
            if (!m.has(key)) m.set(key, { code: key, name: r.operatorName, email: r.operatorEmail, days: [] });
            m.get(key).days.push(r);
            // Update display name to most recent.
            if (r.operatorName) m.get(key).name = r.operatorName;
        }
        return [...m.values()].sort((a, b) => {
            const ap = a.days.reduce((s, x) => s + x.pushed, 0);
            const bp = b.days.reduce((s, x) => s + x.pushed, 0);
            return bp - ap;
        });
    }, [rows]);

    return (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
                <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        🧑‍💻 Operator activity (per code · per day)
                    </h3>
                    <div className="flex gap-1">
                        {[1, 7, 30].map((d) => (
                            <button
                                key={d}
                                onClick={() => setDays(d)}
                                className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                                    days === d
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                {d === 1 ? 'Today' : `${d}d`}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex gap-2 items-center">
                    {loading && <span className="text-[11px] text-slate-500">loading…</span>}
                    <button onClick={() => load(days)} className="text-[11px] text-blue-600 hover:underline">↻ Refresh</button>
                    <button onClick={() => setCollapsed((v) => !v)} className="text-[11px] text-slate-600 hover:underline">
                        {collapsed ? '▼ Expand' : '▲ Collapse'}
                    </button>
                </div>
            </div>
            {err && <div className="px-4 py-2 text-xs text-red-700 bg-red-50">{err}</div>}
            {!collapsed && (
                <div className="overflow-x-auto">
                    {byCode.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400 italic">
                            No extension activity in the last {days} day{days === 1 ? '' : 's'}. Operators must reload the JR-Direct extension to v1.15+ for stats to appear here.
                        </div>
                    ) : (
                        <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                                <tr>
                                    <th className="px-3 py-2 text-left font-semibold">Code · Operator</th>
                                    <th className="px-2 py-2 text-left font-semibold">Date</th>
                                    <th className="px-2 py-2 text-right font-semibold" title="Jobs captured by scrolling JR">📥 Cap</th>
                                    <th className="px-2 py-2 text-right font-semibold text-rose-700" title="LinkedIn-only postings auto-skipped">🚫 LI</th>
                                    <th className="px-2 py-2 text-right font-semibold" title="Sent to AI judge">⚖ Judged</th>
                                    <th className="px-2 py-2 text-right font-semibold text-amber-700" title="AI rejected: title doesn't match preferred role">Role-miss</th>
                                    <th className="px-2 py-2 text-right font-semibold text-slate-500" title="Other skips: threshold/seniority/location/auth/company">Other-skip</th>
                                    <th className="px-2 py-2 text-right font-semibold text-blue-700" title="AI picked">✓ Picks</th>
                                    <th className="px-2 py-2 text-right font-semibold text-emerald-700" title="Successfully pushed to dashboard">→ Pushed</th>
                                    <th className="px-2 py-2 text-right font-semibold text-slate-400" title="Sessions logged">Sess</th>
                                </tr>
                            </thead>
                            <tbody>
                                {byCode.map((g, gi) => (
                                    g.days.map((r, ri) => (
                                        <tr key={`${g.code}-${r.date}`} className={`border-b border-slate-100 hover:bg-slate-50/60 ${ri === 0 ? 'border-t-2 border-t-slate-200' : ''}`}>
                                            <td className="px-3 py-1.5">
                                                {ri === 0 ? (
                                                    <div>
                                                        <div className="font-mono text-[10px] text-slate-500">{g.code}</div>
                                                        <div className="font-semibold text-slate-800">{g.name || '(no name)'}</div>
                                                    </div>
                                                ) : <span className="text-slate-300">↪</span>}
                                            </td>
                                            <td className="px-2 py-1.5 font-mono text-slate-600">{r.date}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums">{r.captures || 0}</td>
                                            <td className={`px-2 py-1.5 text-right tabular-nums ${r.linkedinSkipped > 0 ? 'text-rose-700 font-semibold' : 'text-slate-400'}`}>{r.linkedinSkipped || 0}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums">{r.judged || 0}</td>
                                            <td className={`px-2 py-1.5 text-right tabular-nums ${r.roleMismatch > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400'}`}>{r.roleMismatch || 0}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{
                                                (r.threshold || 0) + (r.seniorityMismatch || 0) + (r.locationMismatch || 0) + (r.authMismatch || 0) + (r.companyBlocked || 0) + (r.otherSkip || 0)
                                            }</td>
                                            <td className={`px-2 py-1.5 text-right tabular-nums ${r.picks > 0 ? 'text-blue-700 font-semibold' : 'text-slate-400'}`}>{r.picks || 0}</td>
                                            <td className={`px-2 py-1.5 text-right tabular-nums ${r.pushed > 0 ? 'text-emerald-700 font-bold' : 'text-slate-400'}`}>{r.pushed || 0}</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{r.sessions || 0}</td>
                                        </tr>
                                    ))
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    );
}

// -------------------------------------------------------------------------
// OperatorBreakdownCard: per-client list of which operator pushed how many,
// captured how many, and skipped how many LinkedIn-only postings.
// -------------------------------------------------------------------------
function OperatorBreakdownCard({ rows, ext }) {
    if ((!rows || rows.length === 0) && !ext) return null;
    const list = rows || [];
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-1">
                👥 Operator breakdown
                <span className="text-[10px] font-normal text-slate-500">who worked this client</span>
            </h3>
            {ext && (
                <div className="text-xs text-slate-600 mb-3 flex flex-wrap gap-3">
                    <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-200 text-blue-800">
                        Captures: <strong>{ext.captures}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-800">
                        LinkedIn skipped: <strong>{ext.linkedinSkipped}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800">
                        Pushed (ext): <strong>{ext.pushed}</strong>
                    </span>
                    {ext.lastSessionAt && (
                        <span className="text-slate-500">
                            last session {new Date(ext.lastSessionAt).toLocaleString()}
                        </span>
                    )}
                </div>
            )}
            {list.length === 0 ? (
                <div className="text-xs text-slate-400 italic">No ops jobs pushed yet for this client.</div>
            ) : (
                <div className="space-y-1.5">
                    {list.map((o) => (
                        <div key={o.operator} className="flex items-center gap-3 text-sm">
                            <div className="flex-1 min-w-0 truncate font-medium text-slate-800">{o.operator}</div>
                            <div className="text-xs text-emerald-700 font-bold w-10 text-right">{o.todayCount} today</div>
                            <div className="text-xs text-slate-700 font-mono w-16 text-right">{o.count} total</div>
                            {(o.captures > 0 || o.linkedinSkipped > 0) && (
                                <div className="text-[10px] text-slate-500 flex gap-1.5">
                                    {o.captures > 0 && <span title="captures">📥{o.captures}</span>}
                                    {o.linkedinSkipped > 0 && <span title="LinkedIn skipped">🚫{o.linkedinSkipped}</span>}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// -------------------------------------------------------------------------
// Global OpenAI key card — single source of truth for every client. Replaces
// the per-client key UI we used to render in the right pane. Backend exposes
// it at /admin/global-openai-key. Extension's clientLogin / get-profile
// overlay this onto profile.openaiKey when the per-client key is empty.
// -------------------------------------------------------------------------

function GlobalOpenaiKeyCard() {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [keyState, setKeyState] = useState(null); // { keySet, maskedKey, updatedAt, updatedBy }
    const [draft, setDraft] = useState('');
    const [visible, setVisible] = useState(false);
    const [msg, setMsg] = useState(null); // { kind, text }

    async function load() {
        setLoading(true);
        try {
            const r = await fetch(`${DASHBOARD_BASE}/admin/global-openai-key`);
            const body = await r.json().catch(() => null);
            if (r.ok && body?.success) {
                setKeyState({
                    keySet: !!body.keySet,
                    maskedKey: body.maskedKey || '',
                    updatedAt: body.updatedAt || null,
                    updatedBy: body.updatedBy || '',
                });
            } else {
                setMsg({ kind: 'error', text: `Load failed: ${body?.message || `HTTP ${r.status}`}` });
            }
        } catch (e) {
            setMsg({ kind: 'error', text: `Network error: ${e.message}` });
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { load(); }, []);

    async function save() {
        const v = draft.trim();
        if (v && !/^sk-/.test(v)) {
            setMsg({ kind: 'error', text: 'OpenAI key must start with "sk-".' });
            return;
        }
        setSaving(true);
        try {
            const r = await fetch(`${DASHBOARD_BASE}/admin/global-openai-key`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ openaiKey: v }),
            });
            const body = await r.json().catch(() => null);
            if (!r.ok || !body?.success) {
                setMsg({ kind: 'error', text: `Save failed: ${body?.message || `HTTP ${r.status}`}` });
                return;
            }
            setKeyState({
                keySet: !!body.keySet,
                maskedKey: body.maskedKey || '',
                updatedAt: body.updatedAt || null,
                updatedBy: body.updatedBy || '',
            });
            setDraft('');
            setMsg({ kind: 'ok', text: v ? 'Global OpenAI key saved — all clients now use this key.' : 'Global OpenAI key cleared.' });
            setTimeout(() => setMsg(null), 4500);
        } catch (e) {
            setMsg({ kind: 'error', text: `Network error: ${e.message}` });
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[260px]">
                    <h3 className="font-bold flex items-center gap-2 text-sm">
                        🔑 Global OpenAI API key
                        {loading && <span className="text-xs text-slate-400 font-normal">loading…</span>}
                    </h3>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                        One key powers every client. Used by the JR-Direct extension's auto-judge calls and by AI Summary builds whenever the backend env var <code>OPENAI_API_KEY</code> is unset. Per-client overrides are no longer required — set it once here.
                    </p>
                    <div className="text-xs mt-2">
                        {keyState?.keySet ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                                ✓ active · {keyState.maskedKey}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40">
                                ⚠ no key set — extension auto-judge will be disabled
                            </span>
                        )}
                        {keyState?.updatedAt && (
                            <span className="ml-2 text-slate-400">
                                updated {new Date(keyState.updatedAt).toLocaleString()}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex gap-2 items-stretch flex-1 min-w-[280px]">
                    <div className="flex-1 relative">
                        <input
                            type={visible ? 'text' : 'password'}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder={keyState?.keySet ? 'Enter new key to rotate…' : 'sk-…'}
                            spellCheck={false}
                            autoComplete="off"
                            className="w-full px-3 py-2 pr-16 border border-slate-600 rounded-lg bg-slate-950 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 placeholder:text-slate-500"
                        />
                        <button
                            type="button"
                            onClick={() => setVisible((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white px-2 py-1"
                        >
                            {visible ? 'Hide' : 'Show'}
                        </button>
                    </div>
                    <button
                        onClick={save}
                        disabled={saving || !draft.trim()}
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Saving…' : (keyState?.keySet ? 'Rotate' : 'Save')}
                    </button>
                    {keyState?.keySet && (
                        <button
                            onClick={async () => {
                                if (!window.confirm('Clear the global OpenAI key? Extension auto-judge will stop working until a new key is set.')) return;
                                setDraft('');
                                setSaving(true);
                                try {
                                    const r = await fetch(`${DASHBOARD_BASE}/admin/global-openai-key`, {
                                        method: 'POST',
                                        headers: { 'content-type': 'application/json' },
                                        body: JSON.stringify({ openaiKey: '' }),
                                    });
                                    const body = await r.json().catch(() => null);
                                    if (r.ok && body?.success) {
                                        setKeyState({ keySet: false, maskedKey: '', updatedAt: body.updatedAt, updatedBy: '' });
                                        setMsg({ kind: 'ok', text: 'Global OpenAI key cleared.' });
                                        setTimeout(() => setMsg(null), 4500);
                                    }
                                } finally { setSaving(false); }
                            }}
                            disabled={saving}
                            className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                            Clear
                        </button>
                    )}
                </div>
            </div>
            {msg && (
                <div className={`mt-3 px-3 py-2 rounded text-xs ${msg.kind === 'error' ? 'bg-red-500/20 text-red-200 border border-red-500/40' : 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/40'}`}>
                    {msg.text}
                </div>
            )}
        </div>
    );
}
