// AI Candidate Summary section — admin-only.
//
// Talks directly to the FlashFire dashboard backend (NOT this app's own
// applications_monitor_backend) because that's where ProfileModel +
// `aiSummary` field live. The dashboard backend exposes:
//   GET  /get-profile?email=
//   POST /update-ai-summary       { email, aiSummary, model?, source?, wordCount? }
//   POST /build-ai-summary        { email }   → server-side fetches resume + calls OpenAI
//
// VITE_DASHBOARD_BASE is the dashboard backend URL (e.g. http://localhost:8086
// or https://dashboard-api.flashfirejobs.com). Falls back to localhost:8086 if unset.

import React, { useEffect, useMemo, useState } from 'react';

const DASHBOARD_BASE = (import.meta.env.VITE_DASHBOARD_BASE || 'http://localhost:8086').replace(/\/+$/, '');

// parseSummarySections: split markdown into { header, lines } where each
// line is { kind:'bullet'|'prose'|'blank', text }. Used together with the
// backend's provenance map so each bullet can be colour-tinted by source.
function parseSummarySections(text) {
    if (typeof text !== 'string' || !text.trim()) return [];
    const raws = text.split(/\r?\n/);
    const out = [];
    let current = null;
    for (const raw of raws) {
        const m = raw.match(/^\s*#\s+(.+)$/);
        if (m) {
            if (current) out.push(current);
            current = { header: m[1].trim(), lines: [] };
            continue;
        }
        if (!current) {
            if (!raw.trim()) continue;
            current = { header: '__preamble', lines: [] };
        }
        const bulletMatch = raw.match(/^\s*[-*]\s+(.+)$/);
        if (bulletMatch) current.lines.push({ kind: 'bullet', text: bulletMatch[1].trim() });
        else if (raw.trim()) current.lines.push({ kind: 'prose', text: raw });
        else current.lines.push({ kind: 'blank', text: '' });
    }
    if (current) out.push(current);
    return out.filter((s) => s.header !== '__preamble' || s.lines.length);
}

// provenanceStyle: per-source colour tokens for the per-bullet legend chip.
const PROV_STYLE = {
    R:  { label: 'Resume',   chip: 'bg-emerald-100 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500', side: 'border-l-emerald-400' },
    P:  { label: 'Profile',  chip: 'bg-amber-100 text-amber-800 border-amber-300',       dot: 'bg-amber-500',   side: 'border-l-amber-400' },
    RP: { label: 'Both',     chip: 'bg-sky-100 text-sky-800 border-sky-300',             dot: 'bg-sky-500',     side: 'border-l-sky-400' },
    I:  { label: 'Inferred', chip: 'bg-slate-100 text-slate-700 border-slate-300',       dot: 'bg-slate-400',   side: 'border-l-slate-300' },
    U:  { label: 'Operator', chip: 'bg-indigo-100 text-indigo-800 border-indigo-300',    dot: 'bg-indigo-500',  side: 'border-l-indigo-400' },
};

// summarySourceLabel: render the human-friendly origin tag from
// aiSummaryMeta.source. The backend writes strings like
// "profile+resume+gemini [auto:resume-upload]" or "profile-only+openai [manual]".
function summarySourceLabel(rawSource) {
    if (!rawSource) return { icon: '❓', label: 'unknown source', color: 'slate' };
    const s = String(rawSource);
    // Removal-triggered rebuilds first: the [auto:job-removal] tag rides on
    // top of the base source ("profile+resume+openai [auto:job-removal]"),
    // and the trigger is the interesting part for operators.
    if (s.includes('[auto:job-removal]')) return { icon: '🗑', label: 'Auto-rebuilt from client removal feedback', color: 'rose' };
    if (s.includes('profile+resume')) return { icon: '📄', label: 'Built from Resume + Profile', color: 'emerald' };
    if (s.includes('profile-only')) return { icon: '👤', label: 'Built from Profile only (no resume)', color: 'amber' };
    if (s.startsWith('admin-clients-tracking') || s.includes('manual-edit')) return { icon: '✎', label: 'Manually edited', color: 'blue' };
    return { icon: '🔧', label: s.slice(0, 40), color: 'slate' };
}

export default function ClientAiSummary({ clientEmail }) {
    const [loading, setLoading] = useState(false);
    const [building, setBuilding] = useState(false);
    const [saving, setSaving] = useState(false);
    const [profile, setProfile] = useState(null);
    const [draft, setDraft] = useState('');
    const [editing, setEditing] = useState(false);
    const [message, setMessage] = useState(null);
    const [error, setError] = useState(null);
    const [targetDraft, setTargetDraft] = useState('');
    const [savingTarget, setSavingTarget] = useState(false);
    const [history, setHistory] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [overlay, setOverlay] = useState(null);
    const [overlayBusy, setOverlayBusy] = useState(false);

    useEffect(() => {
        if (clientEmail) {
            loadProfile();
            loadHistory();
            loadOverlay();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientEmail]);

    async function loadOverlay() {
        try {
            const res = await fetch(`${DASHBOARD_BASE}/summary-overlay?email=${encodeURIComponent(clientEmail.toLowerCase())}`);
            const body = await res.json().catch(() => null);
            if (res.ok && body?.success) setOverlay(body.overlay);
            else setOverlay(null);
        } catch {
            setOverlay(null);
        }
    }

    async function saveOverlay(savedText, lockedSections = undefined) {
        setOverlayBusy(true);
        try {
            const locksToSend = Array.isArray(lockedSections)
                ? lockedSections
                : (overlay?.lockedSections || []);
            const res = await fetch(`${DASHBOARD_BASE}/save-summary-overlay`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    email: clientEmail.toLowerCase(),
                    savedText,
                    lockedSections: locksToSend,
                }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok || !body?.success) {
                showError(`Save format failed: ${body?.message || `HTTP ${res.status}`}`);
                return;
            }
            showMessage(body.message || 'Format saved.', 'ok');
            setOverlay(body.overlay);
        } catch (e) {
            showError(`Network error: ${e.message}`);
        } finally {
            setOverlayBusy(false);
        }
    }

    async function clearOverlay() {
        if (!window.confirm('Disable the saved format? Future rebuilds will use pure AI output. (Snapshot is retained — you can re-enable by saving the format again.)')) return;
        setOverlayBusy(true);
        try {
            const res = await fetch(`${DASHBOARD_BASE}/clear-summary-overlay`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: clientEmail.toLowerCase() }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok || !body?.success) {
                showError(`Clear overlay failed: ${body?.message || `HTTP ${res.status}`}`);
                return;
            }
            showMessage(body.message || 'Overlay disabled.', 'ok');
            await loadOverlay();
        } catch (e) {
            showError(`Network error: ${e.message}`);
        } finally {
            setOverlayBusy(false);
        }
    }

    async function loadHistory(days = 30) {
        setHistoryLoading(true);
        try {
            const res = await fetch(
                `${DASHBOARD_BASE}/push-history?email=${encodeURIComponent(clientEmail.toLowerCase())}&days=${days}`,
            );
            const body = await res.json().catch(() => null);
            if (res.ok && body?.success) {
                setHistory(body);
            } else {
                setHistory(null);
            }
        } catch {
            setHistory(null);
        } finally {
            setHistoryLoading(false);
        }
    }

    function showMessage(text, kind = 'info') {
        setMessage({ text, kind });
        setError(null);
        setTimeout(() => setMessage(null), 4000);
    }
    function showError(text) {
        setError(text);
        setMessage(null);
    }

    async function loadProfile() {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `${DASHBOARD_BASE}/get-profile?email=${encodeURIComponent(clientEmail.toLowerCase())}`,
            );
            const body = await res.json().catch(() => null);
            if (!res.ok) {
                showError(`Could not load profile: ${body?.message || `HTTP ${res.status}`}`);
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

    async function buildSummary() {
        setBuilding(true);
        setError(null);
        try {
            const res = await fetch(`${DASHBOARD_BASE}/build-ai-summary`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ email: clientEmail.toLowerCase() }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok || !body?.success) {
                const step = body?.step ? ` [step: ${body.step}]` : '';
                showError(`Build failed: ${body?.error || `HTTP ${res.status}`}${step} — ${body?.message || ''}`);
                return;
            }
            showMessage(`Summary built (${body.wordCount} words, ${body.source}).`, 'ok');
            // Reload profile to get fresh aiSummary + meta.
            await loadProfile();
            setEditing(false);
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
        setError(null);
        try {
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            const res = await fetch(`${DASHBOARD_BASE}/update-ai-summary`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    email: clientEmail.toLowerCase(),
                    aiSummary: text,
                    model: 'manual-edit',
                    source: 'admin-clients-tracking',
                    wordCount,
                }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok || body?.success === false) {
                showError(`Save failed: ${body?.message || `HTTP ${res.status}`}`);
                return;
            }
            showMessage(`Saved (${wordCount} words).`, 'ok');
            setEditing(false);
            await loadProfile();
            // Prompt operator to lock in the edit as a sticky overlay so the
            // added lines survive future BuildAiSummary rebuilds.
            const promptMsg = overlay?.enabled
                ? 'Update the saved format with these changes? Any new lines you added will persist on future rebuilds.'
                : 'Save this format? Any lines you added will be preserved on every future rebuild (profile / resume / cron triggers).';
            if (window.confirm(promptMsg)) {
                await saveOverlay(text);
                await loadOverlay();
            }
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
        setError(null);
        try {
            const res = await fetch(`${DASHBOARD_BASE}/update-target-jobs`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    email: clientEmail.toLowerCase(),
                    targetJobCount: n,
                }),
            });
            const body = await res.json().catch(() => null);
            if (!res.ok || body?.success === false) {
                showError(`Save target failed: ${body?.message || `HTTP ${res.status}`}`);
                return;
            }
            showMessage(n === null ? 'Target removed (no cap).' : `Target set to ${n} jobs.`, 'ok');
            await loadProfile();
            await loadHistory();
        } catch (e) {
            showError(`Network error: ${e.message}`);
        } finally {
            setSavingTarget(false);
        }
    }

    function cancelEdit() {
        setDraft(profile?.aiSummary || '');
        setEditing(false);
        setError(null);
    }

    const summary = profile?.aiSummary || '';
    const meta = profile?.aiSummaryMeta || {};
    const builtAt = meta.builtAt ? new Date(meta.builtAt).toLocaleString() : null;
    // Newest client removal reason — /get-profile returns the full
    // removalFeedback history (newest first, written by the dashboard's
    // UpdateChanges on every reasoned removal).
    const latestRemoval = Array.isArray(profile?.removalFeedback)
        ? profile.removalFeedback.find((i) => i?.reason && String(i.reason).trim()) || null
        : null;
    const sourceTag = useMemo(() => summarySourceLabel(meta.source), [meta.source]);
    const sections = useMemo(() => parseSummarySections(summary), [summary]);
    const lockedSet = useMemo(
        () => new Set(overlay?.lockedSections || []),
        [overlay?.lockedSections],
    );

    function toggleLock(header) {
        if (!summary) return;
        const next = new Set(lockedSet);
        if (next.has(header)) next.delete(header);
        else next.add(header);
        const arr = Array.from(next);
        saveOverlay(summary, arr);
    }

    const sourceColorMap = {
        emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        amber: 'bg-amber-100 text-amber-800 border-amber-300',
        blue: 'bg-blue-100 text-blue-800 border-blue-300',
        slate: 'bg-slate-100 text-slate-700 border-slate-300',
        rose: 'bg-rose-100 text-rose-800 border-rose-300',
    };
    const sourcePill = sourceColorMap[sourceTag.color] || sourceColorMap.slate;

    return (
        <div className="space-y-6">
            <div className="bg-gradient-to-r from-purple-50 to-pink-50 border-l-4 border-purple-500 p-4 rounded-r-xl">
                <h3 className="text-lg font-bold text-purple-900 mb-1">AI Candidate Summary</h3>
                <p className="text-sm text-purple-800">
                    Structured candidate brief used by the JR-Direct extension's grader.
                    Built from profile + resume via gpt-4o-mini. Edit here, sync everywhere.
                </p>
            </div>

            <div className="flex items-center gap-3 flex-wrap">
                {summary ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-300">
                        ✓ saved · {meta.wordCount || '?'} words {builtAt && `· ${builtAt}`}
                    </span>
                ) : (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-300">
                        ⚠ not built yet
                    </span>
                )}
                {meta.builtInputs?.removalFeedback && (
                    <span
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-700 border border-rose-300"
                        title="This summary was built with the client's own job-removal reasons as high-priority context — future picks steer away from those patterns"
                    >
                        🗑 tuned by removal feedback
                    </span>
                )}
                {meta.source && (
                    <span className="text-xs text-slate-500">source: {meta.source}</span>
                )}
                {meta.model && (
                    <span className="text-xs text-slate-500">model: {meta.model}</span>
                )}
                {overlay?.enabled && (
                    <span
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-300"
                        title={overlay.savedAt ? `Format saved ${new Date(overlay.savedAt).toLocaleString()}` : 'Format overlay active'}
                    >
                        🔒 format locked
                        {overlay.stats?.total ? (
                            <span className="text-[10px] bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded">
                                +{overlay.stats.total} sticky line{overlay.stats.total === 1 ? '' : 's'}
                            </span>
                        ) : null}
                        <button
                            onClick={clearOverlay}
                            disabled={overlayBusy}
                            className="text-indigo-700 hover:text-red-600 underline text-[10px] ml-1 disabled:opacity-50"
                        >
                            clear
                        </button>
                    </span>
                )}
                {!overlay?.enabled && overlay?.savedAt && (
                    <span
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-300"
                        title={`Snapshot saved ${new Date(overlay.savedAt).toLocaleString()} — currently disabled`}
                    >
                        🗒 format snapshot (disabled)
                        <button
                            onClick={() => saveOverlay(overlay.savedText || summary)}
                            disabled={overlayBusy}
                            className="text-slate-700 hover:text-emerald-700 underline text-[10px] ml-1 disabled:opacity-50"
                        >
                            re-enable
                        </button>
                    </span>
                )}
            </div>

            {latestRemoval && (
                <div className="bg-rose-50 border-l-4 border-rose-400 p-4 rounded-r-xl">
                    <div className="flex items-baseline justify-between gap-3">
                        <h4 className="text-sm font-bold text-rose-900">🗑 Latest removal reason from client</h4>
                        {latestRemoval.removedAt && (
                            <span className="text-xs text-rose-600 flex-shrink-0">
                                {new Date(latestRemoval.removedAt).toLocaleString()}
                            </span>
                        )}
                    </div>
                    <p className="text-sm text-rose-800 mt-1">"{latestRemoval.reason}"</p>
                    <p className="text-xs text-rose-600 mt-0.5">
                        {[latestRemoval.jobTitle, latestRemoval.companyName].filter(Boolean).join(' @ ') || 'job details unavailable'}
                        {latestRemoval.removedBy ? ` · removed by ${latestRemoval.removedBy}` : ''}
                    </p>
                </div>
            )}

            {message && (
                <div className={`px-4 py-3 rounded-lg ${
                    message.kind === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                    : 'bg-blue-50 text-blue-800 border border-blue-200'
                }`}>
                    {message.text}
                </div>
            )}
            {error && (
                <div className="px-4 py-3 rounded-lg bg-red-50 text-red-800 border border-red-200 text-sm font-mono">
                    {error}
                </div>
            )}

            <PushHistoryPanel history={history} loading={historyLoading} onReload={() => loadHistory(30)} />

            <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                    <h4 className="text-sm font-bold text-amber-900">Target job count cap</h4>
                    <span className="text-xs text-amber-700">
                        Currently set: <strong>{profile?.targetJobCount != null ? profile.targetJobCount : '∞ (no cap)'}</strong>
                    </span>
                </div>
                <p className="text-xs text-amber-800 mb-3 leading-relaxed">
                    The dashboard's <code>/addjob</code> endpoint refuses operator pushes once this many jobs already exist for the client. Leave empty for no cap. Affects scraper + extension pushes only — clients self-tracking are not capped.
                </p>
                <div className="flex gap-2 items-center">
                    <input
                        type="number"
                        min="0"
                        max="10000"
                        step="5"
                        value={targetDraft}
                        onChange={(e) => setTargetDraft(e.target.value)}
                        placeholder="(no cap)"
                        className="px-3 py-2 border border-amber-300 rounded-lg bg-white text-sm w-32 focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <button
                        onClick={saveTarget}
                        disabled={savingTarget}
                        className="px-4 py-2 rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-50 transition-colors"
                    >
                        {savingTarget ? 'Saving…' : 'Save target'}
                    </button>
                </div>
            </div>

            {loading && !profile && <div className="text-slate-500">Loading…</div>}

            {!editing ? (
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-slate-200 bg-slate-50">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${sourcePill}`}>
                                <span className="text-sm leading-none">{sourceTag.icon}</span>
                                {sourceTag.label}
                            </span>
                            {meta.model && (
                                <span className="text-[11px] text-slate-500 font-mono">
                                    {meta.model}
                                </span>
                            )}
                            {lockedSet.size > 0 && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 text-indigo-800 border border-indigo-300">
                                    🔒 {lockedSet.size} section{lockedSet.size === 1 ? '' : 's'} locked
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {summary && (
                                <button
                                    onClick={() => { setDraft(summary); setEditing(true); }}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition-colors shadow-sm"
                                    title="Edit & refine"
                                >
                                    ✎ Edit & refine
                                </button>
                            )}
                            <button
                                onClick={buildSummary}
                                disabled={building}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-sm"
                                title="Rebuild from profile + resume"
                            >
                                {building ? 'Building…' : '↻ Rebuild'}
                            </button>
                            <button
                                onClick={loadProfile}
                                disabled={loading}
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-300 transition-colors"
                                title="Reload"
                            >
                                ↻
                            </button>
                        </div>
                    </div>
                    {!summary ? (
                        <div className="px-5 py-8 text-slate-500 italic">
                            No summary yet. Click <strong>↻ Rebuild</strong> to generate one from the candidate's profile + resume.
                        </div>
                    ) : (
                        <>
                            {meta.provenance && (
                                <div className="px-5 py-2 flex flex-wrap items-center gap-2 text-[11px] border-b border-slate-100 bg-slate-50/60">
                                    <span className="font-semibold text-slate-600 uppercase tracking-wide">Source legend:</span>
                                    {['R','P','RP','I'].map((code) => (
                                        <span key={code} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${PROV_STYLE[code].chip}`}>
                                            <span className={`inline-block w-1.5 h-1.5 rounded-full ${PROV_STYLE[code].dot}`} />
                                            {PROV_STYLE[code].label}
                                        </span>
                                    ))}
                                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${PROV_STYLE.U.chip}`}>
                                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${PROV_STYLE.U.dot}`} />
                                        {PROV_STYLE.U.label}
                                    </span>
                                </div>
                            )}
                            <div className="divide-y divide-slate-100">
                                {sections.map((sec) => {
                                    const isLocked = lockedSet.has(sec.header);
                                    const provBullets = meta.provenance?.[sec.header]?.bullets || [];
                                    const provProse = meta.provenance?.[sec.header]?.prose || [];
                                    let bulletIdx = 0;
                                    let proseIdx = 0;
                                    return (
                                        <div
                                            key={sec.header}
                                            className={isLocked
                                                ? 'px-5 py-3 bg-indigo-50/60 border-l-4 border-indigo-500'
                                                : 'px-5 py-3 bg-white'}
                                        >
                                            <div className="flex items-center justify-between gap-3 mb-2">
                                                <h4 className={`text-sm font-bold ${isLocked ? 'text-indigo-900' : 'text-slate-800'}`}>
                                                    {isLocked && <span className="mr-1.5">🔒</span>}
                                                    {sec.header}
                                                </h4>
                                                <button
                                                    onClick={() => toggleLock(sec.header)}
                                                    disabled={overlayBusy}
                                                    className={isLocked
                                                        ? 'text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded bg-indigo-200 text-indigo-900 hover:bg-indigo-300 disabled:opacity-50 transition-colors'
                                                        : 'text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-amber-200 hover:text-amber-900 disabled:opacity-50 transition-colors'}
                                                    title={isLocked ? 'Unlock — AI will regenerate this section on rebuild' : 'Lock this section — AI will keep it verbatim on every rebuild'}
                                                >
                                                    {isLocked ? '🔒 locked' : '🔓 lock section'}
                                                </button>
                                            </div>
                                            <div className="space-y-1">
                                                {sec.lines.map((line, i) => {
                                                    if (line.kind === 'blank') return <div key={i} className="h-1" />;
                                                    let code;
                                                    if (isLocked) code = 'U';
                                                    else if (line.kind === 'bullet') {
                                                        code = provBullets[bulletIdx] || (provBullets.length ? 'I' : 'U');
                                                        bulletIdx += 1;
                                                    } else {
                                                        code = provProse[proseIdx] || (provProse.length ? 'I' : 'U');
                                                        proseIdx += 1;
                                                    }
                                                    const style = PROV_STYLE[code] || PROV_STYLE.I;
                                                    return (
                                                        <div
                                                            key={i}
                                                            className={`flex items-start gap-2 pl-2 border-l-2 ${style.side}`}
                                                            title={`Source: ${style.label}`}
                                                        >
                                                            <span className={`mt-1.5 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot}`} />
                                                            <span className="text-sm leading-relaxed text-slate-800 whitespace-pre-wrap flex-1">
                                                                {line.kind === 'bullet' ? `- ${line.text}` : line.text}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            ) : (
                <div className="bg-white border border-blue-300 rounded-xl shadow-sm overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-blue-200 bg-blue-50">
                        <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-blue-900">✎ Editing summary</span>
                            <span className="text-xs text-blue-700">
                                {draft.trim().split(/\s+/).filter(Boolean).length} words
                            </span>
                            {lockedSet.size > 0 && (
                                <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300">
                                    🔒 {lockedSet.size} section{lockedSet.size === 1 ? '' : 's'} will be preserved verbatim
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={cancelEdit}
                                className="px-3 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-300 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveEdit}
                                disabled={saving}
                                className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-sm"
                            >
                                {saving ? 'Saving…' : '✓ Save changes'}
                            </button>
                        </div>
                    </div>
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={22}
                        className="w-full p-4 text-sm font-mono text-slate-800 leading-relaxed focus:outline-none border-0 bg-blue-50/30"
                        placeholder="Edit candidate summary…"
                    />
                </div>
            )}
        </div>
    );
}

// PushHistoryPanel: per-day count of operator-pushed jobs over last 30 days.
// Visualises both a tally + tiny bar chart so admin can see push pattern at a
// glance + spot dead days. Cap progress shown alongside.
function PushHistoryPanel({ history, loading, onReload }) {
    if (loading && !history) {
        return <div className="text-slate-500 text-sm">Loading push history…</div>;
    }
    if (!history) {
        return (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-slate-700">Push History</h4>
                    <button onClick={onReload} className="text-xs text-blue-600 hover:underline">↻ Retry</button>
                </div>
                <p className="text-xs text-slate-500 mt-2">Could not load push history.</p>
            </div>
        );
    }
    const rows = history.history || [];
    const totalOps = history.totals?.ops || 0;
    const totalAll = history.totals?.all || 0;
    const cap = history.capInfo?.targetJobCount;
    const remaining = history.capInfo?.remaining;
    const maxOps = rows.reduce((m, r) => (r.ops > m ? r.ops : m), 0) || 1;

    // Build a dense day-by-day list for the last N days even if no jobs were
    // pushed that day (so the table reads "0" instead of skipping the date).
    const today = new Date();
    const denseDays = [];
    for (let i = (history.days || 30) - 1; i >= 0; i -= 1) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const found = rows.find((r) => r.date === key);
        denseDays.push({ date: key, ops: found?.ops || 0, all: found?.all || 0 });
    }
    const recent = denseDays.slice(-14); // table shows last 14, bar chart full 30

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-slate-700">
                    Push History <span className="text-xs text-slate-500 font-normal">— last {history.days || 30} days, ops only</span>
                </h4>
                <button onClick={onReload} className="text-xs text-blue-600 hover:underline">↻ Refresh</button>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-2">
                    <div className="text-xs text-blue-700 uppercase tracking-wide">Total ops-pushed</div>
                    <div className="text-2xl font-bold text-blue-900">{totalOps}</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                    <div className="text-xs text-emerald-700 uppercase tracking-wide">All jobs</div>
                    <div className="text-2xl font-bold text-emerald-900">{totalAll}</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2">
                    <div className="text-xs text-amber-700 uppercase tracking-wide">Cap remaining</div>
                    <div className="text-2xl font-bold text-amber-900">
                        {cap == null ? '∞' : remaining != null ? remaining : `${totalOps}/${cap}`}
                    </div>
                </div>
            </div>

            <div className="flex items-end gap-1 h-20 mb-3 overflow-x-auto">
                {denseDays.map((d) => {
                    const h = (d.ops / maxOps) * 100;
                    return (
                        <div
                            key={d.date}
                            title={`${d.date}: ${d.ops} ops · ${d.all} total`}
                            className="flex-1 min-w-[8px] flex flex-col justify-end"
                        >
                            <div
                                className={`rounded-t ${d.ops > 0 ? 'bg-blue-500' : 'bg-slate-200'}`}
                                style={{ height: `${Math.max(h, 4)}%` }}
                            />
                        </div>
                    );
                })}
            </div>

            <table className="w-full text-xs">
                <thead>
                    <tr className="text-slate-500 border-b border-slate-200">
                        <th className="text-left py-1 px-2">Date</th>
                        <th className="text-right py-1 px-2">Ops pushes</th>
                        <th className="text-right py-1 px-2">All adds</th>
                    </tr>
                </thead>
                <tbody>
                    {recent.slice().reverse().map((d) => (
                        <tr key={d.date} className="border-b border-slate-100 hover:bg-slate-50">
                            <td className="py-1 px-2 font-mono text-slate-700">{d.date}</td>
                            <td className={`py-1 px-2 text-right font-medium ${d.ops > 0 ? 'text-blue-700' : 'text-slate-400'}`}>{d.ops}</td>
                            <td className="py-1 px-2 text-right text-slate-600">{d.all}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
