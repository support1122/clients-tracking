/**
 * The two signals the Delivery column paints, as filterable keys.
 *
 * Written once and used by BOTH the column's dropdown and the cell it filters,
 * because the cell's rules are not obvious: "hook working" covers the Yes badge
 * AND the Hook only badge (the webhook is fine either way, it is the payment
 * email that is missing), and a client can be missing the payment email
 * whatever their webhook says. A filter that re-derived that would eventually
 * disagree with the badge sitting next to it, and hide a row while showing the
 * very state you selected.
 *
 * The two signals answer different questions and losing either hides a real
 * failure:
 *   hook - can we SEND to this client (Mattermost webhook + payment email)
 *   mail - can we still READ their inbox, which is what produces the interview,
 *          assignment and offer alerts in the first place
 */

/**
 * @param {string} email
 * @param {{withWebhook: Set<string>, failing: Set<string>, noPaymentEmail: Set<string>}} mmConn
 * @param {{connected: Set<string>, reconnect: Set<string>}} mailConn
 * @returns {{hook: 'ok'|'failing'|'missing', mail: 'ok'|'reconnect'|'none', noPay: boolean}}
 */
export function rowDeliveryKeys(email, mmConn, mailConn) {
  const em = String(email || '').toLowerCase();
  const hasHook = mmConn.withWebhook.has(em);
  const isFailing = mmConn.failing.has(em);
  return {
    // 'ok'      webhook saved and its last delivery worked
    // 'failing' webhook saved but its last real delivery errored
    // 'missing' no webhook saved at all
    hook: hasHook ? (isFailing ? 'failing' : 'ok') : 'missing',
    // 'ok'        Google mail connected, we can read the inbox
    // 'reconnect' was connected, token expired
    // 'none'      never connected
    mail: mailConn.connected.has(em) ? 'ok' : mailConn.reconnect.has(em) ? 'reconnect' : 'none',
    noPay: mmConn.noPaymentEmail.has(em),
  };
}

/** The dropdown's option values, in the order they are offered. */
export const DELIVERY_FILTER_VALUES = [
  'mail_none', 'mail_reconnect', 'mail_ok',
  'hook_missing', 'hook_failing', 'hook_ok',
  'no_payment_email',
];

/** Does one row satisfy a Delivery dropdown selection? Empty filter matches all. */
export function matchesDeliveryFilter(row, filter, mmConn, mailConn) {
  if (!filter) return true;
  const k = rowDeliveryKeys(row?.email, mmConn, mailConn);
  switch (filter) {
    case 'mail_ok': return k.mail === 'ok';
    case 'mail_reconnect': return k.mail === 'reconnect';
    case 'mail_none': return k.mail === 'none';
    case 'hook_ok': return k.hook === 'ok';
    case 'hook_failing': return k.hook === 'failing';
    case 'hook_missing': return k.hook === 'missing';
    case 'no_payment_email': return k.noPay;
    // An unrecognised value must not silently empty the table.
    default: return true;
  }
}

/** Per-key totals for the dropdown labels. */
export function countDeliveryStates(rows, mmConn, mailConn) {
  const c = {
    mail_ok: 0, mail_reconnect: 0, mail_none: 0,
    hook_ok: 0, hook_failing: 0, hook_missing: 0,
    no_payment_email: 0,
  };
  for (const r of rows) {
    const k = rowDeliveryKeys(r.email, mmConn, mailConn);
    c[`mail_${k.mail}`] += 1;
    c[`hook_${k.hook}`] += 1;
    if (k.noPay) c.no_payment_email += 1;
  }
  return c;
}
