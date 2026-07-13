import { API_BASE } from '../components/ClientOnboarding/constants';
import { useChatStore } from '../store/chatStore';

// One SSE connection per tab. Reconnects with exponential backoff; EventSource
// cannot send an Authorization header, so the JWT rides the query string.
let source = null;
let retryTimer = null;
let retryDelay = 1000;
let stopped = true;

const myEmail = () => {
  try {
    return (JSON.parse(localStorage.getItem('user') || '{}').email || '').toLowerCase();
  } catch {
    return '';
  }
};

// Desktop notification for messages arriving while the tab is hidden or the
// widget is closed. Click focuses the tab and jumps into that conversation.
function maybeNotify(payload) {
  const { message } = payload || {};
  if (!message || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const fromOther = (message.senderEmail || '').toLowerCase() !== myEmail();
  const state = useChatStore.getState();
  const viewingThread =
    state.isOpen && state.view === 'chat' &&
    state.activeConversationId === String(message.conversationId) &&
    !document.hidden;
  if (!fromOther || viewingThread) return;
  if (!document.hidden && state.isOpen) return; // widget visible — badge is enough

  try {
    const body = message.text || ((message.attachments || []).length ? '📎 Attachment' : 'Sent a ticket');
    const n = new Notification(message.senderName || 'New message', {
      body: body.slice(0, 140),
      tag: `chat-${message.conversationId}`, // collapse repeats per conversation
      icon: '/favicon.ico'
    });
    n.onclick = () => {
      window.focus();
      useChatStore.setState({ isOpen: true, view: 'chat', activeConversationId: String(message.conversationId) });
      const s = useChatStore.getState();
      s.loadMessages(String(message.conversationId));
      s.markRead(String(message.conversationId));
      n.close();
    };
  } catch { /* Notification constructor can throw on some platforms */ }
}

function connect() {
  const token = localStorage.getItem('authToken') || '';
  if (!token || stopped) return;

  source = new EventSource(`${API_BASE}/api/chat/stream?token=${encodeURIComponent(token)}`);

  source.addEventListener('connected', () => {
    retryDelay = 1000;
    const s = useChatStore.getState();
    s.setConnected(true);
    // Catch up on anything sent while we were disconnected.
    s.loadConversations();
    s.loadPresence();
  });

  source.addEventListener('message', (e) => {
    try {
      const payload = JSON.parse(e.data);
      useChatStore.getState().receiveMessage(payload);
      maybeNotify(payload);
    } catch { /* malformed event — ignore */ }
  });

  source.addEventListener('read', (e) => {
    try {
      useChatStore.getState().receiveRead(JSON.parse(e.data));
    } catch { /* malformed event — ignore */ }
  });

  source.addEventListener('presence', (e) => {
    try {
      useChatStore.getState().receivePresence(JSON.parse(e.data));
    } catch { /* malformed event — ignore */ }
  });

  source.addEventListener('typing', (e) => {
    try {
      useChatStore.getState().receiveTyping(JSON.parse(e.data));
    } catch { /* malformed event — ignore */ }
  });

  // Onboarding-board notifications (tags, approvals) pushed instantly — pages
  // that care (ClientOnboarding) listen for this window event and refetch.
  source.addEventListener('notify', (e) => {
    try {
      window.dispatchEvent(new CustomEvent('ff-onboarding-notify', { detail: JSON.parse(e.data) }));
    } catch { /* malformed event — ignore */ }
  });

  source.onerror = () => {
    useChatStore.getState().setConnected(false);
    source?.close();
    source = null;
    if (stopped) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30_000);
  };
}

export function startChatStream() {
  if (!stopped) return; // already running
  stopped = false;
  retryDelay = 1000;
  connect();
}

export function stopChatStream() {
  stopped = true;
  clearTimeout(retryTimer);
  source?.close();
  source = null;
  useChatStore.getState().setConnected(false);
}
