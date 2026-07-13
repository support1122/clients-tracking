import React, { useEffect, useMemo } from 'react';
import { motion as Motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, MessageCircle, X, SquarePen } from 'lucide-react';
import { useChatStore, useUnreadTotal } from '../../store/chatStore';
import { startChatStream, stopChatStream } from '../../utils/chatSse';
import { SECTION_EASE } from '../ClientOnboarding/animation';
import ConversationList from './ConversationList';
import ChatThread from './ChatThread';

/**
 * Global team-chat widget (launcher bubble + panel), mounted for every
 * logged-in user on every page. Tag someone in a ticket comment and they get
 * the message here in real time (SSE), with a deep link back to the ticket.
 */
export default function ChatWidget({ user }) {
  const isOpen = useChatStore((s) => s.isOpen);
  const view = useChatStore((s) => s.view);
  const toggleWidget = useChatStore((s) => s.toggleWidget);
  const closeWidget = useChatStore((s) => s.closeWidget);
  const showNewMessage = useChatStore((s) => s.showNewMessage);
  const conversationsLoaded = useChatStore((s) => s.conversationsLoaded);
  const hasConversations = useChatStore((s) => s.conversations.length > 0);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const reset = useChatStore((s) => s.reset);
  const unreadTotal = useUnreadTotal();

  const meEmail = useMemo(() => (user?.email || '').toLowerCase(), [user?.email]);

  // SSE + initial data for the whole session
  useEffect(() => {
    if (!meEmail) return;
    startChatStream();
    loadConversations();
    return () => {
      stopChatStream();
      reset();
    };
  }, [meEmail, loadConversations, reset]);

  // First visit of the day → open the widget with the message list visible.
  useEffect(() => {
    if (!conversationsLoaded || !hasConversations || !meEmail) return;
    const key = `chatAutoOpen:${meEmail}`;
    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem(key) !== today) {
      localStorage.setItem(key, today);
      useChatStore.setState({ isOpen: true, view: 'list', activeConversationId: null });
    }
  }, [conversationsLoaded, hasConversations, meEmail]);

  // Escape closes the panel
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') closeWidget(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, closeWidget]);

  // Tab-title unread badge: "(3) Client Tracking Portal"
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, '');
    document.title = unreadTotal > 0 ? `(${unreadTotal > 99 ? '99+' : unreadTotal}) ${base}` : base;
    return () => { document.title = base; };
  }, [unreadTotal]);

  // Ask for desktop-notification permission the first time the user opens the
  // widget — an intentional interaction, not a page-load nag.
  useEffect(() => {
    if (isOpen && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [isOpen]);

  if (!meEmail) return null;

  return (
    <>
      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <Motion.div
            key="chat-panel"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.2, ease: SECTION_EASE }}
            className="fixed bottom-24 right-6 z-[115] w-[380px] max-w-[calc(100vw-32px)] h-[min(600px,calc(100vh-130px))] bg-white rounded-2xl shadow-2xl ring-1 ring-black/5 border border-gray-100 flex flex-col overflow-hidden"
          >
            {/* Panel header (list + new views; the thread renders its own) */}
            {view !== 'chat' && (
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <h2 className="text-base font-bold text-gray-900">
                  {view === 'new' ? 'New message' : 'Messages'}
                </h2>
                <div className="flex items-center gap-1">
                  {view === 'list' && (
                    <button
                      type="button"
                      onClick={showNewMessage}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-orange-50 transition-colors"
                      title="New message"
                    >
                      <SquarePen className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeWidget}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                    aria-label="Close messages"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {view === 'chat' ? <ChatThread meEmail={meEmail} /> : <ConversationList meEmail={meEmail} />}
          </Motion.div>
        )}
      </AnimatePresence>

      {/* Launcher */}
      <Motion.button
        type="button"
        onClick={toggleWidget}
        whileTap={{ scale: 0.92 }}
        className="fixed bottom-6 right-6 z-[115] w-14 h-14 rounded-full bg-primary text-white shadow-lg shadow-orange-500/30 flex items-center justify-center hover:bg-primary-hover transition-colors"
        aria-label={isOpen ? 'Close messages' : 'Open messages'}
      >
        <AnimatePresence mode="wait" initial={false}>
          <Motion.span
            key={isOpen ? 'close' : 'open'}
            initial={{ opacity: 0, rotate: -30, scale: 0.7 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 30, scale: 0.7 }}
            transition={{ duration: 0.15, ease: SECTION_EASE }}
            className="flex items-center justify-center"
          >
            {isOpen ? <ChevronDown className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
          </Motion.span>
        </AnimatePresence>
        {unreadTotal > 0 && !isOpen && (
          <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center ring-2 ring-white">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </Motion.button>
    </>
  );
}
