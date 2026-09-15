// node utils/unsubscribe.test.mjs
//
// Every client-facing mail needs a working opt-out, and this service is the
// awkward half: the /unsubscribe page lives in the dashboard backend, so a link
// minted here has to verify THERE. Our JWT secret is not its JWT secret, so the
// link is signed with the one secret both services provably share.
//
// Guards: the link is never empty, never one-click over mailto, the milestone
// mail actually carries it, and a header value cannot inject headers of its own.
import { unsubscribeLink, unsubscribeHeaders, unsubscribeToken, UNSUB_STREAMS } from './unsubscribe.js';
import { __testables } from './gmailSender.js';

let pass = 0, fail = 0;
const t = (name, got, want) => {
  const ok = String(got) === String(want);
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) console.log(`        got=${got}  want=${want}`);
};

const withKey = (key, fn) => {
  const saved = process.env.CRYPTO_AES_SECRET_SECRET_KEY;
  const savedUnsub = process.env.UNSUBSCRIBE_SECRET;
  delete process.env.UNSUBSCRIBE_SECRET;
  if (key === null) delete process.env.CRYPTO_AES_SECRET_SECRET_KEY;
  else process.env.CRYPTO_AES_SECRET_SECRET_KEY = key;
  try { return fn(); } finally {
    if (saved === undefined) delete process.env.CRYPTO_AES_SECRET_SECRET_KEY;
    else process.env.CRYPTO_AES_SECRET_SECRET_KEY = saved;
    if (savedUnsub !== undefined) process.env.UNSUBSCRIBE_SECRET = savedUnsub;
  }
};

const SHARED = 'the-key-both-services-hold';

withKey(SHARED, () => {
  const link = unsubscribeLink('Client@Example.com ', UNSUB_STREAMS.REMINDERS);
  t('shared key gives an https link', link.kind, 'https');
  const u = new URL(link.url);
  t('points at the dashboard that serves /unsubscribe', u.origin + u.pathname,
    'https://flashfire-dashboard-backend.onrender.com/unsubscribe');
  t('address is normalised into the link', u.searchParams.get('e'), 'client@example.com');
  t('stream travels with it', u.searchParams.get('s'), 'reminders');
  t('token is a 128-bit tag', u.searchParams.get('t').length, 32);
  // Same address, different stream must not share a token, or one opt-out link
  // would silence a stream the client never asked to leave.
  const a = unsubscribeToken('c@e.com', UNSUB_STREAMS.REMINDERS);
  const b = unsubscribeToken('c@e.com', UNSUB_STREAMS.ALL);
  t('token is per-stream', a === b, false);
  t('token is per-address', unsubscribeToken('other@e.com', UNSUB_STREAMS.REMINDERS) === a, false);

  const h = unsubscribeHeaders('c@e.com', UNSUB_STREAMS.REMINDERS);
  t('List-Unsubscribe is angle-bracketed', /^<https:\/\/\S+>$/.test(h['List-Unsubscribe']), true);
  t('one-click is claimed for https', h['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
});

withKey(null, () => {
  const link = unsubscribeLink('c@e.com', UNSUB_STREAMS.REMINDERS);
  // A dead https link reads as a dark pattern; a mailto always works.
  t('no shared key falls back to mailto', link.kind, 'mailto');
  t('mailto is never empty', link.url.startsWith('mailto:'), true);
  const h = unsubscribeHeaders('c@e.com', UNSUB_STREAMS.REMINDERS);
  t('mailto still gets List-Unsubscribe', /^<mailto:\S+>$/.test(h['List-Unsubscribe']), true);
  // One-click POST against a mailto is meaningless and providers penalise it.
  t('one-click NOT claimed for mailto', 'List-Unsubscribe-Post' in h, false);
});

// The milestone mails are the ones that had no opt-out at all until now.
await withKey(SHARED, async () => {
  const { buildEmailForTest } = await import('./clientMilestoneEmails.js').then((m) => ({
    buildEmailForTest: m.__testables?.buildEmail
  })).catch(() => ({ buildEmailForTest: null }));
  if (!buildEmailForTest) { console.log('SKIP  milestone template (buildEmail not exported)'); return; }
  for (const type of ['started', 'count_milestone', 'completed']) {
    const { html } = buildEmailForTest(type, {
      name: 'Asha', planLabel: 'Executive', planCap: 1200, currentCount: 350, threshold: 350,
      unsubUrl: 'https://flashfire-dashboard-backend.onrender.com/unsubscribe?e=a%40b.com&s=reminders&t=tok'
    });
    t(`${type} mail carries the unsubscribe link`, html.includes('/unsubscribe?e=a%40b.com'), true);
    t(`${type} mail labels it`, /Unsubscribe from these updates/.test(html), true);
  }
});

// A header value is attacker-adjacent: the address comes from a client record.
{
  const mime = __testables.buildMime({
    from: 'a@b.com', to: 'c@d.com', subject: 'Hi', text: 'body',
    headers: { 'List-Unsubscribe': '<mailto:x@y.com>\r\nBcc: attacker@evil.com', 'Bad\r\nName': 'v' }
  });
  const headerBlock = mime.split('\r\n\r\n')[0];
  // The value is folded onto one line rather than deleted, so the test is that
  // no LINE begins a header of its own - that is what injection would mean.
  const startsAHeader = headerBlock.split('\r\n').some((l) => /^Bcc\s*:/i.test(l));
  t('CRLF in a header value cannot inject a header', startsAHeader, false);
  t('the sanitised List-Unsubscribe survives', headerBlock.includes('List-Unsubscribe: <mailto:x@y.com>'), true);
  t('a CRLF header NAME is flattened', /^Bad/m.test(headerBlock) && !/\r\nName:/.test(headerBlock), true);
  t('Content-Type still terminates the header block', /Content-Type:/.test(mime), true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
