import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  MessageSquare,
  Send,
  Loader2,
  X,
  CheckCircle,
  ArrowUpDown,
  ChevronDown,
  Image
} from 'lucide-react';
import { STATUS_LABELS } from '../../store/onboardingStore';
import { API_BASE, AUTH_HEADERS } from './constants';
import {
  getAllowedStatusesForPlan,
  parseMentions,
  extractTextFromContentEditable,
  renderTextWithMentions,
  findMentionUser
} from './helpers';
import { toastUtils } from '../../utils/toastUtils';

const CommentsSection = React.memo(({
  selectedJob,
  user,
  roles,
  loadingJobDetails,
  loadingComments = false,
  onUpdateJob,
  onMoveJob,
  canMoveAny,
  movingStatus,
  onFetchNonResolvedIssues
}) => {
  const commentTextRef = useRef('');
  const [commentHasContent, setCommentHasContent] = useState(false);
  const [commentHasTags, setCommentHasTags] = useState(false);
  const [addingComment, setAddingComment] = useState(false);
  const [resolvingCommentId, setResolvingCommentId] = useState(null);
  const [commentImages, setCommentImages] = useState([]);
  const [uploadingCommentImage, setUploadingCommentImage] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [commentMoveTarget, setCommentMoveTarget] = useState('');
  const [showMoveOptions, setShowMoveOptions] = useState(false);
  const commentInputRef = useRef(null);
  const commentImageInputRef = useRef(null);
  const mentionStartRef = useRef(0);
  const mentionEndRef = useRef(0);
  const uploadBatchIdRef = useRef(0);

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
    // Instant: show blob preview immediately (no wait for upload)
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
    const emailPrefix = (mentionUser.email || '').split('@')[0] || mentionUser.name || '';
    const mentionText = '@' + emailPrefix + ' ';
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

      // Always update immediately so new comment appears without refresh
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

  const isAdmin = user?.role === 'admin';
  const isTeamLead = user?.role === 'team_lead';

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

  const comments = selectedJob.comments || [];
  const allowedStatuses = getAllowedStatusesForPlan(selectedJob.planType);
  const moveableStatuses = allowedStatuses.filter(s => s !== selectedJob.status);
  const hasPending = selectedJob.pendingMoveRequest?.active;

  return (
    <div className="w-[45%] bg-white border-l border-gray-200 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" /> Comments
          </h3>
          {comments.length > 0 && (
            <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full font-medium">
              {comments.length}
            </span>
          )}
        </div>
      </div>

      {/* Comments List */}
      <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-4">
        {loadingComments ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-9 h-9 rounded-full bg-gray-200 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="bg-gray-100 rounded-xl rounded-tl-none p-3.5 h-20" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-12 opacity-50">
            <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500 font-medium">No comments yet</p>
            <p className="text-xs text-gray-400 mt-1">Start the conversation below</p>
          </div>
        ) : (
          comments.map((comment, i) => (
            <div key={comment._id || i} className="flex gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-100 to-orange-200 flex items-center justify-center flex-shrink-0 text-primary font-bold text-sm shadow-sm">
                {(comment.authorName || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="bg-gray-50 rounded-xl rounded-tl-none p-3.5 border border-gray-100 shadow-sm">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-sm font-bold text-gray-900">{comment.authorName || 'User'}</span>
                    <span className="text-[10px] text-gray-400 whitespace-nowrap ml-2">
                      {new Date(comment.createdAt).toLocaleDateString()} {new Date(comment.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{comment.body}</p>
                  {comment.images?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {comment.images.map((img, idx) => (
                        <a key={idx} href={img.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden border border-gray-200 hover:border-primary/40">
                          <img src={img.url} alt={img.filename || 'Image'} className="max-h-40 max-w-[200px] object-cover w-auto h-auto" loading="lazy" decoding="async" />
                        </a>
                      ))}
                    </div>
                  )}
                  {((comment.taggedUserIds?.length > 0) || (comment.taggedNames?.length > 0) || (comment.taggedUsers?.length > 0)) && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <p className="text-[10px] text-gray-500 font-medium">
                        Tagged: {(comment.taggedNames || comment.taggedUsers?.map(u => u.name || u.email) || []).join(', ')}
                      </p>
                    </div>
                  )}
                  {(() => {
                    const taggedEmails = (comment.taggedUserIds || []).map(e => (e || '').toLowerCase().trim()).filter(Boolean);
                    const resolvedByTagged = comment.resolvedByTagged || [];
                    const currentUserEmail = (user?.email || '').toLowerCase().trim();
                    const isTagged = currentUserEmail && taggedEmails.includes(currentUserEmail);
                    const hasResolved = resolvedByTagged.some(r => (r.email || '').toLowerCase() === currentUserEmail);
                    const allTaggedResolved = taggedEmails.length > 0 && taggedEmails.every(e => resolvedByTagged.some(r => (r.email || '').toLowerCase() === e));
                    const canResolve = comment._id && (
                      (isTagged && !hasResolved) ||
                      (isAdmin && taggedEmails.length > 0 && !allTaggedResolved)
                    );
                    return (
                      <>
                        {resolvedByTagged.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-gray-200 flex items-center gap-2 flex-wrap">
                            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0" />
                            <span className="text-xs text-green-700">
                              Resolved by {resolvedByTagged.map(r => r.email).join(', ')} {resolvedByTagged[0]?.resolvedAt ? `on ${new Date(resolvedByTagged[0].resolvedAt).toLocaleDateString()}` : ''}
                            </span>
                          </div>
                        )}
                        {canResolve && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <button
                              type="button"
                              onClick={() => handleResolve(comment)}
                              disabled={resolvingCommentId === comment._id}
                              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                            >
                              {resolvingCommentId === comment._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                              Resolve
                            </button>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Move Location */}
      <div className="px-4 pt-3 pb-1 bg-gray-50 border-t border-gray-200">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-gray-600 whitespace-nowrap">Move to<span className="text-red-500">*</span>:</label>
          <select
            value={commentMoveTarget}
            onChange={(e) => setCommentMoveTarget(e.target.value)}
            className={`flex-1 text-xs border rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all ${commentMoveTarget ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-gray-500'}`}
          >
            <option value="">— Select move location —</option>
            {allowedStatuses.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s] || s}{s === selectedJob.status ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Comment Input */}
      <div className="px-4 pb-4 pt-2 bg-gray-50">
        {commentImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {commentImages.map((img, idx) => (
              <div key={idx} className="relative group">
                <img src={img.url} alt={img.filename || 'Preview'} className="h-14 w-14 object-cover rounded-lg border border-gray-200" loading="eager" decoding="async" />
                {img.pending && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                    <Loader2 className="w-5 h-5 text-white animate-spin" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setCommentImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-90 hover:opacity-100 shadow"
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
              data-placeholder="Write a comment... (Type @ to mention someone)"
              className="w-full bg-white border border-gray-200 rounded-xl px-4 py-3 pr-[8rem] text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all min-h-[60px] max-h-[120px] shadow-sm overflow-y-auto"
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
                color: #9ca3af;
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
                  className={`absolute right-[5.5rem] top-1/2 -translate-y-1/2 px-2 py-1.5 rounded-lg transition-colors shadow-sm border flex items-center justify-center gap-1 ${
                    hasPending
                      ? 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100'
                      : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
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
              className="absolute right-12 top-1/2 -translate-y-1/2 p-2 text-gray-500 hover:text-primary hover:bg-orange-50 rounded-lg disabled:opacity-50 transition-colors"
              title="Add image"
            >
              {uploadingCommentImage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Image className="w-4 h-4" />}
            </button>
            <button
              onClick={handleAddComment}
              disabled={(!commentHasContent && commentImages.length === 0) || addingComment || !commentMoveTarget || commentImages.some((x) => x.pending)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary text-white rounded-lg disabled:opacity-50 disabled:bg-gray-300 hover:bg-[#c94a28] transition-colors shadow-md disabled:shadow-none flex items-center justify-center"
              title={commentImages.some((x) => x.pending) ? 'Wait for images to upload' : commentMoveTarget ? 'Send comment (Enter)' : 'Select a move location first'}
            >
              {addingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

CommentsSection.displayName = 'CommentsSection';
export default CommentsSection;
