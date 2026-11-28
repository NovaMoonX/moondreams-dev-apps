import assert from 'node:assert/strict';

import type { EmailEventRead } from '../../src/apps/runway/hooks/useEmailPurchases.ts';
import { splitAddressForWrap } from '../../src/lib/emailForwarding/address.ts';
import {
  groupEmailSenders,
  readSender,
} from '../../src/apps/runway/utils/emailSenders.ts';
import { toAddress } from '../../functions/src/email/emailUtils.ts';
import {
  confirmProviderOf,
  followConfirmLink,
  isAcceptedConfirmUrl,
  isForwardingConfirmation,
} from '../../functions/src/email/forwardingConfirmation.ts';
import {
  companyFromAddress,
  excerptOf,
  htmlToText,
  isInstitutionHost,
  isKnownInstitution,
  isMerchantHost,
  isProtonInvitation,
  parseAlertEmail,
  readableBody,
  readProtonLink,
  subjectTemplate,
} from '../../functions/src/apps/runway/email/parseAlert.ts';
import {
  isHandForwarded,
  readForwardedDate,
  stripForwardPrefixes,
  unwrapForwarded,
} from '../../functions/src/email/unwrapForwarded.ts';

const RECEIVED = Date.UTC(2026, 10, 4, 18, 30);
const NOV_3 = Date.UTC(2026, 10, 3);
const NOV_4 = Date.UTC(2026, 10, 4);

interface Sample {
  name: string;
  from: string;
  subject: string;
  text: string;
  /** `null` with `isPurchase` false is plainly not a purchase; `null` alone is left to the AI. */
  expect: {
    amountCents: number;
    merchant: string;
    lastFour: string | null;
    date: number;
    institution: string;
  } | null;
  isPurchase?: boolean;
}

const samples: Sample[] = [
  {
    name: 'Chase transaction with',
    from: 'no.reply.alerts@chase.com',
    subject: 'You made a $24.50 transaction with CHIPOTLE 2041',
    text: 'Account ending in 1234\nMerchant: CHIPOTLE 2041\nAmount: $24.50\nDate: Nov 3, 2026',
    expect: {
      amountCents: 2450,
      merchant: 'CHIPOTLE 2041',
      lastFour: '1234',
      date: NOV_3,
      institution: 'Chase',
    },
  },
  {
    name: 'Chase your transaction with',
    from: 'no.reply.alerts@chase.com',
    subject: 'Your $1,203.99 transaction with DELTA AIR LINES',
    text: 'Chase Sapphire card ending in 8841 was charged $1,203.99 at DELTA AIR LINES on 11/03/2026.',
    expect: {
      amountCents: 120399,
      merchant: 'DELTA AIR LINES',
      lastFour: '8841',
      date: NOV_3,
      institution: 'Chase',
    },
  },
  {
    name: 'Capital One',
    from: 'capitalone@notification.capitalone.com',
    subject: 'A new transaction was charged to your account',
    text: 'A $34.12 transaction was charged to your Venture card ending in 4417 at SHELL OIL 5712 on November 3, 2026.',
    expect: {
      amountCents: 3412,
      merchant: 'SHELL OIL 5712',
      lastFour: '4417',
      date: NOV_3,
      institution: 'Capital One',
    },
  },
  {
    name: 'Amex large purchase',
    from: 'AmericanExpress@welcome.americanexpress.com',
    subject: 'Large Purchase Approved',
    text: 'Card Member: A charge of $1,234.00 was placed on your Card ending in 1007 at APPLE.COM/BILL.',
    expect: {
      amountCents: 123400,
      merchant: 'APPLE.COM/BILL',
      lastFour: '1007',
      date: NOV_4,
      institution: 'American Express',
    },
  },
  {
    name: 'Discover',
    from: 'discover@services.discover.com',
    subject: 'Discover Card: Transaction Alert',
    text: 'A transaction of $32.15 on your Discover Card ending in 9921 at WALMART SUPERCENTER on 11/03/2026 was approved.',
    expect: {
      amountCents: 3215,
      merchant: 'WALMART SUPERCENTER',
      lastFour: '9921',
      date: NOV_3,
      institution: 'Discover',
    },
  },
  {
    name: 'Bank of America where',
    from: 'onlinebanking@ealerts.bankofamerica.com',
    subject: 'Credit card transaction exceeds $0.00',
    text: 'Amount: $12.34\nWhere: STARBUCKS\nDate: November 3, 2026\nCard ending in 3320',
    expect: {
      amountCents: 1234,
      merchant: 'STARBUCKS',
      lastFour: '3320',
      date: NOV_3,
      institution: 'Bank of America',
    },
  },
  {
    name: 'Wells Fargo debit',
    from: 'alerts@notify.wellsfargo.com',
    subject: 'Debit card purchase of $15.00 at TARGET',
    text: 'A purchase of $15.00 at TARGET T-1234 was made with your debit card ending in 5566.',
    expect: {
      amountCents: 1500,
      merchant: 'TARGET',
      lastFour: '5566',
      date: NOV_4,
      institution: 'Wells Fargo',
    },
  },
  {
    name: 'Citi',
    from: 'alerts@info6.citi.com',
    subject: 'Citi Alert: A $55.00 transaction was made at SAFEWAY',
    text: 'Card ending in 7788. Merchant: SAFEWAY #1544. Date: 11/02/2026',
    expect: {
      amountCents: 5500,
      merchant: 'SAFEWAY #1544',
      lastFour: '7788',
      date: Date.UTC(2026, 10, 2),
      institution: 'Citi',
    },
  },
  {
    name: 'Apple Card',
    from: 'no_reply@apple.com',
    subject: 'Apple Card purchase',
    text: 'You spent $5.99 at APPLE.COM/BILL on Nov 4. Apple Card ...2250',
    expect: {
      amountCents: 599,
      merchant: 'APPLE.COM/BILL',
      lastFour: '2250',
      date: NOV_4,
      institution: 'Apple Card',
    },
  },
  {
    name: 'Credit union generic',
    from: 'alerts@firstcu.org',
    subject: 'Card alert',
    text: 'Your card ending in 4545 was charged $8.40 at BLUE BOTTLE COFFEE. Reply STOP to unsubscribe.',
    expect: {
      amountCents: 840,
      merchant: 'BLUE BOTTLE COFFEE',
      lastFour: '4545',
      date: NOV_4,
      institution: 'Firstcu',
    },
  },
  {
    name: 'Payment received is not a purchase',
    from: 'alerts@chase.com',
    subject: 'Payment received',
    text: 'We received your payment of $500.00. Thank you.',
    expect: null,
    isPurchase: false,
  },
  {
    name: 'Statement ready is not a purchase',
    from: 'alerts@bankofamerica.com',
    subject: 'Your statement is ready',
    text: 'Your statement balance is $1,200.00, due Nov 20.',
    expect: null,
    isPurchase: false,
  },
  {
    name: 'Declined charge in the body',
    from: 'alerts@chase.com',
    subject: 'Transaction alert',
    text: 'A charge of $50.00 at Target was declined on your card ending in 1234',
    expect: null,
    isPurchase: false,
  },
  {
    name: 'Refund posted in the body',
    from: 'alerts@chase.com',
    subject: 'Account alert',
    text: 'Your refund of $20.00 from Target was posted. Original purchase at Target on 11/10',
    expect: null,
    isPurchase: false,
  },
  {
    name: 'Payment received in the body',
    from: 'alerts@chase.com',
    subject: 'Account alert',
    text: 'We received your payment of $500.00. Thank you',
    expect: null,
    isPurchase: false,
  },
  {
    name: 'Pending authorization with a statement note',
    from: 'alerts@chase.com',
    subject: 'Card alert',
    text: 'Pending authorization of $30.00 at Shell. Your statement is ready.',
    expect: null,
    isPurchase: false,
  },
  {
    name: 'No amount is not a purchase',
    from: 'news@shop.example.com',
    subject: 'Our weekend sale',
    text: 'Everything is on sale this weekend.',
    expect: null,
    isPurchase: false,
  },
  {
    name: 'Unclear is left to the AI',
    from: 'notify@someplace.example.com',
    subject: 'Heads up',
    text: 'We noticed something on your account worth $20.00 and $35.00. Check the app.',
    expect: null,
  },
  {
    name: 'A store order with a split price and an unsubscribe footer is left to the AI',
    from: 'auto-confirm@amazon.com',
    subject: 'Ordered 1 item: Headphones',
    text: 'Stephon, you scored some great Black Friday Deals!\nOrdered\nShipped\nArriving Tuesday\n1 item: Headphones\nOrder # 114-7142702-6577047\nGrand Total:\n$\n142.01\nView or edit order\nBlack Friday Week is here! Shop the best deals of the year on electronics, home, toys and more, while they last.\nUnsubscribe from these emails or transfer your account settings.',
    expect: null,
  },
  {
    name: 'A number but no dollar sign is left to the AI',
    from: 'orders@shop.example.com',
    subject: 'Thanks for your order',
    text: 'Order 4471. Total 142.01 USD.',
    expect: null,
  },
  {
    name: 'HTML-only alert',
    from: 'no.reply.alerts@chase.com',
    subject: 'You made a $9.99 transaction with NETFLIX.COM',
    text: htmlToText(
      '<html><head><style>p{color:red}</style></head><body><p>Account ending in <b>0042</b></p><p>Merchant: NETFLIX.COM</p><p>Amount: $9.99</p></body></html>',
    ),
    expect: {
      amountCents: 999,
      merchant: 'NETFLIX.COM',
      lastFour: '0042',
      date: NOV_4,
      institution: 'Chase',
    },
  },
];

assert.equal(companyFromAddress('auto-confirm@amazon.com'), 'Amazon');
assert.equal(companyFromAddress('someone@gmail.com'), null);
assert.equal(companyFromAddress('orders@shop.xyz'), null);

samples.forEach((sample) => {
  const read = parseAlertEmail({ ...sample, receivedAt: RECEIVED });
  if (sample.expect === null) {
    if (sample.isPurchase === false) {
      assert.equal(read?.isPurchase, false, sample.name);
    } else assert.equal(read, null, sample.name);
    return;
  }
  assert.ok(read?.isPurchase, `${sample.name}: not read`);
  const { expect } = sample;
  assert.equal(read.amountCents, expect.amountCents, `${sample.name}: amount`);
  assert.equal(read.merchant, expect.merchant, `${sample.name}: merchant`);
  assert.equal(read.lastFour, expect.lastFour, `${sample.name}: last four`);
  assert.equal(read.date, expect.date, `${sample.name}: date`);
  assert.equal(read.institution, expect.institution, `${sample.name}: bank`);
});

assert.equal(
  subjectTemplate('You made a $24.50 transaction with CHIPOTLE 2041'),
  'you made a {amount} transaction with chipotle {n}',
);
assert.equal(
  subjectTemplate('Alert for Nov 3, 2026: card ...1234  charged'),
  'alert for {date}: card ...{n} charged',
);
assert.equal(
  subjectTemplate('Large Purchase Approved'),
  'large purchase approved',
);

// Fabricated: Proton's exact sender and subject are unconfirmed, so this only follows what proton.me/support/email-forwarding describes.
const protonInvite = {
  from: 'Proton <no-reply@account.proton.me>',
  subject: 'Accept email forwarding from jamie@example.com',
  text: [
    'jamie@example.com wants to forward emails to you.',
    'Accept forwarding: https://account.proton.me/u/0/forwarding/accept?token=abc123',
    'Learn more: https://proton.me/support/email-forwarding',
  ].join('\n'),
};
assert.ok(isProtonInvitation({ ...protonInvite, isDkimPassed: true }));
assert.ok(!isProtonInvitation({ ...protonInvite, isDkimPassed: false }));
assert.ok(
  !isProtonInvitation({
    ...protonInvite,
    from: 'no-reply@proton.me.evil.example',
    isDkimPassed: true,
  }),
);
assert.ok(
  !isProtonInvitation({
    ...protonInvite,
    subject: 'Welcome to Proton',
    isDkimPassed: true,
  }),
);
assert.ok(
  !isProtonInvitation({
    ...protonInvite,
    subject: 'Fwd: your Uber receipt',
    text: 'Your trip was $18.20. See https://proton.me/mail for more.',
    isDkimPassed: true,
  }),
);
assert.equal(readProtonLink('Read https://proton.me/pricing'), undefined);
assert.equal(
  readProtonLink(protonInvite.text),
  'https://account.proton.me/u/0/forwarding/accept?token=abc123',
);
assert.equal(
  readProtonLink('Help: https://proton.me/support/email-forwarding'),
  undefined,
);

// Fabricated bank HTML shaped like real alert mail: browser link, logo, nav, tracking URLs, legal footer.
const clutteredHtml = (
  alert: string,
) => `<html><head><style>a{color:#117aca}</style></head><body>
<p><a href="https://click.mail.example-bank.com/v?u=9f8e7d6c5b4a39281706f5e4d3c2b1a0&amp;t=view">View this email in your browser</a></p>
<img src="https://img.example-bank.com/logo.png" width="120">
<table><tr><td><a href="https://www.example-bank.com/accounts?cid=abc123def456&utm_source=email">Accounts</a></td>
<td><a href="https://www.example-bank.com/pay?cid=abc123def456&utm_source=email">Pay &amp; transfer</a></td></tr></table>
<p>${alert}</p>
<p>Questions? Visit example-bank.com/help</p>
<p>Example Bank, N.A. Member FDIC. Equal Housing Lender. You received this because you set up account alerts. Do not reply.</p>
<p><a href="https://click.mail.example-bank.com/unsub?t=0a1b2c3d4e5f60718293a4b5c6d7e8f9">Unsubscribe</a></p>
</body></html>`;
[
  {
    alert:
      'You made a $52.30 transaction with TRADER JOES 553.<br>Card ending in 4417',
    cents: 5230,
    amount: '$52.30',
    merchant: 'TRADER JOES 553',
  },
  {
    alert:
      '<b>Transaction alert</b><br>Merchant: SHELL OIL 5712<br>Amount: $1,203.99<br>Card ending in 8841',
    cents: 120399,
    amount: '$1,203.99',
    merchant: 'SHELL OIL 5712',
  },
].forEach(({ alert, cents, amount, merchant }) => {
  const text = `${htmlToText(clutteredHtml(alert))}\nhttps://www.example-bank.com/x?${'a=b&'.repeat(1500)}`;
  const body = readableBody(text);
  assert.ok(body.length <= 4000, 'body cap');
  assert.ok(!/https?:\/\//.test(body), 'body holds no raw URL');
  assert.ok(body.includes('www.example-bank.com'), 'body keeps hosts');
  const excerpt = excerptOf(body, { amountCents: cents, merchant });
  assert.ok(excerpt.includes(amount), `excerpt holds ${amount}`);
  assert.ok(!/https?:\/\//.test(excerpt), 'excerpt holds no raw URL');
  assert.ok(excerpt.split('\n').length <= 6, 'excerpt lines');
  assert.ok(excerpt.length <= 600, 'excerpt size');
  assert.ok(!/View this email|Unsubscribe/i.test(excerpt), 'no boilerplate');
});
assert.equal(
  readableBody('a\n\n\n  b  \nsee https://secure.chase.com/x?y'),
  'a\n\nb\nsee secure.chase.com',
);

// Hand-forwards of a Chase-style alert, each client's own block wording.
const ALERT_BODY =
  'Account ending in 1234\nMerchant: CHIPOTLE 2041\nAmount: $24.50\nDate: Nov 3, 2026';
const ALERT_SUBJECT = 'You made a $24.50 transaction with CHIPOTLE 2041';
const FORWARDER = 'Jamie Lee <jamie@gmail.com>';
const NOV_3_EVENING = Date.UTC(2026, 10, 3, 23, 5);
const forwards = [
  {
    name: 'Gmail',
    subject: `Fwd: ${ALERT_SUBJECT}`,
    text: `FYI\n\n---------- Forwarded message ---------\nFrom: Chase <no.reply.alerts@chase.com>\nDate: Tue, Nov 3, 2026 at 6:05 PM\nSubject: ${ALERT_SUBJECT}\nTo: <jamie@gmail.com>\n\n${ALERT_BODY}`,
  },
  {
    name: 'Apple Mail',
    subject: `Fwd: ${ALERT_SUBJECT}`,
    text: `Begin forwarded message:\n\nFrom: Chase <no.reply.alerts@chase.com>\nSubject: ${ALERT_SUBJECT}\nDate: November 3, 2026 at 6:05:41 PM EST\nTo: Jamie Lee <jamie@icloud.com>\n\n${ALERT_BODY}`,
  },
  {
    name: 'Outlook',
    subject: `FW: ${ALERT_SUBJECT}`,
    text: `\n________________________________\nFrom: Chase <no.reply.alerts@chase.com>\nSent: Tuesday, November 3, 2026 6:05 PM\nTo: Jamie Lee\nSubject: ${ALERT_SUBJECT}\n\n${ALERT_BODY}`,
  },
  {
    name: 'Outlook original message',
    subject: `FW: Fw: ${ALERT_SUBJECT}`,
    text: `-----Original Message-----\nFrom: Chase [mailto:no.reply.alerts@chase.com]\nSent: Tuesday, November 3, 2026 6:05 PM\nTo: Jamie Lee\nSubject: ${ALERT_SUBJECT}\n\n${ALERT_BODY}`,
  },
  {
    name: 'Yahoo',
    subject: `Fwd: ${ALERT_SUBJECT}`,
    text: `----- Forwarded Message -----\nFrom: Chase <no.reply.alerts@chase.com>\nTo: Jamie Lee <jamie@yahoo.com>\nSent: Tuesday, November 3, 2026, 6:05:12 PM EST\nSubject: ${ALERT_SUBJECT}\n\n${ALERT_BODY}`,
  },
];
forwards.forEach(({ name, subject, text }) => {
  const outer = {
    to: 'runway-abc@moondreamsmail.com',
    from: FORWARDER,
    subject,
    text,
    receivedAt: NOV_3_EVENING + 3_600_000,
    isDkimPassed: true,
  };
  assert.ok(!isForwardingConfirmation(outer), `${name}: not a confirmation`);
  assert.ok(isHandForwarded(outer), `${name}: hand-forwarded`);
  const mail = unwrapForwarded(outer);
  assert.equal(mail.from.includes('no.reply.alerts@chase.com'), true, name);
  assert.equal(mail.subject, ALERT_SUBJECT, `${name}: subject`);
  assert.equal(mail.text, ALERT_BODY, `${name}: body`);
  assert.ok(!mail.isDkimPassed, `${name}: unwrapped is never DKIM-verified`);
  assert.ok(
    mail.receivedAt >= NOV_3 && mail.receivedAt < NOV_4,
    `${name}: original date`,
  );
  const read = parseAlertEmail(mail);
  assert.ok(read?.isPurchase, `${name}: read`);
  assert.equal(read.institution, 'Chase', `${name}: institution`);
  assert.equal(read.amountCents, 2450, `${name}: amount`);
  assert.equal(read.merchant, 'CHIPOTLE 2041', `${name}: merchant`);
  assert.equal(read.date, NOV_3, `${name}: date`);
});

// A forward with no header block (an auto-forward) keeps the original sender and loses only the prefix.
const autoForward = {
  to: 'runway-abc@moondreamsmail.com',
  from: 'no.reply.alerts@chase.com',
  subject: `Fwd: ${ALERT_SUBJECT}`,
  text: ALERT_BODY,
  receivedAt: RECEIVED,
  isDkimPassed: true,
};
assert.deepEqual(unwrapForwarded(autoForward), {
  ...autoForward,
  subject: ALERT_SUBJECT,
});
// Only an email a provider's rule sent on as it was proves that forwarding is live.
assert.ok(isHandForwarded(autoForward), 'a Fwd: subject reads as by hand');
assert.ok(
  !isHandForwarded({ ...autoForward, subject: ALERT_SUBJECT }),
  'a rule-forwarded alert is not by hand',
);
[
  ['Fwd: Fwd: hello', 'hello'],
  ['FWD: Fw: FW: TR: WG: hello', 'hello'],
  ['[Fwd: Your receipt]', 'Your receipt'],
  ['Fwd: [Fwd: Your receipt]', 'Your receipt'],
  ['  fw:  Your receipt ', 'Your receipt'],
  ['Forward progress report', 'Forward progress report'],
  ['Your Fwd: receipt', 'Your Fwd: receipt'],
].forEach(([subject, expected]) =>
  assert.equal(stripForwardPrefixes(subject), expected, subject),
);

// A missing piece keeps the outer one.
const partial = unwrapForwarded({
  ...autoForward,
  from: FORWARDER,
  text: `---------- Forwarded message ---------\nSubject: Fwd: ${ALERT_SUBJECT}\n\n${ALERT_BODY}`,
});
assert.equal(partial.from, FORWARDER);
assert.equal(partial.receivedAt, RECEIVED);
assert.equal(partial.subject, ALERT_SUBJECT);
assert.equal(
  unwrapForwarded({
    ...autoForward,
    from: FORWARDER,
    text: 'See below.\n---------- Forwarded message ---------\nFrom: Chase <a@chase.com>\n\n',
  }).text.includes('See below'),
  true,
);
assert.equal(readForwardedDate('Someday soon'), null);
assert.equal(
  readForwardedDate('Mon, 3 Nov 2026 18:14:22 -0500'),
  Date.UTC(2026, 10, 3, 23, 14),
);
assert.equal(
  readForwardedDate('Tue, Nov 3, 2026 at 6:05 PM'),
  Date.UTC(2026, 10, 3, 18, 5),
);

// A forwarded block claiming to be Google's confirmation is neither one nor unwrapped into one.
const googleConfirmation = {
  from: 'Gmail Team <forwarding-noreply@google.com>',
  subject: 'Gmail Forwarding Confirmation - Receive Mail from jamie@gmail.com',
  text: 'Confirmation code: 123456789\nOr click https://mail.google.com/mail/vf-abc123-xyz',
};
const signed = { isDkimPassed: true, dkimDomain: 'google.com' };
assert.equal(confirmProviderOf({ ...googleConfirmation, ...signed }), 'gmail');
assert.equal(
  confirmProviderOf({
    ...googleConfirmation,
    isDkimPassed: true,
    dkimDomain: 'accounts.google.com',
  }),
  'gmail',
);
[
  { isDkimPassed: false, dkimDomain: 'google.com' },
  { isDkimPassed: true, dkimDomain: 'evil.com' },
  { isDkimPassed: true, dkimDomain: 'notgoogle.com' },
  { isDkimPassed: true, dkimDomain: 'google.com.evil.com' },
  { isDkimPassed: true, dkimDomain: null },
  { isDkimPassed: true },
].forEach((auth) =>
  assert.equal(
    confirmProviderOf({ ...googleConfirmation, ...auth }),
    null,
    JSON.stringify(auth),
  ),
);

// Yahoo's confirmation needs Yahoo's signature and a Yahoo link; a forwarded order mail from a Yahoo address has neither.
const yahooConfirmation = {
  from: 'Yahoo <no-reply@cc.yahoo-inc.com>',
  subject: 'Verify your email forwarding address',
  text: 'Please confirm: https://edit.yahoo.com/forwarding/verify?t=abc',
  isDkimPassed: true,
  dkimDomain: 'yahoo-inc.com',
};
assert.equal(confirmProviderOf(yahooConfirmation), 'yahoo');
assert.equal(
  confirmProviderOf({ ...yahooConfirmation, dkimDomain: 'evil.com' }),
  null,
);
assert.equal(
  confirmProviderOf({
    from: 'Jamie Lee <jamie@yahoo.com>',
    subject: 'Fwd: Please confirm your forwarded order',
    text: 'Thanks for your order. See https://www.store.example/orders/1',
    isDkimPassed: true,
    dkimDomain: 'yahoo.com',
  }),
  null,
);
const fakeConfirmation = {
  to: 'runway-abc@moondreamsmail.com',
  from: 'Mallory <mallory@example.com>',
  subject: 'Fwd: Gmail Forwarding Confirmation',
  text: `---------- Forwarded message ---------\nFrom: Gmail Team <forwarding-noreply@google.com>\nDate: Tue, Nov 3, 2026 at 6:05 PM\nSubject: ${googleConfirmation.subject}\nTo: <jamie@gmail.com>\n\n${googleConfirmation.text}`,
  receivedAt: RECEIVED,
  isDkimPassed: true,
  dkimDomain: 'example.com',
};
assert.ok(!isForwardingConfirmation(fakeConfirmation));
const unwrappedFake = unwrapForwarded(fakeConfirmation);
assert.equal(unwrappedFake.from, 'Gmail Team <forwarding-noreply@google.com>');
assert.ok(!isForwardingConfirmation(unwrappedFake));
const realConfirmation = {
  ...googleConfirmation,
  to: 'runway-abc@moondreamsmail.com',
  receivedAt: RECEIVED,
  ...signed,
};
assert.ok(isForwardingConfirmation(realConfirmation));
assert.deepEqual(unwrapForwarded(realConfirmation), realConfirmation);

// Which links the server may open for a confirmation.
const accepted: [string, 'gmail' | 'yahoo'][] = [
  ['https://mail.google.com/mail/vf-abc123', 'gmail'],
  ['https://mail-settings.google.com/mail/vf-abc123', 'gmail'],
  ['https://MAIL.google.com/mail/vf-abc123', 'gmail'],
  ['https://mail.yahoo.com/d/verify?t=1', 'yahoo'],
  ['https://EDIT.yahoo.com/account/verify?t=1', 'yahoo'],
];
accepted.forEach(([url, provider]) =>
  assert.ok(isAcceptedConfirmUrl(url, provider), url),
);
const refused: [string | null, 'gmail' | 'yahoo' | 'proton' | null][] = [
  ['http://mail.google.com/mail/vf-abc123', 'gmail'],
  ['https://mail.google.com.evil.com/mail/vf-abc123', 'gmail'],
  ['https://evilmail.google.com/mail/vf-abc123', 'gmail'],
  ['https://google.com/mail/vf-abc123', 'gmail'],
  ['https://mail.google.com@evil.com/mail/vf-abc123', 'gmail'],
  ['https://user:pw@mail.google.com/x', 'gmail'],
  ['https://mail.google.com:8443/x', 'gmail'],
  ['https://login.yahoo.com/verify', 'gmail'],
  ['https://mail.google.com/x', 'yahoo'],
  ['https://notyahoo.com/verify', 'yahoo'],
  ['https://r.search.yahoo.com/_ylt=x/RU=https%3A%2F%2Fevil.com', 'yahoo'],
  ['https://login.yahoo.com/account/verify?t=1', 'yahoo'],
  ['https://yahoo.com/verify?t=1', 'yahoo'],
  ['https://yahoo.com.evil.com/verify', 'yahoo'],
  ['https://account.proton.me/u/0/forwarding/accept?token=abc', 'proton'],
  ['https://mail.google.com/x', null],
  ['not a url', 'gmail'],
  [null, 'gmail'],
];
refused.forEach(([url, provider]) =>
  assert.ok(!isAcceptedConfirmUrl(url, provider), String(url)),
);

const seen: { url: string; init: RequestInit | undefined }[] = [];
const SUCCESS_PAGE = '<h1>Confirmation Success!</h1>';
const respond = (status: number, location?: string, page = SUCCESS_PAGE) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(location === undefined ? {} : { location }),
    text: async () => page,
    body: {
      cancel: async () => undefined,
    },
  }) as unknown as Response;
const routedFetch = (routes: Record<string, Response>) =>
  (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return routes[url] ?? respond(404);
  }) as unknown as typeof fetch;
const fakeFetch = (status: number, location?: string) =>
  (async (url: string, init?: RequestInit) => {
    seen.push({ url, init });
    return respond(status, location);
  }) as unknown as typeof fetch;
const gmailLink = 'https://mail.google.com/mail/vf-abc123';
const followed = await followConfirmLink(gmailLink, 'gmail', fakeFetch(200));
assert.deepEqual(followed, {
  autoConfirm: 'confirmed',
  status: 200,
  errorName: null,
});
assert.equal(seen.length, 1);
assert.equal(seen[0].init?.method, 'GET');
assert.equal(seen[0].init?.redirect, 'manual');
assert.ok(seen[0].init?.signal instanceof AbortSignal);
assert.equal(
  (await followConfirmLink(gmailLink, 'gmail', fakeFetch(404))).autoConfirm,
  'failed',
);
assert.equal(
  (
    await followConfirmLink(
      gmailLink,
      'gmail',
      routedFetch({
        [gmailLink]: respond(
          302,
          'https://accounts.google.com/ServiceLogin?x=1',
        ),
      }),
    )
  ).autoConfirm,
  'failed',
);
assert.equal(
  (
    await followConfirmLink(
      gmailLink,
      'gmail',
      routedFetch({
        [gmailLink]: respond(302, '/mail/signin?next=1'),
      }),
    )
  ).autoConfirm,
  'failed',
);
assert.equal(
  (
    await followConfirmLink(gmailLink, 'gmail', (async () => {
      throw new DOMException('timed out', 'TimeoutError');
    }) as unknown as typeof fetch)
  ).errorName,
  'TimeoutError',
);

// Redirects are walked by hand: a safe chain confirms, anything else fails without a request to the unsafe step.
const hopTo = (path: string) => `https://mail.google.com/mail/${path}`;
const chain = await followConfirmLink(
  gmailLink,
  'gmail',
  routedFetch({
    [gmailLink]: respond(302, '/mail/hop1'),
    [hopTo('hop1')]: respond(301, hopTo('hop2')),
    [hopTo('hop2')]: respond(200),
  }),
);
assert.equal(chain.autoConfirm, 'confirmed');
const seenBeforeEvil = seen.length;
const evilChain = await followConfirmLink(
  gmailLink,
  'gmail',
  routedFetch({
    [gmailLink]: respond(302, hopTo('hop1')),
    [hopTo('hop1')]: respond(302, 'https://evil.example.com/steal'),
  }),
);
assert.equal(evilChain.autoConfirm, 'failed');
assert.equal(seen.length - seenBeforeEvil, 2);
assert.ok(!seen.some((call) => call.url.includes('evil.example.com')));
const yahooLink = 'https://mail.yahoo.com/d/verify?t=1';
const redirector = await followConfirmLink(
  yahooLink,
  'yahoo',
  routedFetch({
    [yahooLink]: respond(302, 'https://r.search.yahoo.com/_ylt=x/RU=evil'),
  }),
);
assert.equal(redirector.autoConfirm, 'failed');
assert.ok(!seen.some((call) => call.url.includes('r.search.yahoo.com')));
const consent = await followConfirmLink(
  yahooLink,
  'yahoo',
  routedFetch({
    [yahooLink]: respond(302, 'https://guce.yahoo.com/consent?x=1'),
  }),
);
assert.equal(consent.autoConfirm, 'failed');
assert.ok(!seen.some((call) => call.url.includes('guce.yahoo.com')));
const loop = await followConfirmLink(
  gmailLink,
  'gmail',
  routedFetch({
    [gmailLink]: respond(302, hopTo('a')),
    [hopTo('a')]: respond(302, hopTo('b')),
    [hopTo('b')]: respond(302, hopTo('c')),
    [hopTo('c')]: respond(302, hopTo('d')),
    [hopTo('d')]: respond(200),
  }),
);
assert.equal(loop.autoConfirm, 'failed', 'more than 3 hops fails');
assert.ok(!seen.some((call) => call.url === hopTo('d')));
assert.equal(
  (
    await followConfirmLink(
      gmailLink,
      'gmail',
      routedFetch({ [gmailLink]: respond(200, undefined, '<p>Hello</p>') }),
    )
  ).autoConfirm,
  'failed',
  'a page that loads without saying it confirmed is not proof',
);

// Gmail's page asks for a tap on Confirm: its form is sent once, and only the answer that says so counts.
const askPage = `<form method="POST" action="/mail/vf-abc123/confirm"><input type="hidden" name="at" value="tok&amp;1"><input type="submit" name="confirm" value="Confirm"></form>`;
const confirmUrl = 'https://mail.google.com/mail/vf-abc123/confirm';
const formSeen = seen.length;
const submitted = await followConfirmLink(
  gmailLink,
  'gmail',
  routedFetch({
    [gmailLink]: respond(200, undefined, askPage),
    [confirmUrl]: respond(200),
  }),
);
assert.equal(submitted.autoConfirm, 'confirmed');
const post = seen[formSeen + 1];
assert.equal(post.url, confirmUrl);
assert.equal(post.init?.method, 'POST');
assert.equal(post.init?.body, 'at=tok%261&confirm=Confirm');
assert.equal(
  (
    await followConfirmLink(
      gmailLink,
      'gmail',
      routedFetch({
        [gmailLink]: respond(200, undefined, askPage),
        [confirmUrl]: respond(200, undefined, askPage),
      }),
    )
  ).autoConfirm,
  'failed',
  'the form is sent once, never in a loop',
);
const busyPage = `<form method="get" action="/search"><input name="q"></form><form method="post" action="/mail/vf-abc123/confirm"><input type="hidden" name="t" value="a&#61;&#x2B;b"><button name="cancel" value="1">Cancel</button><button name="ok" value="Confirm">Confirm</button></form>`;
const busySeen = seen.length;
await followConfirmLink(
  gmailLink,
  'gmail',
  routedFetch({
    [gmailLink]: respond(200, undefined, busyPage),
    [confirmUrl]: respond(200),
  }),
);
assert.equal(
  seen[busySeen + 1].init?.body,
  't=a%3D%2Bb&ok=Confirm',
  'the POST form, its hidden fields decoded and only the confirm button',
);
const redirectSeen = seen.length;
assert.equal(
  (
    await followConfirmLink(
      gmailLink,
      'gmail',
      routedFetch({
        [gmailLink]: respond(200, undefined, askPage),
        [confirmUrl]: respond(302, hopTo('after')),
        [hopTo('after')]: respond(200, undefined, askPage),
      }),
    )
  ).autoConfirm,
  'failed',
);
assert.equal(
  seen.slice(redirectSeen).filter((call) => call.init?.method === 'POST')
    .length,
  1,
  'a redirect after the POST never sends the form again',
);
assert.equal(
  (
    await followConfirmLink(
      gmailLink,
      'gmail',
      routedFetch({
        [gmailLink]: respond(
          200,
          undefined,
          '<script>var t="Confirmation Success!"</script><p>Confirm?</p>',
        ),
      }),
    )
  ).autoConfirm,
  'failed',
  'success words inside a script are not the page saying so',
);
const evilForm = askPage.replace(
  '/mail/vf-abc123/confirm',
  'https://evil.example.com/x',
);
assert.equal(
  (
    await followConfirmLink(
      gmailLink,
      'gmail',
      routedFetch({ [gmailLink]: respond(200, undefined, evilForm) }),
    )
  ).autoConfirm,
  'failed',
);
assert.ok(!seen.some((call) => call.url.includes('evil.example.com')));
assert.equal(
  (await followConfirmLink(gmailLink, 'gmail', fakeFetch(302))).autoConfirm,
  'failed',
  'a redirect with no Location fails',
);
const before = seen.length;
assert.equal(
  (
    await followConfirmLink(
      'https://account.proton.me/u/0/forwarding/accept?token=abc',
      'proton',
      fakeFetch(200),
    )
  ).autoConfirm,
  'skipped',
);
assert.equal(
  (
    await followConfirmLink(
      'https://mail.google.com.evil.com/x',
      'gmail',
      fakeFetch(200),
    )
  ).autoConfirm,
  'skipped',
);
assert.equal(seen.length, before, 'nothing unaccepted is fetched');

// The client's sender address is the server's lowercase `toAddress`, so a filter built from one matches the other.
[
  'Chase <Alerts@Chase.com>',
  '"Target Orders" <orders@target.com>',
  'alerts@capitalone.com',
  'NO.REPLY@Chase.COM',
  ' <a@b.co> ',
].forEach((from) =>
  assert.equal(readSender(from).address, toAddress(from), from),
);
assert.deepEqual(readSender('Chase <Alerts@Chase.com>'), {
  address: 'alerts@chase.com',
  name: 'Chase',
});
assert.deepEqual(readSender('NO.REPLY@Chase.COM'), {
  address: 'no.reply@chase.com',
  name: null,
});

// A sender's bucket is its newest judged email's kind; unread, filtered and unjudged emails don't decide it, and an older sender falls back to purchase = bank, else not money.
{
  const event = (
    id: string,
    from: string,
    receivedAt: number,
    outcome: EmailEventRead['outcome'],
    senderKind: EmailEventRead['senderKind'],
  ): EmailEventRead => ({
    id,
    from,
    receivedAt,
    savedAt: null,
    addedByPersonAt: null,
    outcome,
    senderKind,
    purchaseId: null,
    subject: '',
    subjectTemplate: '',
    snippet: '',
    bodyText: null,
    readBy: null,
    senderLogo: null,
    senderCompany: null,
  });
  const kindOf = (events: EmailEventRead[], address: string) =>
    groupEmailSenders(events)
      .flatMap((group) => group.senders)
      .find((sender) => sender.address === address)?.kind;
  assert.equal(
    kindOf(
      [
        event('a', 'x@shop.com', 1, 'notPurchase', 'bank'),
        event('b', 'X@shop.com', 2, 'purchase', 'store'),
        event('c', 'x@shop.com', 3, 'unread', 'other'),
        event('d', 'x@shop.com', 4, 'filtered', 'other'),
        event('e', 'x@shop.com', 5, 'notPurchase', null),
      ],
      'x@shop.com',
    ),
    'store',
    'the newest judged email decides',
  );
  assert.equal(
    kindOf(
      [
        event('a', 'y@bank.com', 1, 'purchase', null),
        event('b', 'y@bank.com', 2, 'notPurchase', null),
      ],
      'y@bank.com',
    ),
    'bank',
    'an older sender that ever had a purchase is a bank',
  );
  assert.equal(
    kindOf(
      [
        event('a', 'z@news.com', 1, 'notPurchase', null),
        event('b', 'z@news.com', 2, 'unread', 'store'),
      ],
      'z@news.com',
    ),
    'other',
    'no judged email and no purchase is not money',
  );
  const withLogo = (
    base: EmailEventRead,
    logo: string | null,
    company: string | null,
    purchaseId: string | null = null,
  ): EmailEventRead => ({
    ...base,
    senderLogo: logo,
    senderCompany: company,
    purchaseId,
  });
  const senderOf = (
    events: EmailEventRead[],
    address: string,
    bankLinkOf?: Parameters<typeof groupEmailSenders>[1],
  ) =>
    groupEmailSenders(events, bankLinkOf)
      .flatMap((group) => group.senders)
      .find((sender) => sender.address === address);
  const storeMail = (id: string, at: number) =>
    event(id, 'orders@shop.com', at, 'notPurchase', 'store');
  const logos = [
    withLogo(storeMail('a', 1), 'https://shop.example/old.png', 'Old Shop'),
    withLogo(storeMail('b', 3), 'https://shop.example/new.png', 'Shop'),
    withLogo(storeMail('c', 4), null, null),
  ];
  assert.equal(
    senderOf(logos, 'orders@shop.com')?.logo,
    'https://shop.example/new.png',
    'the newest event that has a logo wins, a later one without is passed over',
  );
  assert.equal(senderOf(logos, 'orders@shop.com')?.company, 'Shop');
  assert.equal(senderOf([storeMail('a', 1)], 'orders@shop.com')?.logo, null);
  const bankMail = (
    id: string,
    at: number,
    purchaseId: string | null,
    company: string | null = 'Capital One',
  ) =>
    withLogo(
      event(id, 'alerts@bank.com', at, 'purchase', 'bank'),
      null,
      company,
      purchaseId,
    );
  const linkOf =
    (links: Record<string, string | null | undefined>, name = 'Capital One') =>
    (id: string) =>
      links[id] === undefined
        ? undefined
        : links[id] === null
          ? null
          : { linkId: links[id], name, logo: `logo-of-${links[id]}` };
  const bankEvents = [bankMail('a', 1, 'p1'), bankMail('b', 2, 'p2')];
  const bankLogo = (
    events: EmailEventRead[],
    links?: Parameters<typeof linkOf>[0],
    name?: string,
  ) =>
    senderOf(
      events,
      'alerts@bank.com',
      links === undefined ? undefined : linkOf(links, name),
    )?.logo;
  assert.equal(
    bankLogo(bankEvents, { p1: 'L1', p2: 'L1' }),
    'logo-of-L1',
    'a bank with no logo takes the one link its purchases sit on',
  );
  assert.equal(
    bankLogo(bankEvents, { p1: 'L1', p2: 'L1' }, 'Capital One, N.A.'),
    'logo-of-L1',
    'the link name may carry a legal ending',
  );
  assert.equal(
    bankLogo(bankEvents, { p1: 'L1', p2: 'L2' }),
    null,
    'two links is not confident',
  );
  assert.equal(
    bankLogo(bankEvents, { p1: 'L1', p2: null }),
    null,
    'a purchase on no link is not confident',
  );
  assert.equal(
    bankLogo(bankEvents, { p1: 'L1' }),
    null,
    'one loaded purchase is not enough',
  );
  assert.equal(
    bankLogo(
      [bankMail('a', 1, 'p1', 'Citi'), bankMail('b', 2, 'p2', 'Citi')],
      { p1: 'L1', p2: 'L1' },
      'Citizens Bank',
    ),
    null,
    'a name that only starts like the bank is not the bank',
  );
  assert.equal(
    bankLogo(bankEvents, { p1: 'L1', p2: 'L1' }, 'Chase'),
    null,
    'a link at another bank is not this sender',
  );
  assert.equal(
    bankLogo([bankMail('a', 1, 'p1', null), bankMail('b', 2, 'p2', null)], {
      p1: 'L1',
      p2: 'L1',
    }),
    null,
    'a sender whose address never named its bank gets no link logo',
  );
  assert.equal(bankLogo(bankEvents, {}), null, 'no loaded purchase, no logo');
  assert.equal(bankLogo(bankEvents), null);
  assert.equal(
    senderOf(
      [
        withLogo(
          bankMail('a', 1, 'p1'),
          'data:image/png;base64,AA==',
          'Capital One',
        ),
        bankMail('b', 2, 'p2'),
      ],
      'alerts@bank.com',
      linkOf({ p1: 'L1', p2: 'L1' }),
    )?.logo,
    'data:image/png;base64,AA==',
    'its own logo comes before the link',
  );
  const confirmOnly = [
    event('a', 'forwarding-noreply@google.com', 1, 'confirm', null),
  ];
  assert.equal(groupEmailSenders(confirmOnly).length, 0, 'setup is no sender');
}

// A company is claimed only by the sender's own host, never by a name in the subject, body or display name.
assert.ok(isInstitutionHost('alerts@capitalone.com', 'Capital One'));
assert.ok(isInstitutionHost('no-reply@email.chase.com', 'Chase'));
assert.ok(isInstitutionHost('alerts@welcome.aexp.com', 'American Express'));
assert.ok(isInstitutionHost('alerts@apple.com', 'Apple Card'));
assert.equal(isInstitutionHost('promo@chase.xyz', 'Chase'), false);
assert.equal(isInstitutionHost('promo@chase.co.uk', 'Chase'), false);
assert.equal(isMerchantHost('hi@bluebottle.shop', 'Blue Bottle Coffee'), false);
assert.ok(isKnownInstitution('Capital One'));
assert.equal(isKnownInstitution('Stripe'), false);
assert.equal(isInstitutionHost('promo@evil.example', 'Chase'), false);
assert.equal(isInstitutionHost('chase@evil.example', 'Chase'), false);
assert.equal(isInstitutionHost('promo@chase-offers.com', 'Chase'), false);
assert.equal(isInstitutionHost('promo@evil.example', 'toString'), false);
assert.equal(isInstitutionHost('nobody', 'Chase'), false);
assert.ok(isMerchantHost('orders@target.com', 'Target'));
assert.ok(isMerchantHost('orders@m.target.com', 'Target'));
assert.ok(isMerchantHost('hi@bluebottle.com', 'Blue Bottle Coffee'));
assert.ok(isMerchantHost('x@traderjoes.com', "Trader Joe's"));
assert.equal(isMerchantHost('orders@evil.example', 'Target'), false);
assert.equal(isMerchantHost('orders@tar.com', 'Target'), false);
assert.equal(isMerchantHost('gmail.shop@gmail.com', 'Gmail Shop'), false);

assert.deepEqual(
  splitAddressForWrap('runway-token@moondreamsmail.com', 'runway-'),
  ['runway-', 'token@', 'moondreamsmail', '.com'],
  'an address breaks after the prefix, after the @ and before the dot',
);

console.log(
  `runway email parse: ${samples.length} samples and ${forwards.length} forwards ok`,
);
