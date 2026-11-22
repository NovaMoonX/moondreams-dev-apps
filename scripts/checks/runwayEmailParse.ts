import assert from 'node:assert/strict';

import {
  htmlToText,
  parseAlertEmail,
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

console.log(`runway email parse: ${samples.length} samples ok`);
