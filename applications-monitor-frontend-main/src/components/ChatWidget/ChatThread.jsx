import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Briefcase,
  CornerUpLeft,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  SendHorizontal,
  X
} from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { timeAgo } from '../../utils/chatFormat';
import { API_BASE } from '../ClientOnboarding/constants';
import Avatar from './Avatar';
import ImageLightbox from './ImageLightbox';

const MAX_ATTACHMENTS = 5;

const isImageAttachment = (a) =>
  (a.contentType || '').startsWith('image/') ||
  /\.(jpg|jpeg|png|gif|webp|svg|avif)$/i.test(a.filename || a.url || '');

async function uploadChatFile(file) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/upload/chat-attachment`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${localStorage.getItem('authToken') || ''}` },
    body: form
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.url) throw new Error(data.message || 'Upload failed');
  return { url: data.url, filename: data.filename || file.name, contentType: data.contentType || file.type };
}

const TicketCard = React.memo(function TicketCard({ ticket, mine, onGo }) {
  return (
    <button
      type="button"
      onClick={() => onGo(ticket)}
      className={`mt-2 w-full flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors ${
        mine
          ? 'border-white/30 bg-white/10 hover:bg-white/20'
          : 'border-[#e6e4e1] bg-white hover:bg-orange-50 hover:border-orange-200'
      }`}
    >
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${mine ? 'bg-white/20' : 'bg-orange-100'}`}>
        <Briefcase className={`w-4 h-4 ${mine ? 'text-white' : 'text-orange-600'}`} />
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-xs font-bold truncate ${mine ? 'text-white' : 'text-gray-900'}`}>
          {ticket.clientNumber != null ? `${ticket.clientNumber} – ` : ''}{ticket.clientName || 'Ticket'}
        </span>
        <span className={`block text-[11px] ${mine ? 'text-white/80' : 'text-gray-500'}`}>
          #{ticket.jobNumber ?? '—'} · Go to ticket →
        </span>
      </span>
    </button>
  );
});

const AttachmentBlock = React.memo(function AttachmentBlock({ attachments, mine, onOpenImage }) {
  const images = attachments.filter(isImageAttachment);
  const files = attachments.filter((a) => !isImageAttachment(a));
  return (
    <div className="mt-2 space-y-1.5">
      {images.length > 0 && (
        <div className={`grid gap-1.5 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {images.map((a, i) => (
            <button
              key={a.url}
              type="button"
              onClick={() => onOpenImage(images, i)}
              className="block rounded-lg overflow-hidden border border-black/5 hover:opacity-90 transition-opacity"
              title={a.filename}
            >
              <img
                src={a.url}
                alt={a.filename || 'attachment'}
                loading="lazy"
                className={`w-full object-cover ${images.length > 1 ? 'h-28' : 'max-h-48'}`}
              />
            </button>
          ))}
        </div>
      )}
      {files.map((a) => (
        <a
          key={a.url}
          href={a.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border transition-colors ${
            mine
              ? 'border-white/30 bg-white/10 hover:bg-white/20 text-white'
              : 'border-[#e6e4e1] bg-white hover:bg-[#f6f5f4] text-gray-800'
          }`}
        >
          <FileText className={`w-4 h-4 flex-shrink-0 ${mine ? 'text-white/90' : 'text-gray-400'}`} />
          <span className="text-xs font-medium truncate">{a.filename || 'File'}</span>
        </a>
      ))}
    </div>
  );
});

const QuoteBlock = React.memo(function QuoteBlock({ replyTo, mine, onJump }) {
  return (
    <button
      type="button"
      onClick={() => onJump(replyTo.messageId)}
      className={`mb-1.5 w-full text-left rounded-lg px-2.5 py-1.5 border-l-2 ${
        mine ? 'bg-white/10 border-white/50' : 'bg-black/5 border-gray-300'
      }`}
      title="Jump to original message"
    >
      <span className={`block text-[10px] font-bold ${mine ? 'text-white/90' : 'text-gray-600'}`}>
        {replyTo.senderName || replyTo.senderEmail}
      </span>
      <span className={`block text-[11px] truncate ${mine ? 'text-white/75' : 'text-gray-500'}`}>
        {replyTo.text || (replyTo.hasAttachment ? '📎 Attachment' : 'Message')}
      </span>
    </button>
  );
});

const MessageBubble = React.memo(function MessageBubble({
  message, mine, highlighted, onGoToTicket, onReply, onOpenImage, onJump
}) {
  const hasTicket = !!message.ticket?.jobId;
  const attachments = message.attachments || [];
  const hasQuote = !!message.replyTo?.messageId;
  return (
    <div data-message-id={message._id} className={`flex group ${mine ? 'justify-end' : 'justify-start'}`}>
      {/* Reply affordance (left of my bubbles, right of theirs) */}
      {mine && (
        <button
          type="button"
          onClick={() => onReply(message)}
          className="self-center mr-1.5 p-1.5 rounded-full text-gray-300 hover:text-primary hover:bg-orange-50 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Reply"
        >
          <CornerUpLeft className="w-3.5 h-3.5" />
        </button>
      )}
      <div className={`max-w-[80%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words rounded-2xl transition-shadow ${
            mine
              ? 'bg-primary text-white rounded-br-md'
              : 'bg-[#f1efec] text-gray-900 rounded-bl-md'
          } ${highlighted ? 'ring-2 ring-orange-400 ring-offset-2' : ''}`}
        >
          {hasQuote && <QuoteBlock replyTo={message.replyTo} mine={mine} onJump={onJump} />}
          {message.text}
          {attachments.length > 0 && (
            <AttachmentBlock attachments={attachments} mine={mine} onOpenImage={onOpenImage} />
          )}
          {hasTicket && <TicketCard ticket={message.ticket} mine={mine} onGo={onGoToTicket} />}
        </div>
        <span className="text-[10px] text-gray-400 mt-1 px-1">
          {mine ? '' : `${message.senderName} · `}{timeAgo(message.createdAt)}
        </span>
      </div>
      {!mine && (
        <button
          type="button"
          onClick={() => onReply(message)}
          className="self-center ml-1.5 p-1.5 rounded-full text-gray-300 hover:text-primary hover:bg-orange-50 opacity-0 group-hover:opacity-100 transition-opacity"
          title="Reply"
        >
          <CornerUpLeft className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
});

export default function ChatThread({ meEmail }) {
  const navigate = useNavigate();
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const conversation = useChatStore((s) =>
    s.conversations.find((c) => c._id === s.activeConversationId)
  );
  const entry = useChatStore((s) => s.messages[s.activeConversationId]);
  const backToList = useChatStore((s) => s.backToList);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const loadOlderMessages = useChatStore((s) => s.loadOlderMessages);
  const sending = useChatStore((s) => s.sending);
  const closeWidget = useChatStore((s) => s.closeWidget);
  const otherOnline = useChatStore((s) =>
    !!(conversation && s.onlineUsers[conversation.otherEmail])
  );
  const typingName = useChatStore((s) =>
    s.activeConversationId ? s.typing[s.activeConversationId]?.name || null : null
  );
  const sendTyping = useChatStore((s) => s.sendTyping);
  const pendingTicketShare = useChatStore((s) => s.pendingTicketShare);
  const clearTicketShare = useChatStore((s) => s.clearTicketShare);

  const [draft, setDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState([]); // { id, file, previewUrl, filename, isImage }
  const [replyTarget, setReplyTarget] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { images, index }
  const [highlightedId, setHighlightedId] = useState(null);
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const nearBottomRef = useRef(true);
  const highlightTimerRef = useRef(null);
  const lastTypingSentRef = useRef(0);
  const items = entry?.items || [];

  // Read receipt: "Seen" under my last message once the other side has read it.
  const lastMessage = items[items.length - 1];
  const lastMineSeen =
    !!lastMessage &&
    (lastMessage.senderEmail || '').toLowerCase() === meEmail &&
    (lastMessage.readBy || []).includes(conversation?.otherEmail);

  // Stick to the bottom on new messages unless the user scrolled up.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [items.length, activeConversationId, pendingFiles.length, replyTarget]);

  // Reset composer state when switching conversations; revoke blob previews.
  useEffect(() => {
    setDraft('');
    setReplyTarget(null);
    setPendingFiles((prev) => {
      prev.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
      return [];
    });
    setLightbox(null);
  }, [activeConversationId]);

  useEffect(() => () => clearTimeout(highlightTimerRef.current), []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList || []);
    if (!incoming.length) return;
    setPendingFiles((prev) => {
      const room = MAX_ATTACHMENTS - prev.length;
      const accepted = incoming.slice(0, Math.max(0, room)).map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        filename: file.name || 'file',
        isImage: (file.type || '').startsWith('image/'),
        previewUrl: (file.type || '').startsWith('image/') ? URL.createObjectURL(file) : null
      }));
      return [...prev, ...accepted];
    });
  }, []);

  const removePendingFile = useCallback((id) => {
    setPendingFiles((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }, []);

  const handlePaste = useCallback((e) => {
    const files = Array.from(e.clipboardData?.items || [])
      .filter((it) => it.kind === 'file')
      .map((it) => it.getAsFile())
      .filter(Boolean);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }, [addFiles]);

  const handleReply = useCallback((message) => {
    setReplyTarget(message);
    textareaRef.current?.focus();
  }, []);

  const jumpToMessage = useCallback((messageId) => {
    const el = scrollRef.current?.querySelector(`[data-message-id="${messageId}"]`);
    if (!el) return; // original not loaded (older page) — quote content is still visible
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedId(String(messageId));
    clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightedId(null), 1600);
  }, []);

  // Throttled typing ping — at most one every 2s while the user types.
  const handleDraftChange = useCallback((e) => {
    setDraft(e.target.value);
    const now = Date.now();
    if (activeConversationId && now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now;
      sendTyping(activeConversationId);
    }
  }, [activeConversationId, sendTyping]);

  const handleSend = useCallback(async () => {
    const text = draft.trim();
    const ticket = pendingTicketShare;
    if ((!text && pendingFiles.length === 0 && !ticket) || sending || uploading || !activeConversationId) return;
    setUploading(true);
    const filesToSend = pendingFiles;
    try {
      const attachments = [];
      for (const p of filesToSend) {
        attachments.push(await uploadChatFile(p.file));
      }
      nearBottomRef.current = true;
      await sendMessage(activeConversationId, { text, attachments, replyTo: replyTarget, ticket });
      // Clear the composer only AFTER a successful send — a failed upload or
      // send must never eat the user's message.
      setDraft('');
      setPendingFiles([]);
      setReplyTarget(null);
      filesToSend.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    } catch {
      // draft + files + reply target intentionally kept
    } finally {
      setUploading(false);
    }
  }, [draft, pendingFiles, replyTarget, pendingTicketShare, sending, uploading, activeConversationId, sendMessage]);

  const handleGoToTicket = useCallback((ticket) => {
    closeWidget();
    navigate(`/client-onboarding?job=${ticket.jobId}`);
  }, [closeWidget, navigate]);

  const openImage = useCallback((images, index) => setLightbox({ images, index }), []);

  // Conversation row not in the list yet (e.g. OS-notification click right
  // after a reload, before loadConversations lands) — show progress, not a
  // blank panel; the connected-handler's loadConversations fills it in.
  if (!conversation) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }
  const busy = sending || uploading;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Thread header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-[#efedeb]">
        <button
          type="button"
          onClick={backToList}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          aria-label="Back to messages"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Avatar name={conversation.otherName} email={conversation.otherEmail} size="sm" online={otherOnline} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 truncate">{conversation.otherName}</p>
          <p className={`text-[11px] truncate ${typingName ? 'text-primary font-medium' : otherOnline ? 'text-emerald-600' : 'text-gray-400'}`}>
            {typingName ? 'typing…' : otherOnline ? 'Online' : conversation.otherEmail}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {!entry?.loaded ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : (
          <>
            {entry.hasMore && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => loadOlderMessages(activeConversationId)}
                  className="text-xs text-gray-500 hover:text-primary font-medium px-3 py-1 rounded-full bg-gray-50 border border-[#e6e4e1]"
                >
                  Load earlier messages
                </button>
              </div>
            )}
            {items.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-8">Say hi — this is the beginning of your conversation.</p>
            )}
            {items.map((m) => (
              <MessageBubble
                key={m._id}
                message={m}
                mine={(m.senderEmail || '').toLowerCase() === meEmail}
                highlighted={highlightedId === String(m._id)}
                onGoToTicket={handleGoToTicket}
                onReply={handleReply}
                onOpenImage={openImage}
                onJump={jumpToMessage}
              />
            ))}
            {lastMineSeen && (
              <p className="text-[10px] text-gray-400 text-right pr-1 -mt-2">Seen</p>
            )}
          </>
        )}
      </div>

      {/* Composer */}
      <div className="p-3 border-t border-[#efedeb] space-y-2">
        {/* Ticket share chip (from "Discuss in chat" on a ticket) */}
        {pendingTicketShare && (
          <div className="flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-100 px-3 py-1.5">
            <Briefcase className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[10px] font-bold text-orange-700">Sharing ticket</span>
              <span className="block text-[11px] text-gray-600 truncate">
                {pendingTicketShare.clientNumber != null ? `${pendingTicketShare.clientNumber} – ` : ''}
                {pendingTicketShare.clientName || 'Ticket'} · #{pendingTicketShare.jobNumber ?? '—'}
              </span>
            </span>
            <button
              type="button"
              onClick={clearTicketShare}
              className="p-1 rounded text-gray-400 hover:text-gray-600 flex-shrink-0"
              aria-label="Cancel ticket share"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Reply quote bar */}
        {replyTarget && (
          <div className="flex items-center gap-2 rounded-lg bg-orange-50 border border-orange-100 px-3 py-1.5">
            <CornerUpLeft className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
            <span className="flex-1 min-w-0">
              <span className="block text-[10px] font-bold text-orange-700">
                Replying to {(replyTarget.senderEmail || '').toLowerCase() === meEmail ? 'yourself' : replyTarget.senderName}
              </span>
              <span className="block text-[11px] text-gray-600 truncate">
                {replyTarget.text || ((replyTarget.attachments || []).length ? '📎 Attachment' : 'Message')}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setReplyTarget(null)}
              className="p-1 rounded text-gray-400 hover:text-gray-600 flex-shrink-0"
              aria-label="Cancel reply"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Pending attachment previews */}
        {pendingFiles.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {pendingFiles.map((p) => (
              <span key={p.id} className="relative group/att">
                {p.isImage ? (
                  <img src={p.previewUrl} alt={p.filename} className="w-14 h-14 object-cover rounded-lg border border-[#e6e4e1]" />
                ) : (
                  <span className="w-14 h-14 rounded-lg border border-[#e6e4e1] bg-gray-50 flex flex-col items-center justify-center gap-0.5 px-1">
                    <FileText className="w-4 h-4 text-gray-400" />
                    <span className="text-[8px] text-gray-500 truncate w-full text-center">{p.filename}</span>
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removePendingFile(p.id)}
                  className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 p-0.5 rounded-full bg-gray-700 text-white opacity-0 group-hover/att:opacity-100 transition-opacity"
                  aria-label={`Remove ${p.filename}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2 rounded-xl border border-[#e6e4e1] bg-white px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 transition-shadow">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={pendingFiles.length >= MAX_ATTACHMENTS}
            className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-orange-50 transition-colors disabled:opacity-40 flex-shrink-0"
            title={pendingFiles.length >= MAX_ATTACHMENTS ? `Max ${MAX_ATTACHMENTS} files` : 'Attach a file (or paste an image)'}
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
          <textarea
            ref={textareaRef}
            rows={1}
            value={draft}
            onChange={handleDraftChange}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Message…"
            className="flex-1 resize-none text-sm outline-none max-h-28 bg-transparent placeholder:text-gray-400"
            style={{ minHeight: 20 }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={(!draft.trim() && pendingFiles.length === 0 && !pendingTicketShare) || busy}
            className="p-2 rounded-full bg-primary text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-hover transition-colors flex-shrink-0"
            aria-label="Send message"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
          </button>
        </div>
        {uploading && pendingFiles.length > 0 && (
          <p className="text-[10px] text-gray-400 flex items-center gap-1">
            <ImageIcon className="w-3 h-3" /> Uploading {pendingFiles.length} file{pendingFiles.length === 1 ? '' : 's'}…
          </p>
        )}
      </div>

      {/* Image viewer */}
      <AnimatePresence>
        {lightbox && (
          <ImageLightbox
            images={lightbox.images}
            startIndex={lightbox.index}
            onClose={() => setLightbox(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
