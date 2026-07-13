import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { ChatConversationModel, ChatMessageModel } from '../ChatModels.js';
import { UserModel } from '../UserModel.js';

// Client-supplied ticket refs must never be able to 500 the endpoint with a
// CastError — drop anything malformed instead.
function sanitizeTicket(ticket) {
  if (!ticket || !mongoose.isValidObjectId(ticket.jobId)) return null;
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    jobId: ticket.jobId,
    jobNumber: num(ticket.jobNumber),
    clientName: String(ticket.clientName || '').slice(0, 200),
    clientNumber: num(ticket.clientNumber)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SSE broker — one Set of open responses per user email. A user can have
// several tabs open; every tab gets every event.
// ─────────────────────────────────────────────────────────────────────────────
const sseClients = new Map(); // email -> Set<res>

function broadcastAll(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const set of sseClients.values()) {
    for (const res of set) {
      try { res.write(payload); } catch { /* dead socket — cleaned up on close */ }
    }
  }
}

function addSseClient(email, res) {
  const key = email.toLowerCase();
  const firstConnection = !sseClients.has(key) || sseClients.get(key).size === 0;
  if (!sseClients.has(key)) sseClients.set(key, new Set());
  sseClients.get(key).add(res);
  // Presence: announce only on the user's FIRST connection (extra tabs are silent)
  if (firstConnection) broadcastAll('presence', { email: key, online: true });
}

function removeSseClient(email, res) {
  const key = email.toLowerCase();
  const set = sseClients.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) {
    sseClients.delete(key);
    broadcastAll('presence', { email: key, online: false });
  }
}

export function emitToUsers(emails, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const email of emails) {
    const set = sseClients.get((email || '').toLowerCase());
    if (!set) continue;
    for (const res of set) {
      try { res.write(payload); } catch { /* dead socket — cleaned up on close */ }
    }
  }
}

// GET /api/chat/presence — who is connected right now
export const getPresence = (req, res) => {
  res.json({ online: [...sseClients.keys()] });
};

// Keep proxies (Render, nginx) from closing idle SSE connections.
setInterval(() => {
  for (const set of sseClients.values()) {
    for (const res of set) {
      try { res.write(': ping\n\n'); } catch { /* ignore */ }
    }
  }
}, 25_000).unref();

// GET /api/chat/stream?token=<jwt>
// EventSource cannot set an Authorization header, so the JWT rides the query.
export const chatStream = (req, res) => {
  const token = String(req.query.token || '');
  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
  const email = (user.email || '').toLowerCase();
  if (!email) return res.status(401).json({ error: 'Invalid token' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    // no-transform keeps the compression middleware from buffering the stream
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ email })}\n\n`);

  addSseClient(email, res);
  req.on('close', () => removeSseClient(email, res));
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
const dmParticipants = (a, b) => [a.toLowerCase().trim(), b.toLowerCase().trim()].sort();

async function findOrCreateDm(emailA, nameA, emailB, nameB) {
  const participants = dmParticipants(emailA, emailB);
  const key = participants.join('|');
  const names = {
    [emailA.toLowerCase().trim()]: nameA || emailA,
    [emailB.toLowerCase().trim()]: nameB || emailB
  };
  return ChatConversationModel.findOneAndUpdate(
    { key },
    {
      $setOnInsert: { key, participants, createdAt: new Date() },
      $set: {
        [`participantNames.${participants[0]}`]: names[participants[0]],
        [`participantNames.${participants[1]}`]: names[participants[1]]
      }
    },
    { new: true, upsert: true }
  );
}

function serializeConversation(convo, meEmail, unreadCount = 0) {
  const me = meEmail.toLowerCase();
  const otherEmail = (convo.participants || []).find((p) => p !== me) || me;
  const names = convo.participantNames instanceof Map
    ? Object.fromEntries(convo.participantNames)
    : (convo.participantNames || {});
  return {
    _id: convo._id,
    otherEmail,
    otherName: names[otherEmail] || otherEmail,
    lastMessageAt: convo.lastMessageAt,
    lastMessageText: convo.lastMessageText,
    lastMessageSender: convo.lastMessageSender,
    unreadCount
  };
}

async function createMessageAndNotify({ conversation, senderEmail, senderName, text, ticket, attachments, replyTo, source = 'user' }) {
  const sender = senderEmail.toLowerCase().trim();
  const cleanAttachments = (Array.isArray(attachments) ? attachments : [])
    .filter((a) => a && typeof a.url === 'string' && a.url)
    .slice(0, 5)
    .map((a) => ({
      url: a.url,
      filename: (a.filename || '').slice(0, 200),
      contentType: (a.contentType || '').slice(0, 100)
    }));
  const message = await ChatMessageModel.create({
    conversationId: conversation._id,
    senderEmail: sender,
    senderName: senderName || sender,
    text: (text || '').slice(0, 4000),
    ticket: ticket && ticket.jobId ? {
      jobId: ticket.jobId,
      jobNumber: ticket.jobNumber ?? null,
      clientName: ticket.clientName || '',
      clientNumber: ticket.clientNumber ?? null
    } : { jobId: null, jobNumber: null, clientName: '', clientNumber: null },
    attachments: cleanAttachments,
    replyTo: replyTo || { messageId: null, senderEmail: '', senderName: '', text: '', hasAttachment: false },
    source,
    readBy: [sender]
  });

  conversation.lastMessageAt = message.createdAt;
  conversation.lastMessageText =
    message.text ||
    (cleanAttachments.length ? '📎 Attachment' : ticket?.jobId ? 'Shared a ticket' : '');
  conversation.lastMessageSender = sender;
  const namePath = `participantNames.${sender}`;
  await ChatConversationModel.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessageAt: conversation.lastMessageAt,
        lastMessageText: conversation.lastMessageText,
        lastMessageSender: sender,
        [namePath]: senderName || sender
      }
    }
  );

  const msgObj = message.toObject();
  for (const participant of conversation.participants) {
    emitToUsers([participant], 'message', {
      message: msgObj,
      conversation: serializeConversation(conversation, participant, 0)
    });
  }
  return msgObj;
}

/**
 * Internal API for other controllers (ticket tag → chat DM).
 * Fire-and-forget safe: never throws.
 */
export async function sendChatMessageInternal({ fromEmail, fromName, toEmail, toName, text, ticket, source = 'tag' }) {
  try {
    if (!fromEmail || !toEmail) return;
    if (fromEmail.toLowerCase().trim() === toEmail.toLowerCase().trim()) return;
    const conversation = await findOrCreateDm(fromEmail, fromName, toEmail, toName);
    await createMessageAndNotify({
      conversation,
      senderEmail: fromEmail,
      senderName: fromName,
      text,
      ticket,
      source
    });
  } catch (e) {
    console.error('[chat] sendChatMessageInternal failed:', e?.message || e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REST handlers (all behind verifyToken)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/chat/users — everyone I can start a DM with
export const listChatUsers = async (req, res) => {
  try {
    const me = (req.user?.email || '').toLowerCase();
    const users = await UserModel.find({ isActive: true, email: { $ne: me } })
      .select('email name role')
      .sort({ name: 1 })
      .lean();
    res.json({ users: users.map((u) => ({ email: u.email, name: u.name || u.email, role: u.role })) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to load users' });
  }
};

// GET /api/chat/conversations
export const listConversations = async (req, res) => {
  try {
    const me = (req.user?.email || '').toLowerCase();
    const convos = await ChatConversationModel.find({ participants: me })
      .sort({ lastMessageAt: -1 })
      .limit(100)
      .lean();

    const ids = convos.map((c) => c._id);
    const unread = ids.length
      ? await ChatMessageModel.aggregate([
          { $match: { conversationId: { $in: ids }, senderEmail: { $ne: me }, readBy: { $ne: me } } },
          { $group: { _id: '$conversationId', count: { $sum: 1 } } }
        ])
      : [];
    const unreadMap = new Map(unread.map((u) => [String(u._id), u.count]));

    res.json({
      conversations: convos.map((c) =>
        serializeConversation(c, me, unreadMap.get(String(c._id)) || 0)
      )
    });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to load conversations' });
  }
};

// POST /api/chat/conversations { withEmail }
export const openConversation = async (req, res) => {
  try {
    const me = (req.user?.email || '').toLowerCase();
    const myName = req.user?.name || me;
    const withEmail = (req.body?.withEmail || '').toLowerCase().trim();
    if (!withEmail || withEmail === me) {
      return res.status(400).json({ error: 'withEmail required' });
    }
    const other = await UserModel.findOne({ email: withEmail }).select('email name').lean();
    const conversation = await findOrCreateDm(me, myName, withEmail, other?.name || withEmail);
    res.json({ conversation: serializeConversation(conversation, me, 0) });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to open conversation' });
  }
};

// GET /api/chat/conversations/:id/messages?before=<iso>&limit=50
export const getMessages = async (req, res) => {
  try {
    const me = (req.user?.email || '').toLowerCase();
    const convo = await ChatConversationModel.findById(req.params.id).lean();
    if (!convo || !convo.participants.includes(me)) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const query = { conversationId: convo._id };
    if (req.query.before) {
      const before = new Date(req.query.before);
      if (!Number.isNaN(before.getTime())) query.createdAt = { $lt: before };
    }
    const messages = await ChatMessageModel.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ messages: messages.reverse(), hasMore: messages.length === limit });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to load messages' });
  }
};

// POST /api/chat/conversations/:id/messages { text, ticket?, attachments?, replyTo? }
export const postMessage = async (req, res) => {
  try {
    const me = (req.user?.email || '').toLowerCase();
    const conversation = await ChatConversationModel.findById(req.params.id);
    if (!conversation || !conversation.participants.includes(me)) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    const text = (req.body?.text || '').trim();
    const ticket = sanitizeTicket(req.body?.ticket);
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    if (!text && !ticket?.jobId && attachments.length === 0) {
      return res.status(400).json({ error: 'Message text required' });
    }

    // Reply quote: snapshot server-side from the referenced message so a
    // client can never forge quoted content.
    let replyTo = null;
    const replyToId = req.body?.replyTo?.messageId;
    if (replyToId && mongoose.isValidObjectId(replyToId)) {
      const original = await ChatMessageModel.findOne({
        _id: replyToId,
        conversationId: conversation._id
      }).lean();
      if (original) {
        replyTo = {
          messageId: original._id,
          senderEmail: original.senderEmail,
          senderName: original.senderName,
          text: (original.text || '').slice(0, 200),
          hasAttachment: (original.attachments || []).length > 0
        };
      }
    }

    const message = await createMessageAndNotify({
      conversation,
      senderEmail: me,
      senderName: req.user?.name || me,
      text,
      ticket,
      attachments,
      replyTo
    });
    res.json({ message });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to send message' });
  }
};

// POST /api/chat/conversations/:id/typing — throttled client-side; fan out to
// the other participant only (my own tabs don't need my typing state).
export const typingPing = async (req, res) => {
  try {
    const me = (req.user?.email || '').toLowerCase();
    const convo = await ChatConversationModel.findById(req.params.id).select('participants').lean();
    if (!convo || !convo.participants.includes(me)) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    const others = convo.participants.filter((p) => p !== me);
    emitToUsers(others, 'typing', {
      conversationId: String(convo._id),
      email: me,
      name: req.user?.name || me
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed' });
  }
};

// POST /api/chat/conversations/:id/read
export const markConversationRead = async (req, res) => {
  try {
    const me = (req.user?.email || '').toLowerCase();
    const convo = await ChatConversationModel.findById(req.params.id).lean();
    if (!convo || !convo.participants.includes(me)) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    await ChatMessageModel.updateMany(
      { conversationId: convo._id, senderEmail: { $ne: me }, readBy: { $ne: me } },
      { $addToSet: { readBy: me } }
    );
    // Tell the other participant (read receipts) and my other tabs (badge sync)
    emitToUsers(convo.participants, 'read', { conversationId: String(convo._id), reader: me });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to mark read' });
  }
};
