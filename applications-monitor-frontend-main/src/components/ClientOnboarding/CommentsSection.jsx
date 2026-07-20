import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Loader2,
  X,
  CheckCircle,
  CornerUpLeft,
  ArrowUpDown,
  Image,
  RotateCcw
} from 'lucide-react';
import { STATUS_LABELS } from '../../store/onboardingStore';
import { API_BASE, AUTH_HEADERS } from './constants';
import {
  getAllowedStatusesForPlan,
  parseMentions,
  extractTextFromContentEditable,
  renderTextWithMentions
} from './helpers';
import { toastUtils } from '../../utils/toastUtils';
import { initials, avatarColor, timeAgo } from '../../utils/chatFormat';

const emailPrefix = (e) => (e || '').split('@')[0];

// Display-only mention highlighting (no HTML injection — plain React spans)
const renderBody = (text) => {
  const parts = String(text || '').split(/(@[\w.-]+)/g);
  return parts.map((p, i) =>
    p.startsWith('@')
      ? <span key={i} className="text-primary font-semibold bg-orange-50 rounded px-0.5">{p}</span>
      : <React.Fragment key={i}>{p}</React.Fragment>
  );
};

const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayKey = (d) => new Date(d).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });

/** One message in the stream: avatar, body, status pills, hover actions, thread teaser. */
const CommentRow = React.memo(function CommentRow({
  comment, meEmail, isAdmin, resolving, onResolve, onOpenThread, threadOpen
}) {
  const taggedEmails = (comment.taggedUserIds || []).map((e) => (e || '').toLowerCase().trim()).filter(Boolean);
  const resolvedByTagged = comment.resolvedByTagged || [];
  const resolvedEmails = resolvedByTagged.map((r) => (r.email || '').toLowerCase());
  const isTagged = meEmail && taggedEmails.includes(meEmail);
  const hasResolved = resolvedEmails.includes(meEmail);
  const allResolved = taggedEmails.length > 0 && taggedEmails.every((e) => resolvedEmails.includes(e));
  const unresolvedNames = taggedEmails.filter((e) => !resolvedEmails.includes(e)).map(emailPrefix);
  const canResolve = comment._id && ((isTagged && !hasResolved) || (isAdmin && taggedEmails.length > 0 && !allResolved));
  const replies = comment.replies || [];
  const lastReply = replies[replies.length - 1];
  const isSystem = (comment.authorEmail || '').includes('.internal') || comment.authorName === 'System';

  return (
    <div className={`group relative flex gap-3 px-3 py-2.5 -mx-3 rounded-xl transition-colors hover:bg-[#faf9f8] ${threadOpen ? 'bg-orange-50/40' : ''}`}>
      {/* hover actions */}
      {comment._id && (
        <div className="absolute -top-3 right-3 hidden group-hover:flex items-center gap-0.5 bg-white border border-[#e6e4e1] rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.08)] p-0.5 z-10">
          <button
            type="button"
            onClick={() => onOpenThread(String(comment._id))}
            className="px-2.5 py-1 rounded-md text-xs font-semibold text-primary hover:bg-orange-50 inline-flex items-center gap-1.5"
          >
            <CornerUpLeft className="w-3 h-3" /> Reply in thread
          </button>
          {canResolve && (
            <button
              type="button"
              onClick={() => onResolve(comment)}
              disabled={resolving}
              className="px-2.5 py-1 rounded-md text-xs font-semibold text-gray-600 hover:bg-[#f6f5f4] inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {resolving ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />} Resolve
            </button>
          )}
        </div>
      )}

      <span className={`w-8 h-8 rounded-full flex-shrink-0 mt-0.5 grid place-items-center text-[11px] font-bold ${isSystem ? 'bg-[#e8e6f8] text-[#5a55b0]' : avatarColor(((comment.authorName || comment.authorEmail) || '').toLowerCase())}`}>
        {initials(comment.authorName || comment.authorEmail || 'U')}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[13.5px] font-bold text-gray-900 truncate">{comment.authorName || comment.authorEmail || 'User'}</span>
          <span className="text-[11px] text-gray-400 tabular-nums whitespace-nowrap">{fmtTime(comment.createdAt)}</span>
        </div>
        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words mt-0.5">{renderBody(comment.body)}</p>

        {comment.images?.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {comment.images.map((img, idx) => (
              <a key={idx} href={img.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-gray-200 hover:border-primary/40">
                <img src={img.url} alt={img.filename || 'Image'} className="max-h-40 max-w-[200px] object-cover w-auto h-auto" loading="lazy" decoding="async" />
              </a>
            ))}
          </div>
        )}

        {/* tag status pill */}
        {taggedEmails.length > 0 && (
          <div className="mt-1.5">
            {allResolved ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2.5 py-0.5">
                <CheckCircle className="w-3 h-3" />
                Resolved · {resolvedEmails.map(emailPrefix).join(', ')}
                {resolvedByTagged[0]?.resolvedAt ? ` · ${new Date(resolvedByTagged[0].resolvedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Open · waiting on {unresolvedNames.join(', ') || (comment.taggedNames || []).join(', ')}
              </span>
            )}
          </div>
        )}

        {/* thread teaser */}
        {replies.length > 0 && (
          <button
            type="button"
            onClick={() => onOpenThread(String(comment._id))}
            className={`mt-2 inline-flex items-center gap-2 border rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
              allResolved
                ? 'border-[#e6e4e1] bg-white text-green-700 hover:border-green-200'
                : 'border-[#e6e4e1] bg-white text-gray-700 hover:border-orange-200'
            }`}
          >
            {allResolved && <CheckCircle className="w-3 h-3 text-green-600" />}
            {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
            <span className="font-normal text-gray-400">· {timeAgo(lastReply?.createdAt)}</span>
          </button>
        )}
      </div>
    </div>
  );
});

const CommentsSection = React.memo(({
  selectedJob,
  user,
  roles,
  loadingComments = false,
  onUpdateJob,
  onMoveJob,
  canMoveAny,
  movingStatus,
  onFetchNonResolvedIssues
}) => {
  const commentTextRef = useRef('');
  const [commentHasContent, setCommentHasContent] = useState(false);
  const [, setCommentHasTags] = useState(false);
  const [addingComment, setAddingComment] = useState(false);
  const [resolvingCommentId, setResolvingCommentId] = useState(null);
  const [commentImages, setCommentImages] = useState([]);
  const [uploadingCommentImage, setUploadingCommentImage] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [commentMoveTarget, setCommentMoveTarget] = useState('');
  const [showMoveOptions, setShowMoveOptions] = useState(false);
  // Threads
  const [openThreadId, setOpenThreadId] = useState(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [sendingReply, setSendingReply] = useState(false);
  const [reopening, setReopening] = useState(false);
  const commentInputRef = useRef(null);
  const commentImageInputRef = useRef(null);
  const mentionStartRef = useRef(0);
  const mentionEndRef = useRef(0);
  const uploadBatchIdRef = useRef(0);
  const streamRef = useRef(null);
  const replyInputRef = useRef(null);

  const meEmail = (user?.email || '').toLowerCase().trim();
  const isAdmin = user?.role === 'admin';
  const isTeamLead = user?.role === 'team_lead';

  const effectiveMentionableUsers = useMemo(() => {
    const base = roles?.mentionableUsers || [];
    const extra = [];
    const inBase = (email) => base.some((u) => (u.email || '').toLowerCase() === (email || '').toLowerCase());
    if (selectedJob?.csmEmail && !inBase(selectedJob.csmEmail)) extra.push({ email: selectedJob.csmEmail, name: 'CSM' });
    if (selectedJob?.resumeMakerEmail && !inBase(selectedJob.resumeMakerEmail)) extra.push({ email: selectedJob.resumeMakerEmail, name: 'Resume Maker' });
    if (selectedJob?.operatorEmail && !inBase(selectedJob.operatorEmail)) extra.push({ email: selectedJob.operatorEmail, name: selectedJob.operatorName || 'Operations Intern' });
    if (selectedJob?.dashboardManagerEmail && !inBase(selectedJob.dashboardManagerEmail)) extra.push({ email: selectedJob.dashboardManagerEmail, name: 'Dashboard Manager' });
    return [...base, ...extra];
  }, [roles?.mentionableUsers, selectedJob?.csmEmail, selectedJob?.resumeMakerEmail, selectedJob?.operatorEmail, selectedJob?.operatorName, selectedJob?.dashboardManagerEmail]);

  const comments = useMemo(() => selectedJob?.comments || [], [selectedJob?.comments]);

  // Day-grouped stream
  const dayGroups = useMemo(() => {
    const groups = [];
    let current = null;
    for (const c of comments) {
      const key = dayKey(c.createdAt);
      if (!current || current.day !== key) {
        current = { day: key, items: [] };
        groups.push(current);
      }
      current.items.push(c);
    }
    return groups;
  }, [comments]);

  // Chat behavior: stick to the newest message
  useEffect(() => {
    const el = streamRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [comments.length, loadingComments, selectedJob?._id]);

  // Close the thread panel when switching jobs or when the comment vanishes
  useEffect(() => { setOpenThreadId(null); setReplyDraft(''); }, [selectedJob?._id]);

  const openThreadComment = openThreadId
    ? comments.find((c) => String(c._id) === openThreadId) || null
    : null;

  useEffect(() => {
    if (openThreadId && !openThreadComment) setOpenThreadId(null);
  }, [openThreadId, openThreadComment]);

  const uploadCommentImages = useCallback(async (fileList) => {
    const imageFiles = Array.from(fileList).filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) return;
    const base = (API_BASE || '').replace(/\/$/, '');
    if (!base) { toastUtils.error('API URL not configured.'); return; }
    const maxImages = 5;
    const current = commentImages.length;
    const toAdd = Math.min(maxImages - current, imageFiles.length);
    if (toAdd <= 0) { toastUtils.error(`Maximum ${maxImages} images per comment.`); return; }
    const filesToUpload = imageFiles.slice(0, toAdd);
    const batchId = ++uploadBatchIdRef.current;
    const placeholders = filesToUpload.map((f) => ({
      url: URL.createObjectURL(f),
      filename: f.name || 'image',
      pending: true,
      batchId
    }));
    setCommentImages((prev) => [...prev, ...placeholders]);
    setUploadingCommentImage(true);
    try {
      const token = localStorage.getItem('authToken') || '';
      const results = await Promise.all(
        filesToUpload.map(async (file) => {
          const form = new FormData();
          form.append('file', file);
          const res = await fetch(`${base}/api/upload/onboarding-attachment`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: form
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.url) throw new Error(data.message || 'Upload failed');
          return { url: data.url, filename: data.filename || file.name };
        })
      );
      setCommentImages((prev) => {
        const toRemove = prev.filter((x) => x.pending && x.batchId === batchId);
        toRemove.forEach((x) => URL.revokeObjectURL(x.url));
        const rest = prev.filter((x) => !(x.pending && x.batchId === batchId));
        return [...rest, ...results.map((r) => ({ ...r, pending: false }))];
      });
    } catch (err) {
      toastUtils.error(err?.message || 'Upload failed');
      setCommentImages((prev) => prev.filter((x) => !x.pending));
    } finally {
      setUploadingCommentImage(false);
    }
  }, [commentImages.length]);

  const handleCommentChange = useCallback((e) => {
    const element = e.target;
    const text = extractTextFromContentEditable(element);
    commentTextRef.current = text;
    setCommentHasContent(text.trim().length > 0);
    setCommentHasTags(/@[\w.-]+/.test(text));

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setShowMentionDropdown(false);
      return;
    }

    const range = selection.getRangeAt(0);
    const textBeforeRange = range.cloneRange();
    textBeforeRange.setStart(element, 0);
    textBeforeRange.setEnd(range.startContainer, range.startOffset);
    const textBefore = textBeforeRange.toString();

    const atIndex = textBefore.lastIndexOf('@');
    if (atIndex === -1 || /\s/.test(textBefore.slice(atIndex + 1))) {
      setShowMentionDropdown(false);
      return;
    }

    const filter = textBefore.slice(atIndex + 1).toLowerCase();
    mentionStartRef.current = atIndex;
    mentionEndRef.current = textBefore.length;

    const list = effectiveMentionableUsers.filter(
      (u) =>
        (u.name && String(u.name).toLowerCase().includes(filter)) ||
        (u.email && String(u.email).toLowerCase().includes(filter)) ||
        (u.email && String(u.email).toLowerCase().split('@')[0].includes(filter))
    );
    setMentionSuggestions(list);
    setShowMentionDropdown(list.length > 0);
  }, [effectiveMentionableUsers]);

  const handleSelectMention = useCallback((mentionUser) => {
    const element = commentInputRef.current;
    if (!element) return;
    const prefix = (mentionUser.email || '').split('@')[0] || mentionUser.name || '';
    const mentionText = '@' + prefix + ' ';
    const currentText = extractTextFromContentEditable(element);
    const start = mentionStartRef.current;
    const end = mentionEndRef.current;
    const newText = currentText.slice(0, start) + mentionText + currentText.slice(end);
    commentTextRef.current = newText;
    setCommentHasContent(true);
    setCommentHasTags(true);
    const htmlContent = renderTextWithMentions(newText, effectiveMentionableUsers);
    element.innerHTML = htmlContent;
    setShowMentionDropdown(false);
    setTimeout(() => {
      element.focus();
      const sel = window.getSelection();
      const r = document.createRange();
      r.selectNodeContents(element);
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    }, 0);
  }, [effectiveMentionableUsers]);

  const handleAddComment = useCallback(async () => {
    const text = commentTextRef.current;
    const hasText = text.trim().length > 0;
    const hasImages = commentImages.length > 0;
    const hasPendingImages = commentImages.some((x) => x.pending);
    if (!selectedJob || (!hasText && !hasImages) || addingComment || hasPendingImages) return;
    if (!commentMoveTarget) {
      toastUtils.error('Please select a move location before sending a comment');
      return;
    }
    const { taggedUserIds, taggedNames } = parseMentions(text, effectiveMentionableUsers);
    setAddingComment(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}`, {
        method: 'PATCH',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({
          comment: {
            body: text.trim() || '(image)',
            taggedUserIds,
            taggedNames,
            images: commentImages.filter((x) => !x.pending).map(({ url, filename }) => ({ url, filename }))
          }
        })
      });
      if (!res.ok) throw new Error('Failed to add comment');
      const data = await res.json();
      onUpdateJob(data.job);

      if (commentMoveTarget !== selectedJob.status) {
        if (canMoveAny) {
          await onMoveJob(selectedJob._id, commentMoveTarget, true);
        } else {
          const moveRes = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}/request-move`, {
            method: 'POST',
            headers: AUTH_HEADERS(),
            body: JSON.stringify({ targetStatus: commentMoveTarget })
          });
          const moveData = await moveRes.json();
          if (moveRes.ok) onUpdateJob(moveData.job);
        }
      }

      commentTextRef.current = '';
      setCommentHasContent(false);
      setCommentHasTags(false);
      setCommentImages([]);
      setCommentMoveTarget('');
      if (commentInputRef.current) commentInputRef.current.innerHTML = '';
      if (taggedUserIds.length) {
        toastUtils.success(`Comment added. ${taggedUserIds.length} person(s) will be notified.`);
      } else {
        toastUtils.success('Comment added');
      }
      onFetchNonResolvedIssues();
    } catch (e) {
      toastUtils.error(e.message || 'Failed to add comment');
    } finally {
      setAddingComment(false);
    }
  }, [selectedJob, commentImages, addingComment, commentMoveTarget, effectiveMentionableUsers, canMoveAny, onMoveJob, onUpdateJob, onFetchNonResolvedIssues]);

  const handleResolve = useCallback(async (comment) => {
    if (!selectedJob || !comment?._id) return;
    setResolvingCommentId(comment._id);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}/comments/${comment._id}/resolve`, {
        method: 'PATCH',
        headers: AUTH_HEADERS()
      });
      if (!res.ok) throw new Error('Failed to mark as resolved');
      const data = await res.json();
      onUpdateJob(data.job);
      toastUtils.success('Marked as resolved');
      onFetchNonResolvedIssues();
    } catch (e) {
      toastUtils.error(e.message || 'Failed to mark as resolved');
    } finally {
      setResolvingCommentId(null);
    }
  }, [selectedJob, onUpdateJob, onFetchNonResolvedIssues]);

  const handleReopen = useCallback(async (comment) => {
    if (!selectedJob || !comment?._id) return;
    setReopening(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}/comments/${comment._id}/reopen`, {
        method: 'PATCH',
        headers: AUTH_HEADERS()
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to reopen');
      onUpdateJob(data.job);
      toastUtils.success('Reopened — reminders will resume');
      onFetchNonResolvedIssues();
    } catch (e) {
      toastUtils.error(e.message || 'Failed to reopen');
    } finally {
      setReopening(false);
    }
  }, [selectedJob, onUpdateJob, onFetchNonResolvedIssues]);

  const handleSendReply = useCallback(async () => {
    const text = replyDraft.trim();
    if (!text || !selectedJob || !openThreadId || sendingReply) return;
    setSendingReply(true);
    try {
      const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}/comments/${openThreadId}/replies`, {
        method: 'POST',
        headers: AUTH_HEADERS(),
        body: JSON.stringify({ body: text })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to send reply');
      onUpdateJob(data.job);
      setReplyDraft('');
    } catch (e) {
      toastUtils.error(e.message || 'Failed to send reply');
    } finally {
      setSendingReply(false);
    }
  }, [replyDraft, selectedJob, openThreadId, sendingReply, onUpdateJob]);

  const handleOpenThread = useCallback((commentId) => {
    setOpenThreadId(commentId);
    setTimeout(() => replyInputRef.current?.focus(), 50);
  }, []);

  const handleMoveAction = useCallback(async (status) => {
    if (canMoveAny) {
      onMoveJob(selectedJob._id, status, true);
    } else {
      try {
        const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}/request-move`, {
          method: 'POST',
          headers: AUTH_HEADERS(),
          body: JSON.stringify({ targetStatus: status })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed');
        onUpdateJob(data.job);
        toastUtils.success(`Move request sent — awaiting approval`);
        onFetchNonResolvedIssues();
      } catch (err) { toastUtils.error(err.message); }
    }
    setShowMoveOptions(false);
  }, [canMoveAny, selectedJob, onMoveJob, onUpdateJob, onFetchNonResolvedIssues]);

  if (!selectedJob) return null;

  const allowedStatuses = getAllowedStatusesForPlan(selectedJob.planType);
  const moveableStatuses = allowedStatuses.filter(s => s !== selectedJob.status);
  const hasPending = selectedJob.pendingMoveRequest?.active;

  // Thread-panel derived state
  const threadTagged = (openThreadComment?.taggedUserIds || []).map((e) => (e || '').toLowerCase().trim());
  const threadResolvedEmails = (openThreadComment?.resolvedByTagged || []).map((r) => (r.email || '').toLowerCase());
  const threadAllResolved = threadTagged.length > 0 && threadTagged.every((e) => threadResolvedEmails.includes(e));
  const threadCanReopen = threadAllResolved && (
    isAdmin ||
    (openThreadComment?.authorEmail || '').toLowerCase() === meEmail ||
    threadTagged.includes(meEmail)
  );

  return (
    <div className="flex-1 bg-white flex min-h-0">
      {/* ── conversation column ── */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <div ref={streamRef} className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
          {loadingComments ? (
            <div className="space-y-4 pt-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-gray-200 flex-shrink-0" />
                  <div className="flex-1 min-w-0"><div className="bg-gray-100 rounded-xl p-3.5 h-16" /></div>
                </div>
              ))}
            </div>
          ) : comments.length === 0 ? (
            <div className="h-full grid place-items-center">
              <div className="text-center opacity-60">
                <MessageSquare className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                <p className="text-sm text-gray-500 font-medium">No comments yet</p>
                <p className="text-xs text-gray-400 mt-1">Start the conversation below</p>
              </div>
            </div>
          ) : (
            dayGroups.map((g) => (
              <div key={g.day}>
                <div className="flex items-center gap-3 my-3">
                  <div className="flex-1 border-t border-[#efedeb]" />
                  <span className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-[0.08em]">{g.day}</span>
                  <div className="flex-1 border-t border-[#efedeb]" />
                </div>
                <div className="space-y-1">
                  {g.items.map((comment, i) => (
                    <CommentRow
                      key={comment._id || `${g.day}-${i}`}
                      comment={comment}
                      meEmail={meEmail}
                      isAdmin={isAdmin}
                      resolving={resolvingCommentId === comment._id}
                      onResolve={handleResolve}
                      onOpenThread={handleOpenThread}
                      threadOpen={openThreadId === String(comment._id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* ── composer ── */}
        <div className="flex-none px-5 pb-4 pt-2 border-t border-[#efedeb]">
          {/* Move-to (required by workflow) */}
          <div className="flex items-center gap-2 mb-2">
            <label className="text-[11px] font-semibold text-gray-500 whitespace-nowrap uppercase tracking-wide">Move to<span className="text-primary">*</span></label>
            <select
              value={commentMoveTarget}
              onChange={(e) => setCommentMoveTarget(e.target.value)}
              className={`flex-1 text-xs border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors bg-white ${commentMoveTarget ? 'border-green-300 text-green-800' : 'border-[#e6e4e1] text-gray-500'}`}
            >
              <option value="">— Select move location —</option>
              {allowedStatuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s] || s}{s === selectedJob.status ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </div>

          {commentImages.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {commentImages.map((img, idx) => (
                <div key={idx} className="relative group/img">
                  <img src={img.url} alt={img.filename || 'Preview'} className="h-14 w-14 object-cover rounded-lg border border-gray-200" loading="eager" decoding="async" />
                  {img.pending && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setCommentImages((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-700 text-white rounded-full flex items-center justify-center opacity-90 hover:opacity-100 shadow"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="relative">
            {showMentionDropdown && mentionSuggestions.length > 0 && (
              <div className="absolute bottom-full left-0 w-full mb-2 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-20 max-h-[200px] overflow-y-auto">
                {mentionSuggestions.map((u) => (
                  <button
                    key={u.email || u.name || String(Math.random())}
                    onClick={() => handleSelectMention(u)}
                    className="w-full text-left px-4 py-2.5 hover:bg-orange-50 text-sm flex items-center gap-2 text-gray-700 transition-colors"
                  >
                    <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0 text-primary font-bold text-xs">
                      {(u.name || u.email)[0].toUpperCase()}
                    </div>
                    <span className="font-medium">{u.name || u.email}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="relative">
              <div
                ref={commentInputRef}
                contentEditable
                onInput={handleCommentChange}
                onPaste={(e) => {
                  const clipboardFiles = e.clipboardData?.files;
                  if (clipboardFiles?.length > 0) {
                    const hasImages = Array.from(clipboardFiles).some(f => f.type.startsWith('image/'));
                    if (hasImages) {
                      e.preventDefault();
                      uploadCommentImages(clipboardFiles);
                      return;
                    }
                  }
                  e.preventDefault();
                  const text = e.clipboardData.getData('text/plain');
                  const selection = window.getSelection();
                  if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    range.deleteContents();
                    const textNode = document.createTextNode(text);
                    range.insertNode(textNode);
                    range.setStartAfter(textNode);
                    range.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(range);
                    const event = new Event('input', { bubbles: true });
                    e.target.dispatchEvent(event);
                  }
                }}
                data-placeholder="Write a comment… type @ to mention someone"
                className="w-full bg-white border border-[#e6e4e1] rounded-xl px-4 py-3 pr-[8rem] text-sm focus:outline-none focus:ring-2 focus:ring-primary/15 focus:border-primary transition-shadow min-h-[56px] max-h-[120px] overflow-y-auto"
                style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleAddComment();
                  }
                  if (e.key === 'Backspace') {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                      const range = selection.getRangeAt(0);
                      const startContainer = range.startContainer;
                      if (startContainer.nodeType === Node.TEXT_NODE && range.startOffset === 0) {
                        const prevSibling = startContainer.previousSibling;
                        if (prevSibling && prevSibling.hasAttribute && prevSibling.hasAttribute('data-mention-chip')) {
                          e.preventDefault();
                          prevSibling.remove();
                          setTimeout(() => { e.target.dispatchEvent(new Event('input', { bubbles: true })); }, 0);
                          return;
                        }
                      }
                      if (startContainer.nodeType === Node.TEXT_NODE) {
                        const parent = startContainer.parentElement;
                        if (parent && parent.hasAttribute('data-mention-chip')) {
                          e.preventDefault();
                          parent.remove();
                          setTimeout(() => { e.target.dispatchEvent(new Event('input', { bubbles: true })); }, 0);
                          return;
                        }
                      }
                    }
                  }
                }}
                suppressContentEditableWarning={true}
              />
              <style>{`
                [contenteditable][data-placeholder]:empty:before {
                  content: attr(data-placeholder);
                  color: #a39e98;
                  pointer-events: none;
                }
                [data-mention-chip] {
                  user-select: none;
                }
              `}</style>

              {/* Move button */}
              {moveableStatuses.length > 0 && (
                <>
                  <button
                    data-move-options
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMoveOptions(!showMoveOptions); }}
                    className={`absolute right-[5.5rem] top-1/2 -translate-y-1/2 px-2 py-1.5 rounded-lg transition-colors border flex items-center justify-center gap-1 ${
                      hasPending
                        ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
                        : 'bg-[#f6f5f4] text-gray-600 border-[#e6e4e1] hover:bg-[#edebe8]'
                    }`}
                    title={hasPending ? `Pending move to ${STATUS_LABELS[selectedJob.pendingMoveRequest.targetStatus] || selectedJob.pendingMoveRequest.targetStatus}` : 'Request ticket move'}
                  >
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    <span className="text-[9px] font-medium leading-tight">{hasPending ? 'Pending' : 'Move'}</span>
                  </button>

                  {showMoveOptions && (
                    <div data-move-options className="absolute bottom-full right-[5.5rem] mb-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-30 max-h-[300px] overflow-y-auto">
                      {hasPending && (
                        <div className="p-3 border-b border-amber-100 bg-amber-50/50">
                          <p className="text-xs font-semibold text-amber-700 mb-1">Pending move request</p>
                          <p className="text-[11px] text-amber-600">
                            {selectedJob.pendingMoveRequest.requestedByName || selectedJob.pendingMoveRequest.requestedBy} requested move to <strong>{STATUS_LABELS[selectedJob.pendingMoveRequest.targetStatus] || selectedJob.pendingMoveRequest.targetStatus}</strong>
                          </p>
                          {(isAdmin || isTeamLead) && (
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={async (e) => {
                                  e.preventDefault(); e.stopPropagation();
                                  try {
                                    const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}/approve-move`, { method: 'POST', headers: AUTH_HEADERS() });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error || 'Failed');
                                    onUpdateJob(data.job);
                                    toastUtils.success(`Approved! Ticket moved.`);
                                    setShowMoveOptions(false);
                                    onFetchNonResolvedIssues();
                                  } catch (err) { toastUtils.error(err.message); }
                                }}
                                className="flex-1 text-xs px-3 py-1.5 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium"
                              >Approve</button>
                              <button
                                onClick={async (e) => {
                                  e.preventDefault(); e.stopPropagation();
                                  try {
                                    const res = await fetch(`${API_BASE}/api/onboarding/jobs/${selectedJob._id}/reject-move`, { method: 'POST', headers: AUTH_HEADERS() });
                                    const data = await res.json();
                                    if (!res.ok) throw new Error(data.error || 'Failed');
                                    onUpdateJob(data.job);
                                    toastUtils.success('Move request rejected');
                                    setShowMoveOptions(false);
                                    onFetchNonResolvedIssues();
                                  } catch (err) { toastUtils.error(err.message); }
                                }}
                                className="flex-1 text-xs px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 font-medium"
                              >Reject</button>
                            </div>
                          )}
                        </div>
                      )}
                      <div className="p-3 border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-700">
                          {canMoveAny ? 'Move ticket to:' : 'Request move to:'}
                        </p>
                      </div>
                      <div className="p-2 flex flex-col gap-1">
                        {moveableStatuses.map((status) => (
                          <button
                            key={status}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleMoveAction(status); }}
                            disabled={movingStatus === selectedJob._id || (hasPending && !canMoveAny)}
                            className="text-left text-xs px-3 py-2 bg-primary/5 text-primary rounded-lg hover:bg-primary/10 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed border border-primary/10 hover:border-primary/30"
                          >
                            {STATUS_LABELS[status] || status}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <input
                ref={commentImageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = e?.target?.files;
                  if (files?.length) await uploadCommentImages(files);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => commentImageInputRef.current?.click()}
                disabled={uploadingCommentImage || commentImages.length >= 5}
                className="absolute right-12 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-primary hover:bg-orange-50 rounded-lg disabled:opacity-50 transition-colors"
                title="Add image"
              >
                {uploadingCommentImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
              </button>
              <button
                onClick={handleAddComment}
                disabled={(!commentHasContent && commentImages.length === 0) || addingComment || !commentMoveTarget || commentImages.some((x) => x.pending)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary text-white rounded-full disabled:opacity-40 disabled:bg-gray-300 hover:bg-primary-hover transition-colors flex items-center justify-center"
                title={commentImages.some((x) => x.pending) ? 'Wait for images to upload' : commentMoveTarget ? 'Send comment (Enter)' : 'Select a move location first'}
              >
                {addingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── thread panel ── */}
      {openThreadComment && (
        <div className="w-[320px] flex-none border-l border-[#e6e4e1] flex flex-col min-h-0 bg-white">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#efedeb]">
            <span className="text-[13.5px] font-bold text-gray-900">Thread</span>
            {threadTagged.length > 0 && (
              threadAllResolved ? (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                  <CheckCircle className="w-2.5 h-2.5" /> Resolved
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Open
                </span>
              )
            )}
            <button
              type="button"
              onClick={() => setOpenThreadId(null)}
              className="ml-auto p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-[#f6f5f4]"
              aria-label="Close thread"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 min-h-0">
            {/* origin */}
            <div className="border-l-[3px] border-[#e6e4e1] pl-3 py-0.5 mb-3">
              <p className="text-xs font-bold text-gray-800">
                {openThreadComment.authorName || openThreadComment.authorEmail} · {new Date(openThreadComment.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
              <p className="text-[12.5px] text-gray-600 mt-0.5 whitespace-pre-wrap break-words">{renderBody(openThreadComment.body)}</p>
            </div>

            {threadAllResolved && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 rounded-lg px-3 py-2 text-xs font-semibold mb-3">
                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-1 min-w-0 truncate">
                  Resolved by {threadResolvedEmails.map(emailPrefix).join(', ')}
                </span>
                {threadCanReopen && (
                  <button
                    type="button"
                    onClick={() => handleReopen(openThreadComment)}
                    disabled={reopening}
                    className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-600 bg-white border border-[#e6e4e1] rounded-md px-2 py-0.5 hover:text-gray-900 disabled:opacity-50"
                  >
                    {reopening ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />} Reopen
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center gap-2.5 my-2">
              <div className="flex-1 border-t border-[#efedeb]" />
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.08em]">
                {(openThreadComment.replies || []).length} {(openThreadComment.replies || []).length === 1 ? 'reply' : 'replies'}
              </span>
              <div className="flex-1 border-t border-[#efedeb]" />
            </div>

            {(openThreadComment.replies || []).length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">No replies yet — start the thread.</p>
            ) : (
              <div className="space-y-3">
                {(openThreadComment.replies || []).map((r, i) => (
                  <div key={r._id || i} className="flex gap-2.5">
                    <span className={`w-6 h-6 rounded-full flex-shrink-0 mt-0.5 grid place-items-center text-[9px] font-bold ${avatarColor(((r.authorName || r.authorEmail) || '').toLowerCase())}`}>
                      {initials(r.authorName || r.authorEmail || 'U')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12.5px] font-bold text-gray-900 truncate">{r.authorName || r.authorEmail}</span>
                        <span className="text-[10px] text-gray-400 whitespace-nowrap">{fmtTime(r.createdAt)}</span>
                      </div>
                      <p className="text-[13px] text-gray-700 whitespace-pre-wrap break-words mt-0.5">{renderBody(r.body)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* thread composer */}
          <div className="flex-none p-3 border-t border-[#efedeb]">
            <div className="flex items-end gap-2 rounded-xl border border-[#e6e4e1] bg-white px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 transition-shadow">
              <textarea
                ref={replyInputRef}
                rows={1}
                value={replyDraft}
                onChange={(e) => setReplyDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); }
                }}
                placeholder="Reply in thread…"
                className="flex-1 resize-none text-[13px] outline-none max-h-24 bg-transparent placeholder:text-gray-400"
                style={{ minHeight: 20 }}
              />
              <button
                type="button"
                onClick={handleSendReply}
                disabled={!replyDraft.trim() || sendingReply}
                className="p-1.5 rounded-full bg-primary text-white disabled:opacity-40 hover:bg-primary-hover transition-colors flex-shrink-0"
                aria-label="Send reply"
              >
                {sendingReply ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

CommentsSection.displayName = 'CommentsSection';
export default CommentsSection;
