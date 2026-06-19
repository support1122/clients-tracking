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
// Main client portal — used to deep-link a removed job card open (?jobId=<id>).
const PORTAL_BASE = (import.meta.env.VITE_PORTAL_BASE || 'https://portal.flashfirejobs.com').replace(/\/+$/, '');

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
    const [bulkProgress, setBulkProgress] = useState(null); // {done,total,current,errors:[],mode}
    const [bulkPopup, setBulkPopup] = useState(false);
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
    // Pre-segmented bulk-build target lists. Each row appears in at most
    // one "primary" bucket so the popup counts are mutually exclusive.
    const bulkBuckets = useMemo(() => {
        const allClients = rows;
        const missing = rows.filter((r) => !r.hasSummary);
        const stale = rows.filter((r) => r.hasSummary && r.summaryStale);
        const missingOrStale = rows.filter((r) => !r.hasSummary || r.summaryStale);
        return { allClients, missing, stale, missingOrStale };
    }, [rows]);

    // Build summaries for the selected bucket sequentially so we never
    // hammer OpenAI. Refreshes overview after each call so the UI
    // reflects progress live. mode ∈ 'all' | 'missing' | 'stale' | 'missingOrStale'.
    async function bulkBuild(mode) {
        if (bulkRunning) return;
        const map = {
            all: bulkBuckets.allClients,
            missing: bulkBuckets.missing,
            stale: bulkBuckets.stale,
            missingOrStale: bulkBuckets.missingOrStale,
        };
        const targets = map[mode] || [];
        if (targets.length === 0) return;
        setBulkRunning(true);
        bulkAbortRef.current = false;
        const errors = [];
        setBulkProgress({ done: 0, total: targets.length, current: targets[0].email, errors, mode });
        for (let i = 0; i < targets.length; i += 1) {
            if (bulkAbortRef.current) break;
            const t = targets[i];
            setBulkProgress({ done: i, total: targets.length, current: t.email, errors: [...errors], mode });
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
        setBulkProgress({ done: targets.length, total: targets.length, current: '', errors, mode });
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
                                    onClick={() => setBulkPopup(true)}
                                    disabled={bulkBuckets.allClients.length === 0}
                                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Open bulk build menu"
                                >
                                    ⚡ Build summaries…
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

                    {/* BULK BUILD CHOICE POPUP */}
                    {bulkPopup && !bulkRunning && (
                        <div
                            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
                            onClick={() => setBulkPopup(false)}
                        >
                            <div
                                className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                                    <h3 className="text-lg font-bold text-slate-900">⚡ Bulk build summaries</h3>
                                    <p className="text-xs text-slate-600 mt-1">
                                        Each client is built sequentially via gpt-4o-mini (~15s per client, ~$0.001 per build). You can stop the run at any time.
                                    </p>
                                </div>
                                <div className="p-4 space-y-2">
                                    <button
                                        onClick={() => { setBulkPopup(false); bulkBuild('missing'); }}
                                        disabled={bulkBuckets.missing.length === 0}
                                        className="w-full text-left px-4 py-3 rounded-xl border-2 border-amber-300 bg-amber-50 hover:bg-amber-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="font-bold text-amber-900">⚠ Build only non-built clients</div>
                                                <div className="text-xs text-amber-800 mt-0.5">
                                                    Clients who have never had a summary generated. Fastest option — skips everyone who already has a brief on file.
                                                </div>
                                            </div>
                                            <span className="px-3 py-1 rounded-full text-sm font-bold bg-amber-200 text-amber-900 whitespace-nowrap">
                                                {bulkBuckets.missing.length} client{bulkBuckets.missing.length === 1 ? '' : 's'}
                                            </span>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => { setBulkPopup(false); bulkBuild('missingOrStale'); }}
                                        disabled={bulkBuckets.missingOrStale.length === 0}
                                        className="w-full text-left px-4 py-3 rounded-xl border-2 border-orange-300 bg-orange-50 hover:bg-orange-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="font-bold text-orange-900">↻ Build non-built + stale</div>
                                                <div className="text-xs text-orange-800 mt-0.5">
                                                    Includes clients flagged as stale (profile / resume changed since last build). Recommended day-to-day.
                                                </div>
                                            </div>
                                            <span className="px-3 py-1 rounded-full text-sm font-bold bg-orange-200 text-orange-900 whitespace-nowrap">
                                                {bulkBuckets.missingOrStale.length} client{bulkBuckets.missingOrStale.length === 1 ? '' : 's'}
                                            </span>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => {
                                            if (!window.confirm(`Rebuild ALL ${bulkBuckets.allClients.length} client summaries from scratch? This will spend ~$${(bulkBuckets.allClients.length * 0.001).toFixed(2)} and take ~${Math.ceil(bulkBuckets.allClients.length * 15 / 60)} minute(s).`)) return;
                                            setBulkPopup(false);
                                            bulkBuild('all');
                                        }}
                                        disabled={bulkBuckets.allClients.length === 0}
                                        className="w-full text-left px-4 py-3 rounded-xl border-2 border-red-300 bg-red-50 hover:bg-red-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div>
                                                <div className="font-bold text-red-900">🔥 Build for ALL clients</div>
                                                <div className="text-xs text-red-800 mt-0.5">
                                                    Rebuilds every client's summary from scratch — even ones already built and not stale. Use after a prompt change or model upgrade. Confirmation required.
                                                </div>
                                            </div>
                                            <span className="px-3 py-1 rounded-full text-sm font-bold bg-red-200 text-red-900 whitespace-nowrap">
                                                {bulkBuckets.allClients.length} client{bulkBuckets.allClients.length === 1 ? '' : 's'}
                                            </span>
                                        </div>
                                    </button>
                                </div>
                                <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
                                    <button
                                        onClick={() => setBulkPopup(false)}
                                        className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-medium"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* BULK PROGRESS STRIP */}
                    {bulkProgress && (
                        <div className="mt-4 px-4 py-3 rounded-xl bg-slate-900 text-white">
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="font-semibold">
                                    {bulkRunning ? 'Building…' : 'Bulk build complete'}
                                    {bulkProgress.mode && (
                                        <span className="ml-2 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-700 text-slate-200">
                                            {bulkProgress.mode === 'all' ? 'ALL' :
                                             bulkProgress.mode === 'missing' ? 'NON-BUILT' :
                                             bulkProgress.mode === 'stale' ? 'STALE' :
                                             'NON-BUILT + STALE'}
                                        </span>
                                    )}
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

                    {/* DAILY AI PRICING — gpt-4o-mini per-token rates +
                        live USD→INR exchange rate. Lets ops eyeball the
                        cost-per-build at a glance. */}
                    <PricingCard />

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
    const [notes, setNotes] = useState(null);
    const [notesDraft, setNotesDraft] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    // Per-client scrape-source allowlist ('jobright' / 'indeed'). JobRight is
    // the default when a client has none saved. Extension only scrapes the
    // selected sites for this client.
    const [sourcesDraft, setSourcesDraft] = useState(['jobright']);
    const [savedSources, setSavedSources] = useState(['jobright']);
    const [savingSources, setSavingSources] = useState(false);
    // "See AI reasons to remove" modal — lists AI-removed jobs (top 5/page).
    const [showAiRemoved, setShowAiRemoved] = useState(false);
    const [aiRemoved, setAiRemoved] = useState({ jobs: [], total: 0, totalPages: 1, page: 1 });
    const [aiRemovedLoading, setAiRemovedLoading] = useState(false);
    const [aiRemovedError, setAiRemovedError] = useState(null);
    const AI_REMOVED_PAGE_SIZE = 5;

    async function loadAiRemoved(page = 1) {
        setAiRemovedLoading(true);
        setAiRemovedError(null);
        try {
            const url = `${DASHBOARD_BASE}/ai-removed-jobs?email=${encodeURIComponent(row.email)}&page=${page}&limit=${AI_REMOVED_PAGE_SIZE}`;
            const r = await fetch(url);
            const body = await r.json().catch(() => null);
            if (!r.ok || !body?.success) {
                throw new Error(body?.message || `HTTP ${r.status}`);
            }
            setAiRemoved({
                jobs: Array.isArray(body.jobs) ? body.jobs : [],
                total: body.total || 0,
                totalPages: body.totalPages || 1,
                page: body.page || page,
            });
        } catch (e) {
            setAiRemovedError(e.message || 'Failed to load');
            setAiRemoved({ jobs: [], total: 0, totalPages: 1, page: 1 });
        } finally {
            setAiRemovedLoading(false);
        }
    }
    function openAiRemoved() {
        setShowAiRemoved(true);
        loadAiRemoved(1);
    }
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
            const src = Array.isArray(p?.scrapeSources) && p.scrapeSources.length
                ? p.scrapeSources.map((s) => String(s).toLowerCase()).filter((s) => s === 'jobright' || s === 'indeed')
                : ['jobright'];
            const normalized = src.length ? src : ['jobright'];
            setSourcesDraft(normalized);
            setSavedSources(normalized);
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

    async function loadNotes() {
        try {
            const r = await fetch(`${DASHBOARD_BASE}/ai-notes?email=${encodeURIComponent(row.email)}`);
            const body = await r.json().catch(() => null);
            if (r.ok && body?.success) {
                setNotes(body.notes);
                setNotesDraft(body.notes?.text || '');
            } else {
                setNotes(null);
                setNotesDraft('');
            }
        } catch {
            setNotes(null);
            setNotesDraft('');
        }
    }

    async function saveNotes() {
        setSavingNotes(true);
        try {
            const r = await fetch(`${DASHBOARD_BASE}/save-ai-notes`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    email: row.email,
                    text: notesDraft,
                    updatedBy: 'admin-summaries-page',
                }),
            });
            const body = await r.json().catch(() => null);
            if (!r.ok || !body?.success) {
                showError(`Save notes failed: ${body?.message || `HTTP ${r.status}`}`);
                return;
            }
            showMessage(body.message || 'Notes saved.');
            setNotes(body.notes);
        } catch (e) {
            showError(`Network error: ${e.message}`);
        } finally {
            setSavingNotes(false);
        }
    }

    useEffect(() => {
        loadProfile();
        loadHistory();
        loadNotes();
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

    // Toggle a source on/off in the draft, enforcing "at least one selected".
    function toggleSource(src) {
        setSourcesDraft((prev) => {
            const has = prev.includes(src);
            if (has) {
                if (prev.length === 1) return prev; // never deselect the last one
                return prev.filter((s) => s !== src);
            }
            return [...prev, src];
        });
    }

    async function saveSources() {
        // Persist in a stable order so the saved/draft comparison is reliable.
        const ORDER = ['jobright', 'indeed'];
        const ordered = ORDER.filter((s) => sourcesDraft.includes(s));
        if (ordered.length === 0) {
            showError('Select at least one scrape source.');
            return;
        }
        setSavingSources(true);
        try {
            const r = await fetch(`${DASHBOARD_BASE}/update-scrape-sources`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: row.email, scrapeSources: ordered }),
            });
            const body = await r.json().catch(() => null);
            if (!r.ok || body?.success === false) {
                showError(`Save sources failed: ${body?.message || `HTTP ${r.status}`}`);
                return;
            }
            showMessage(`Scrape sources updated: ${ordered.join(' + ')}.`);
            setSavedSources(ordered);
            setSourcesDraft(ordered);
        } catch (e) {
            showError(`Network error: ${e.message}`);
        } finally {
            setSavingSources(false);
        }
    }

    const summary = profile?.aiSummary || '';
    const meta = profile?.aiSummaryMeta || {};
    const builtAt = meta.builtAt ? new Date(meta.builtAt).toLocaleString() : null;
    const sourcesDirty =
        [...sourcesDraft].sort().join(',') !== [...savedSources].sort().join(',');

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

            {/* Today numbers — scraped / LinkedIn skip / added (server-truth) */}
            <OperatorBreakdownCard clientEmail={row.email} />

            {/* Day-by-day performance — last 14 days */}
            <DailyHistoryCard clientEmail={row.email} />

            {/* Push history */}
            <PushHistoryCard history={history} loading={historyLoading} onReload={loadHistory} />

            {/* Scrape sources — per-client site allowlist for the JR-direct extension */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            🧭 Scrape sources
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Which job sites the extension scrapes for <strong>this client</strong>. Pick one or both — the extension only captures cards from the selected sites. Empty defaults to JobRight.
                        </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${savedSources.length > 1 ? 'bg-indigo-100 text-indigo-700' : 'bg-sky-100 text-sky-700'}`}>
                        {savedSources.map((s) => (s === 'indeed' ? 'ca.indeed' : 'JobRight')).join(' + ')}
                    </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[
                        { id: 'jobright', label: 'JobRight', host: 'jobright.ai', accent: 'sky' },
                        { id: 'indeed', label: 'ca.indeed', host: 'ca.indeed.com', accent: 'indigo' },
                    ].map((opt) => {
                        const on = sourcesDraft.includes(opt.id);
                        return (
                            <button
                                key={opt.id}
                                type="button"
                                onClick={() => toggleSource(opt.id)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition ${
                                    on
                                        ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                }`}
                            >
                                <span className={`flex items-center justify-center w-5 h-5 rounded-md border-2 flex-shrink-0 ${
                                    on ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white text-transparent'
                                }`}>
                                    ✓
                                </span>
                                <span>
                                    <span className={`block text-sm font-bold ${on ? 'text-indigo-900' : 'text-slate-700'}`}>{opt.label}</span>
                                    <span className="block text-[11px] font-mono text-slate-400">{opt.host}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
                <div className="flex justify-between items-center mt-4">
                    <span className="text-xs text-slate-500">
                        {sourcesDirty
                            ? <span className="text-amber-700 font-semibold">• unsaved changes</span>
                            : <span>Active for this client</span>}
                    </span>
                    <button
                        onClick={saveSources}
                        disabled={savingSources || !sourcesDirty}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {savingSources ? 'Saving…' : 'Save sources'}
                    </button>
                </div>
                {/* AI removal reasons — opens a modal listing jobs the second-stage
                    screening (or exclusion AI) removed, with the reason + a deep
                    link into the main portal job card. */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                    <button
                        type="button"
                        onClick={openAiRemoved}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-rose-200 bg-rose-50 text-rose-700 font-medium hover:bg-rose-100 transition"
                    >
                        🛡️ See AI reasons to remove
                    </button>
                </div>
            </div>

            {/* Target cap */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                        <h3 className="font-bold text-slate-900 flex items-center gap-2">
                            🎯 Target job count cap
                        </h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Daily cap. <code>/addjob</code> refuses ops pushes once today's count hits this number — resets at 10:00 PM IST. Empty = falls back to default 30/day.
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

            {/* Notes to AI — operator guidance injected into every BuildAiSummary call */}
            <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 rounded-2xl shadow-sm border-2 border-violet-300 overflow-hidden">
                <div className="px-5 py-3 border-b border-violet-200 bg-violet-100/60 flex items-start justify-between gap-3">
                    <div>
                        <h3 className="font-bold text-violet-900 flex items-center gap-2">
                            💬 Notes to AI
                            {notes?.text ? (
                                <span className="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full bg-violet-200 text-violet-900">
                                    {notes.charCount} chars · active
                                </span>
                            ) : (
                                <span className="text-[10px] uppercase tracking-wide font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">
                                    empty
                                </span>
                            )}
                        </h3>
                        <p className="text-xs text-violet-800 mt-1 leading-relaxed">
                            Free-text operator guidance. Sent as <strong>highest-priority context</strong> on every <strong>Build / Rebuild</strong> below.
                            Use for client-specific intent the structured profile can't capture (e.g. "wants ML research only, not infra", "exclude staffing agencies", "remote-only despite preferredLocations").
                        </p>
                        {notes?.updatedAt && (
                            <p className="text-[11px] text-violet-700 mt-1 font-mono">
                                Last saved {new Date(notes.updatedAt).toLocaleString()}{notes.updatedBy ? ` by ${notes.updatedBy}` : ''}
                            </p>
                        )}
                    </div>
                </div>
                <div className="p-4">
                    <textarea
                        value={notesDraft}
                        onChange={(e) => setNotesDraft(e.target.value.slice(0, 4000))}
                        rows={5}
                        placeholder={'Examples:\n• Only ML research / applied-research roles. Skip pure data-engineering jobs.\n• Exclude any staffing agency or recruiter-fronted listings.\n• Will relocate to NYC or SF; treat other US cities as remote-only.\n• Salary floor is firm at $180k base.'}
                        className="w-full p-3 border border-violet-300 rounded-lg bg-white text-sm font-mono text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-500"
                    />
                    <div className="flex justify-between items-center mt-3">
                        <span className="text-xs text-violet-700">
                            {notesDraft.length} / 4000 chars
                            {notesDraft !== (notes?.text || '') && (
                                <span className="ml-2 text-amber-700 font-semibold">• unsaved changes</span>
                            )}
                        </span>
                        <div className="flex gap-2">
                            {(notes?.text || '') && notesDraft !== (notes?.text || '') && (
                                <button
                                    onClick={() => setNotesDraft(notes?.text || '')}
                                    className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-300"
                                >
                                    Revert
                                </button>
                            )}
                            <button
                                onClick={saveNotes}
                                disabled={savingNotes || notesDraft === (notes?.text || '')}
                                className="px-4 py-1.5 bg-violet-600 text-white rounded-lg text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                            >
                                {savingNotes ? 'Saving…' : '💾 Save notes'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* AI summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
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
                        {summary && (
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                {meta.model && (
                                    <span
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-slate-900 text-white"
                                        title="Model used to generate this summary"
                                    >
                                        🤖 {meta.model}
                                    </span>
                                )}
                                {Number.isFinite(Number(meta.temperature)) && (
                                    <span
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-300"
                                        title="Sampling temperature (lower = more deterministic)"
                                    >
                                        temp {Number(meta.temperature).toFixed(2)}
                                    </span>
                                )}
                                <span className="text-[10px] text-slate-500 uppercase tracking-wide ml-1">Built from:</span>
                                {meta.builtInputs?.notes ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-violet-100 text-violet-800 border border-violet-300" title="Operator notes were included as highest-priority context">
                                        💬 Notes
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-50 text-slate-400 border border-slate-200" title="No operator notes on file at build time">
                                        💬 Notes <span className="opacity-60">·skip</span>
                                    </span>
                                )}
                                {meta.builtInputs?.resume ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300" title="Parsed resume was fetched and included">
                                        📄 Resume
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-300" title="No resume linked — build used profile only">
                                        📄 Resume <span className="opacity-60">·none</span>
                                    </span>
                                )}
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-sky-100 text-sky-800 border border-sky-300" title="Onboarding profile is always included">
                                    👤 Profile
                                </span>
                            </div>
                        )}
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

            {/* AI removal reasons modal — top 5 per page, deep-links to portal */}
            {showAiRemoved && (
                <div
                    className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
                    onClick={() => setShowAiRemoved(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 py-4 border-b border-slate-200 bg-rose-50 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-rose-800">🛡️ AI reasons to remove</h3>
                                <p className="text-xs text-slate-600 mt-0.5">
                                    {row.email} · {aiRemoved.total} job{aiRemoved.total === 1 ? '' : 's'} removed by AI
                                </p>
                            </div>
                            <button
                                onClick={() => setShowAiRemoved(false)}
                                className="text-slate-400 hover:text-slate-700 text-xl leading-none"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-5 space-y-3 overflow-y-auto">
                            {aiRemovedLoading ? (
                                <div className="text-center text-slate-500 py-8 text-sm">Loading…</div>
                            ) : aiRemovedError ? (
                                <div className="text-center text-rose-600 py-8 text-sm">{aiRemovedError}</div>
                            ) : aiRemoved.jobs.length === 0 ? (
                                <div className="text-center text-slate-500 py-8 text-sm">No AI-removed jobs for this client.</div>
                            ) : (
                                aiRemoved.jobs.map((j) => (
                                    <div key={j._id} className="border border-slate-200 rounded-xl p-4">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="font-semibold text-slate-900 truncate">{j.jobTitle || '(untitled)'}</div>
                                                <div className="text-xs text-slate-500 truncate">{j.companyName}</div>
                                            </div>
                                            <a
                                                href={`${PORTAL_BASE}/?tab=jobtracker&jobId=${encodeURIComponent(j.jobID)}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                                            >
                                                Open card ↗
                                            </a>
                                        </div>
                                        <p className="mt-2 text-sm text-rose-700 bg-rose-50 border-l-4 border-rose-300 rounded-r px-3 py-2">
                                            {j.removalReason || j.secondJudgeReason || 'Removed by AI'}
                                        </p>
                                        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400">
                                            {j.secondJudgeScore != null && <span>score {j.secondJudgeScore}</span>}
                                            {j.removalDate && <span>{j.removalDate}</span>}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {aiRemoved.totalPages > 1 && (
                            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
                                <button
                                    onClick={() => loadAiRemoved(aiRemoved.page - 1)}
                                    disabled={aiRemovedLoading || aiRemoved.page <= 1}
                                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white disabled:opacity-40"
                                >
                                    ← Prev
                                </button>
                                <span className="text-xs text-slate-500">Page {aiRemoved.page} of {aiRemoved.totalPages}</span>
                                <button
                                    onClick={() => loadAiRemoved(aiRemoved.page + 1)}
                                    disabled={aiRemovedLoading || aiRemoved.page >= aiRemoved.totalPages}
                                    className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 bg-white disabled:opacity-40"
                                >
                                    Next →
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
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
// PricingCard: today's gpt-4o-mini per-token cost + USD→INR rate. Backend
// caches FX 1h. Sample-build cost (≈ 2k input + 0.5k output) shown in both
// USD + INR so ops can eyeball spend without doing math.
// -------------------------------------------------------------------------
function PricingCard() {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = async () => {
        setLoading(true); setErr(null);
        try {
            const r = await fetch(`${DASHBOARD_BASE}/admin/pricing-info?_=${Date.now()}`, { cache: 'no-store' });
            const body = await r.json().catch(() => null);
            if (r.ok && body?.success) setData(body);
            else setErr(body?.message || `HTTP ${r.status}`);
        } catch (e) { setErr(e.message); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

    const m = data?.openai;
    const fx = data?.fx;
    const sample = data?.sample;
    const fxFresh = fx?.fetchedAt ? new Date(fx.fetchedAt) : null;

    return (
        <div className="mt-4 rounded-xl border border-slate-200 bg-gradient-to-r from-indigo-50 to-emerald-50 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-[260px]">
                    <h3 className="font-bold flex items-center gap-2 text-sm text-slate-900">
                        💰 Daily AI cost
                        {loading && <span className="text-xs text-slate-500 font-normal">refreshing…</span>}
                    </h3>
                    <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        Live OpenAI <code>{m?.model || 'gpt-4o-mini'}</code> per-token rates × USD→INR FX (cached 1h). Use for quick spend estimates.
                    </p>
                    {err && <div className="text-xs text-red-700 mt-1">{err}</div>}
                </div>
                <button
                    onClick={load}
                    disabled={loading}
                    className="px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                    ↻ Refresh
                </button>
            </div>

            {data && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3">
                    <PriceTile
                        label="Input / 1M"
                        valueUSD={m.inputPerMTok}
                        valueINR={m.inputPerMTok * (fx?.rate || 0)}
                        accent="indigo"
                    />
                    <PriceTile
                        label="Output / 1M"
                        valueUSD={m.outputPerMTok}
                        valueINR={m.outputPerMTok * (fx?.rate || 0)}
                        accent="indigo"
                    />
                    <div className="rounded-lg border border-emerald-200 bg-white px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-emerald-700 font-semibold">USD → INR</div>
                        <div className="text-lg font-bold text-emerald-900 tabular-nums">
                            ₹{Number(fx?.rate || 0).toFixed(2)}
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5">
                            {fx?.stale ? <span className="text-amber-700">stale · using last cached</span>
                                : fxFresh ? `${fxFresh.toLocaleString()}` : '—'}
                        </div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 col-span-2">
                        <div className="text-[10px] uppercase tracking-wide text-slate-700 font-semibold">
                            Sample build · {sample?.tokens?.input}+{sample?.tokens?.output} tokens
                        </div>
                        <div className="text-lg font-bold text-slate-900 tabular-nums">
                            ${Number(sample?.costUSD || 0).toFixed(5)}
                            <span className="text-slate-400 font-normal mx-1.5">≈</span>
                            ₹{Number(sample?.costINR || 0).toFixed(3)}
                        </div>
                        <div className="text-[9px] text-slate-500 mt-0.5">
                            per AI-summary build · rates as of {m?.asOf}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function PriceTile({ label, valueUSD, valueINR, accent = 'slate' }) {
    const map = {
        indigo: 'border-indigo-200 text-indigo-900',
        slate:  'border-slate-200 text-slate-900',
    };
    return (
        <div className={`rounded-lg border bg-white px-3 py-2 ${map[accent]}`}>
            <div className="text-[10px] uppercase tracking-wide opacity-70 font-semibold">{label}</div>
            <div className="text-lg font-bold tabular-nums leading-tight">${Number(valueUSD || 0).toFixed(3)}</div>
            <div className="text-[10px] opacity-60 tabular-nums">≈ ₹{Number(valueINR || 0).toFixed(2)}</div>
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
                                    <th className="px-2 py-2 text-right font-semibold text-violet-700" title="Average jobs pushed per client served (pushed ÷ distinct clients)">⌀ Avg/client</th>
                                    <th className="px-2 py-2 text-right font-semibold text-slate-400" title="Distinct clients served">Clients</th>
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
                                            <td className={`px-2 py-1.5 text-right tabular-nums ${(r.clientCount || 0) > 0 && (r.pushed || 0) > 0 ? 'text-violet-700 font-semibold' : 'text-slate-400'}`}>{
                                                (r.clientCount || 0) > 0 ? ((r.pushed || 0) / r.clientCount).toFixed(1) : '—'
                                            }</td>
                                            <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{r.clientCount || 0}</td>
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
// captured how many, rejected how many, and saved how many. Each operator
// row carries an English breakdown sentence plus structured chips.
// -------------------------------------------------------------------------
function fmtRelative(date) {
    if (!date) return '';
    const d = new Date(date);
    const diffMs = Date.now() - d.getTime();
    const min = Math.round(diffMs / 60000);
    if (min < 1) return 'just now';
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.round(hr / 24);
    if (day < 30) return `${day}d ago`;
    return d.toLocaleDateString();
}

// Today-only summary card. Shows the three numbers operators actually need
// at a glance: how many we scraped via extension today, how many LinkedIn-
// only postings were skipped, how many landed in the client's dashboard.
// Pulls from /extension/today-stats so the source matches the extension's
// own TODAY tile.
function OperatorBreakdownCard({ clientEmail }) {
    const [data, setData] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        if (!clientEmail) return;
        let cancelled = false;
        const load = async () => {
            try {
                const r = await fetch(`${DASHBOARD_BASE}/extension/today-stats?clientEmail=${encodeURIComponent(clientEmail)}&_=${Date.now()}`, { cache: 'no-store' });
                const body = await r.json().catch(() => null);
                if (cancelled) return;
                if (r.ok && body?.success) { setData(body); setErr(null); }
                else setErr(body?.message || `HTTP ${r.status}`);
            } catch (e) { if (!cancelled) setErr(e.message); }
        };
        load();
        // Poll every 8s while card mounted so SCRAPED ticks live as
        // operators scroll (extension heartbeats every ~500ms during scroll).
        const t = setInterval(load, 8000);
        return () => { cancelled = true; clearInterval(t); };
    }, [clientEmail]);

    const t = data?.today || {};
    const scraped = t.captures || 0;
    const linkedin = t.linkedinSkipped || 0;
    const pushed = data?.pushed ?? 0;
    const operators = data?.operators || [];

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    📊 Today
                    <span className="text-[10px] font-normal text-slate-500">resets at 10:00 PM IST</span>
                </h3>
                {err && <span className="text-[10px] text-red-600">{err}</span>}
            </div>

            {/* Client-wide totals */}
            <div className="grid grid-cols-3 gap-3 mb-4">
                <TodayTile label="Scraped" value={scraped} color="blue" />
                <TodayTile label="LinkedIn skip" value={linkedin} color="rose" />
                <TodayTile label="Added" value={pushed} color="emerald" />
            </div>

            {/* Per-operator breakdown — one row per code (or per name if pre-v1.15) */}
            {operators.length > 0 ? (
                <div className="space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">Per operator</div>
                    {operators.map((o, idx) => (
                        <div key={`${o.extensionCode || 'noc'}-${o.operatorName}-${idx}`} className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="min-w-0 flex-1">
                                    <div className="font-semibold text-slate-900 text-sm truncate">{o.operatorName}</div>
                                    <div className="text-[10px] font-mono text-slate-500">
                                        {o.extensionCode ? `code · ${o.extensionCode}` : 'no code'}
                                        {o.sessions > 0 && <span> · {o.sessions} session{o.sessions === 1 ? '' : 's'}</span>}
                                    </div>
                                </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <TodayTile label="Scraped" value={o.captures} color="blue" tight />
                                <TodayTile label="LinkedIn skip" value={o.linkedinSkipped} color="rose" tight />
                                <TodayTile label="Added" value={o.pushed} color="emerald" tight />
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-xs text-slate-400 italic">No operator activity recorded today.</div>
            )}
        </div>
    );
}

// -------------------------------------------------------------------------
// DailyHistoryCard: per-day rollup for a single client over the last N days.
// Lets the operator "go back to" a particular day and see the full breakdown
// for that client. Pulls from /extension/daily-history. Compact strip view
// + click-to-expand details for the selected day.
// -------------------------------------------------------------------------
function DailyHistoryCard({ clientEmail }) {
    const [days, setDays] = useState([]);
    const [windowDays, setWindowDays] = useState(14);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState(null);
    const [selectedDate, setSelectedDate] = useState(null);

    useEffect(() => {
        if (!clientEmail) return;
        let cancelled = false;
        const load = async () => {
            setLoading(true); setErr(null);
            try {
                const r = await fetch(
                    `${DASHBOARD_BASE}/extension/daily-history?clientEmail=${encodeURIComponent(clientEmail)}&days=${windowDays}&_=${Date.now()}`,
                    { cache: 'no-store' },
                );
                const body = await r.json().catch(() => null);
                if (cancelled) return;
                if (r.ok && body?.success) {
                    setDays(body.days || []);
                    setSelectedDate((d) => d || body.days?.[0]?.date || null);
                } else setErr(body?.message || `HTTP ${r.status}`);
            } catch (e) { if (!cancelled) setErr(e.message); }
            finally { if (!cancelled) setLoading(false); }
        };
        load();
        return () => { cancelled = true; };
    }, [clientEmail, windowDays]);

    // Reset selected day when client switches.
    useEffect(() => { setSelectedDate(null); }, [clientEmail]);

    const selected = useMemo(
        () => days.find((d) => d.date === selectedDate) || days[0] || null,
        [days, selectedDate],
    );
    const max = Math.max(1, ...days.map((d) => d.captures || 0));

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                    📅 Day-by-day performance
                    <span className="text-[10px] font-normal text-slate-500">click any day for details</span>
                </h3>
                <div className="flex gap-1">
                    {[7, 14, 30].map((n) => (
                        <button
                            key={n}
                            onClick={() => setWindowDays(n)}
                            className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                                windowDays === n
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                            }`}
                        >{n}d</button>
                    ))}
                    {loading && <span className="text-[10px] text-slate-500 self-center">loading…</span>}
                </div>
            </div>

            {err && <div className="text-[11px] text-red-600 mb-2">{err}</div>}

            {/* Day strip — most recent on the right, like a calendar tail */}
            <div className="flex gap-1 mb-4 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
                {[...days].reverse().map((d) => {
                    const captureH = Math.max(4, Math.round(((d.captures || 0) / max) * 56));
                    const active = d.date === selected?.date;
                    const empty = (d.captures || 0) === 0 && (d.pushed || 0) === 0;
                    return (
                        <button
                            key={d.date}
                            onClick={() => setSelectedDate(d.date)}
                            className={`flex flex-col items-center gap-1 px-1.5 py-1.5 rounded text-[10px] font-mono border transition flex-shrink-0 ${
                                active
                                    ? 'bg-slate-900 text-white border-slate-900'
                                    : empty
                                        ? 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50 hover:border-blue-300'
                            }`}
                            title={`${d.date} · scraped ${d.captures} · LinkedIn ${d.linkedinSkipped} · pushed ${d.pushed}`}
                        >
                            <span>{d.date.slice(5)}</span>
                            <div
                                className={`w-2 rounded-t ${active ? 'bg-emerald-300' : empty ? 'bg-slate-300' : 'bg-blue-400'}`}
                                style={{ height: `${captureH}px` }}
                            />
                            <span className={`text-[9px] ${active ? 'text-emerald-200' : empty ? 'text-slate-300' : 'text-slate-500'}`}>
                                {d.captures || 0}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Selected-day breakdown */}
            {selected ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-semibold text-slate-800">
                            📊 {selected.date}
                        </div>
                        <div className="text-[10px] text-slate-500">
                            {selected.sessions} session{selected.sessions === 1 ? '' : 's'}
                        </div>
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                        <DayMetric label="Scraped" value={selected.captures} color="blue" />
                        <DayMetric label="LinkedIn" value={selected.linkedinSkipped} color="rose" />
                        <DayMetric label="Judged" value={selected.judged} color="indigo" />
                        <DayMetric label="Picks" value={selected.picks} color="indigo" />
                        <DayMetric label="Role-miss" value={selected.roleMismatch} color="amber" />
                        <DayMetric label="Added" value={selected.pushed} color="emerald" />
                    </div>
                </div>
            ) : (
                <div className="text-xs text-slate-400 italic">No history yet for this client.</div>
            )}
        </div>
    );
}

function DayMetric({ label, value, color }) {
    const map = {
        blue:    'bg-blue-50 border-blue-200 text-blue-900',
        rose:    'bg-rose-50 border-rose-200 text-rose-900',
        indigo:  'bg-indigo-50 border-indigo-200 text-indigo-900',
        amber:   'bg-amber-50 border-amber-200 text-amber-900',
        emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    };
    return (
        <div className={`rounded-md border px-2 py-1.5 text-center ${map[color]}`}>
            <div className="text-[9px] uppercase tracking-wide opacity-70 font-semibold">{label}</div>
            <div className="text-base font-bold tabular-nums leading-tight">{Number(value || 0).toLocaleString()}</div>
        </div>
    );
}

function TodayTile({ label, value, color, tight = false }) {
    const map = {
        blue:    'border-blue-200 bg-blue-50 text-blue-900 [&_.lbl]:text-blue-700',
        rose:    'border-rose-200 bg-rose-50 text-rose-900 [&_.lbl]:text-rose-700',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900 [&_.lbl]:text-emerald-700',
    };
    const padding = tight ? 'p-2' : 'p-3';
    const numSize = tight ? 'text-lg' : 'text-2xl';
    return (
        <div className={`rounded-lg border text-center ${padding} ${map[color]}`}>
            <div className="lbl text-[10px] uppercase tracking-wide font-semibold">{label}</div>
            <div className={`${numSize} font-bold tabular-nums mt-0.5`}>{Number(value || 0).toLocaleString()}</div>
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
