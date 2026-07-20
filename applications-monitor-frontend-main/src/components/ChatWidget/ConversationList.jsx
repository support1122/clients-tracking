import React, { useEffect, useState, useMemo } from 'react';
import { Loader2, MessageSquare, Search, SquarePen } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { timeAgo } from '../../utils/chatFormat';
import Avatar from './Avatar';

const ConversationRow = React.memo(function ConversationRow({ convo, meEmail, online, onOpen }) {
  const unread = convo.unreadCount > 0;
  const youSent = (convo.lastMessageSender || '').toLowerCase() === meEmail;
  return (
    <button
      type="button"
      onClick={() => onOpen(convo._id)}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[#f6f5f4] transition-colors"
    >
      <Avatar name={convo.otherName} email={convo.otherEmail} online={online} />
      <span className="flex-1 min-w-0">
        <span className="flex items-center justify-between gap-2">
          <span className={`text-sm truncate ${unread ? 'font-bold text-gray-900' : 'font-semibold text-gray-800'}`}>
            {convo.otherName}
          </span>
          <span className="text-[11px] text-gray-400 flex-shrink-0">{timeAgo(convo.lastMessageAt)}</span>
        </span>
        <span className="flex items-center justify-between gap-2 mt-0.5">
          <span className={`text-xs truncate ${unread ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
            {youSent ? 'You: ' : ''}{convo.lastMessageText || 'No messages yet'}
          </span>
          {unread && (
            <span className="flex-shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {convo.unreadCount > 99 ? '99+' : convo.unreadCount}
            </span>
          )}
        </span>
      </span>
    </button>
  );
});

/** List view + "new message" user picker. */
export default function ConversationList({ meEmail }) {
  const conversations = useChatStore((s) => s.conversations);
  const conversationsLoaded = useChatStore((s) => s.conversationsLoaded);
  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const view = useChatStore((s) => s.view);
  const users = useChatStore((s) => s.users);
  const usersLoaded = useChatStore((s) => s.usersLoaded);
  const loadUsers = useChatStore((s) => s.loadUsers);
  const openConversation = useChatStore((s) => s.openConversation);
  const showNewMessage = useChatStore((s) => s.showNewMessage);
  const backToList = useChatStore((s) => s.backToList);
  const startDm = useChatStore((s) => s.startDm);
  const [search, setSearch] = useState('');
  const [starting, setStarting] = useState(null);

  const picking = view === 'new';

  useEffect(() => {
    if (picking) loadUsers();
  }, [picking, loadUsers]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
    );
  }, [users, search]);

  const handleStartDm = async (email) => {
    setStarting(email);
    try {
      await startDm(email);
      setSearch('');
    } catch { /* toast-free: picker stays open */ }
    finally { setStarting(null); }
  };

  if (picking) {
    return (
      <div className="flex-1 flex flex-col min-h-0">
        <div className="px-4 py-2 border-b border-[#efedeb]">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              autoFocus
              placeholder="Search teammates..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-[#e6e4e1] rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!usersLoaded ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-10">No teammates found</p>
          ) : (
            filteredUsers.map((u) => (
              <button
                key={u.email}
                type="button"
                onClick={() => handleStartDm(u.email)}
                disabled={!!starting}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#f6f5f4] transition-colors disabled:opacity-60"
              >
                <Avatar name={u.name} email={u.email} size="sm" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-gray-900 truncate">{u.name}</span>
                  <span className="block text-xs text-gray-500 truncate">{u.email}</span>
                </span>
                {starting === u.email && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
              </button>
            ))
          )}
        </div>
        <div className="p-3 border-t border-[#efedeb]">
          <button
            type="button"
            onClick={backToList}
            className="w-full py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        {!conversationsLoaded ? (
          <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : conversations.length === 0 ? (
          <div className="py-12 text-center px-6">
            <div className="mx-auto w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mb-3">
              <MessageSquare className="w-6 h-6 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500 font-medium">No messages yet</p>
            <p className="text-xs text-gray-400 mt-1">Start a conversation with a teammate.</p>
          </div>
        ) : (
          conversations.map((c) => (
            <ConversationRow
              key={c._id}
              convo={c}
              meEmail={meEmail}
              online={!!onlineUsers[c.otherEmail]}
              onOpen={openConversation}
            />
          ))
        )}
      </div>
      <div className="p-3 border-t border-[#efedeb]">
        <button
          type="button"
          onClick={showNewMessage}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-white text-sm font-semibold rounded-full hover:bg-primary-hover transition-colors"
        >
          <SquarePen className="w-4 h-4" /> Send a message
        </button>
      </div>
    </div>
  );
}
