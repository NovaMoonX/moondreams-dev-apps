import assert from 'node:assert/strict';

import {
  excerptOf,
  htmlToText,
  isProtonInvitation,
  parseAlertEmail,
  readableBody,
  readProtonLink,
  subjectTemplate,
} from '../../functions/src/apps/runway/email/parseAlert.ts';

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

console.log(`runway email parse: ${samples.length} samples ok`);
