import { create } from 'zustand';
import { API_BASE, AUTH_HEADERS } from '../components/ClientOnboarding/constants';

const me = () => {
  try {
    return (JSON.parse(localStorage.getItem('user') || '{}').email || '').toLowerCase();
  } catch {
    return '';
  }
};

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...AUTH_HEADERS(), ...(options.headers || {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

// Auto-expire "X is typing…" if no fresh ping arrives.
const typingTimers = new Map(); // conversationId -> timeout

export const useChatStore = create((set, get) => ({
  // ── widget UI ──
  isOpen: false,
  view: 'list', // 'list' | 'chat' | 'new'
  activeConversationId: null,
  connected: false,
  // Ticket picked up from a "Discuss in chat" button — attached to the next
  // message sent from any thread, then cleared.
  pendingTicketShare: null,
  // { [email]: true } — who has an open SSE connection right now
  onlineUsers: {},
  // { [conversationId]: { name } } — cleared 3s after the last ping
  typing: {},

  // ── data ──
  conversations: [],
  conversationsLoaded: false,
  users: [],
  usersLoaded: false,
  // { [conversationId]: { items: [], hasMore: bool, loaded: bool } }
  messages: {},
  sending: false,

  setConnected: (connected) => set({ connected }),

  openWidget: () => set({ isOpen: true }),
  // Closing the widget abandons a pending ticket share — otherwise a forgotten
  // share would silently ride along on an unrelated message sent much later.
  closeWidget: () => set({ isOpen: false, pendingTicketShare: null }),
  toggleWidget: () =>
    set((s) => (s.isOpen ? { isOpen: false, pendingTicketShare: null } : { isOpen: true })),
  backToList: () => set({ view: 'list', activeConversationId: null }),
  showNewMessage: () => set({ view: 'new' }),

  // ── "Discuss in chat" from a ticket ──
  shareTicket: (ticket) =>
    set({ pendingTicketShare: ticket, isOpen: true, view: 'list', activeConversationId: null }),
  clearTicketShare: () => set({ pendingTicketShare: null }),

  // ── presence ──
  loadPresence: async () => {
    try {
      const data = await api('/api/chat/presence');
      const onlineUsers = {};
      (data.online || []).forEach((e) => { onlineUsers[e] = true; });
      set({ onlineUsers });
    } catch { /* presence is best-effort */ }
  },
  receivePresence: ({ email, online }) =>
    set((s) => {
      const onlineUsers = { ...s.onlineUsers };
      if (online) onlineUsers[email] = true;
      else delete onlineUsers[email];
      return { onlineUsers };
    }),

  // ── typing indicator ──
  sendTyping: (conversationId) => {
    api(`/api/chat/conversations/${conversationId}/typing`, { method: 'POST' }).catch(() => {});
  },
  receiveTyping: ({ conversationId, name }) => {
    set((s) => ({ typing: { ...s.typing, [conversationId]: { name } } }));
    clearTimeout(typingTimers.get(conversationId));
    typingTimers.set(
      conversationId,
      setTimeout(() => {
        set((s) => {
          if (!s.typing[conversationId]) return {};
          const typing = { ...s.typing };
          delete typing[conversationId];
          return { typing };
        });
      }, 3000)
    );
  },

  loadConversations: async () => {
    try {
      const data = await api('/api/chat/conversations');
      set({ conversations: data.conversations || [], conversationsLoaded: true });
    } catch {
      set({ conversationsLoaded: true });
    }
  },

  loadUsers: async () => {
    if (get().usersLoaded) return;
    try {
      const data = await api('/api/chat/users');
      set({ users: data.users || [], usersLoaded: true });
    } catch {
      set({ usersLoaded: true });
    }
  },

  loadMessages: async (conversationId) => {
    if (get().messages[conversationId]?.loaded) return;
    try {
      const data = await api(`/api/chat/conversations/${conversationId}/messages`);
      set((s) => {
        // Merge messages that arrived over SSE while this fetch was in flight —
        // the fetch snapshot may predate them.
        const fetched = data.messages || [];
        const seen = new Set(fetched.map((m) => m._id));
        const buffered = (s.messages[conversationId]?.items || []).filter((m) => !seen.has(m._id));
        return {
          messages: {
            ...s.messages,
            [conversationId]: { items: [...fetched, ...buffered], hasMore: !!data.hasMore, loaded: true }
          }
        };
      });
    } catch {
      set((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: { items: s.messages[conversationId]?.items || [], hasMore: false, loaded: true }
        }
      }));
    }
  },

  loadOlderMessages: async (conversationId) => {
    const entry = get().messages[conversationId];
    if (!entry?.hasMore || !entry.items.length) return;
    const before = entry.items[0].createdAt;
    try {
      const data = await api(
        `/api/chat/conversations/${conversationId}/messages?before=${encodeURIComponent(before)}`
      );
      set((s) => {
        const current = s.messages[conversationId] || { items: [], hasMore: false, loaded: true };
        const seen = new Set(current.items.map((m) => m._id));
        const older = (data.messages || []).filter((m) => !seen.has(m._id));
        return {
          messages: {
            ...s.messages,
            [conversationId]: { ...current, items: [...older, ...current.items], hasMore: !!data.hasMore }
          }
        };
      });
    } catch { /* keep what we have */ }
  },

  openConversation: (conversationId) => {
    set({ view: 'chat', activeConversationId: conversationId });
    get().loadMessages(conversationId);
    get().markRead(conversationId);
  },

  // Find-or-create a DM with a user, then open it.
  startDm: async (withEmail) => {
    const data = await api('/api/chat/conversations', { method: 'POST', body: { withEmail } });
    const convo = data.conversation;
    set((s) => {
      const exists = s.conversations.some((c) => c._id === convo._id);
      return {
        conversations: exists ? s.conversations : [convo, ...s.conversations],
        view: 'chat',
        activeConversationId: convo._id
      };
    });
    get().loadMessages(convo._id);
    return convo._id;
  },

  sendMessage: async (conversationId, { text, attachments = [], replyTo = null, ticket = null } = {}) => {
    const trimmed = (text || '').trim();
    if (!trimmed && attachments.length === 0 && !ticket?.jobId) return;
    set({ sending: true });
    try {
      // The SSE 'message' event echoes it back and inserts it (deduped by _id),
      // but append optimistically-ish from the response for zero-SSE fallback.
      const data = await api(`/api/chat/conversations/${conversationId}/messages`, {
        method: 'POST',
        body: {
          text: trimmed,
          attachments,
          replyTo: replyTo?._id ? { messageId: replyTo._id } : null,
          ticket
        }
      });
      get().receiveMessage({ message: data.message, conversation: null });
      if (ticket && get().pendingTicketShare) set({ pendingTicketShare: null });
    } finally {
      set({ sending: false });
    }
  },

  markRead: (conversationId) => {
    const convo = get().conversations.find((c) => c._id === conversationId);
    if (convo && convo.unreadCount > 0) {
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c._id === conversationId ? { ...c, unreadCount: 0 } : c
        )
      }));
    }
    api(`/api/chat/conversations/${conversationId}/read`, { method: 'POST' }).catch(() => {});
  },

  // ── SSE handlers ──
  receiveMessage: ({ message, conversation }) => {
    if (!message?._id) return;
    const convoId = String(message.conversationId);
    const myEmail = me();
    const fromOther = (message.senderEmail || '').toLowerCase() !== myEmail;
    const s = get();
    const activelyViewing = s.isOpen && s.view === 'chat' && s.activeConversationId === convoId;

    set((state) => {
      // 1. append into the thread (dedupe by _id). Unloaded threads buffer the
      //    message too, so a fetch racing this event can merge instead of drop.
      let messages = state.messages;
      const entry = state.messages[convoId] || { items: [], hasMore: false, loaded: false };
      if (!entry.items.some((m) => m._id === message._id)) {
        messages = {
          ...state.messages,
          [convoId]: { ...entry, items: [...entry.items, message] }
        };
      }

      // 2. move the conversation to the top with updated snippet + unread
      const existing = state.conversations.find((c) => c._id === convoId);
      let convo = existing || conversation;
      if (convo) {
        convo = {
          ...convo,
          lastMessageAt: message.createdAt,
          lastMessageText:
            message.text ||
            ((message.attachments || []).length ? '📎 Attachment' : message.ticket?.jobId ? 'Shared a ticket' : ''),
          lastMessageSender: message.senderEmail,
          unreadCount:
            fromOther && !activelyViewing
              ? (existing?.unreadCount || 0) + 1
              : 0
        };
      }
      const conversations = convo
        ? [convo, ...state.conversations.filter((c) => c._id !== convoId)]
        : state.conversations;

      return { messages, conversations };
    });

    // brand-new conversation we've never seen and SSE didn't include it → refetch list
    if (!s.conversations.some((c) => c._id === convoId) && !conversation) {
      s.loadConversations();
    }
    if (fromOther && activelyViewing) s.markRead(convoId);
  },

  receiveRead: ({ conversationId, reader }) => {
    const readerLower = (reader || '').toLowerCase();
    if (readerLower === me()) {
      // Another of my tabs read it → clear the badge here too.
      set((s) => ({
        conversations: s.conversations.map((c) =>
          c._id === conversationId ? { ...c, unreadCount: 0 } : c
        )
      }));
      return;
    }
    // The other participant read the thread → stamp my messages as seen.
    set((s) => {
      const entry = s.messages[conversationId];
      if (!entry?.loaded) return {};
      return {
        messages: {
          ...s.messages,
          [conversationId]: {
            ...entry,
            items: entry.items.map((m) =>
              (m.readBy || []).includes(readerLower) ? m : { ...m, readBy: [...(m.readBy || []), readerLower] }
            )
          }
        }
      };
    });
  },

  reset: () =>
    set({
      isOpen: false,
      view: 'list',
      activeConversationId: null,
      conversations: [],
      conversationsLoaded: false,
      users: [],
      usersLoaded: false,
      messages: {},
      connected: false,
      pendingTicketShare: null,
      onlineUsers: {},
      typing: {}
    })
}));

// ── selectors ──
export const useUnreadTotal = () =>
  useChatStore((s) => s.conversations.reduce((sum, c) => sum + (c.unreadCount || 0), 0));
