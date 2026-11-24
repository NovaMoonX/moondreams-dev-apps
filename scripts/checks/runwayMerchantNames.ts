import assert from 'node:assert/strict';

import type { Firestore } from 'firebase-admin/firestore';

import { planEmailPurchaseFill } from '../../functions/src/apps/runway/email/fillEmailPurchases.ts';
import { normalizeTransaction } from '../../functions/src/apps/runway/link/normalize.ts';
import {
  findMerchant,
  isKnownBusiness,
  merchantDocId,
  MERCHANT_NAMES_PATH,
  toMerchantEntries,
  toMerchantKey,
  toMerchantWrite,
} from '../../functions/src/apps/runway/merchantNames.ts';

// Eligibility: only a business Plaid recognised, never a transfer, loan or card payment, income or bank fee.
const raw = {
  merchantEntityId: 'eyg8o8',
  merchantName: 'Blue Bottle Coffee',
  categoryPrimary: 'FOOD_AND_DRINK',
};
assert.equal(isKnownBusiness(raw), true);
assert.equal(isKnownBusiness({ ...raw, merchantEntityId: null }), false);
assert.equal(isKnownBusiness({ ...raw, merchantEntityId: undefined }), false);
assert.equal(isKnownBusiness({ ...raw, merchantEntityId: '  ' }), false);
assert.equal(isKnownBusiness({ ...raw, merchantName: null }), false);
assert.equal(isKnownBusiness({ ...raw, merchantName: ' ' }), false);
assert.equal(isKnownBusiness({ ...raw, categoryPrimary: null }), true);
[
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'LOAN_PAYMENTS',
  'INCOME',
  'BANK_FEES',
  'transfer_out',
].forEach((categoryPrimary) =>
  assert.equal(
    isKnownBusiness({ ...raw, categoryPrimary }),
    false,
    categoryPrimary,
  ),
);

// The flag reaches the normalized charge from Plaid's fields.
const tx = (extra: Record<string, unknown>) =>
  normalizeTransaction({
    id: 't',
    pendingId: null,
    accountId: 'a',
    date: '2026-02-03',
    amount: 4.5,
    merchantName: 'Blue Bottle Coffee',
    logoUrl: 'https://logos.example/bb.png',
    name: 'SQ *BLUE BOTTLE #123',
    category: 'food_and_drink_coffee',
    categoryPrimary: 'FOOD_AND_DRINK',
    merchantEntityId: 'eyg8o8',
    isPending: false,
    ...extra,
  });
assert.equal(tx({})?.isKnownBusiness, true);
assert.equal(tx({ merchantEntityId: null })?.isKnownBusiness, false);
assert.equal(tx({ categoryPrimary: 'TRANSFER_OUT' })?.isKnownBusiness, false);

// Normalizer: one key whatever the bank appends.
assert.equal(toMerchantKey('AMZN Mktp US*2K3AB1'), 'amzn mktp us');
assert.equal(toMerchantKey('AMZN Mktp US'), 'amzn mktp us');
assert.equal(toMerchantKey('amzn mktp us*ZZ99'), 'amzn mktp us');
assert.equal(toMerchantKey('SQ *BLUE BOTTLE #123'), 'blue bottle');
assert.equal(toMerchantKey('Blue Bottle Coffee #4410'), 'blue bottle coffee');
assert.equal(toMerchantKey('TST* Sweetgreen 0042'), 'sweetgreen');
assert.equal(toMerchantKey('PAYPAL *SPOTIFY'), 'spotify');
assert.equal(toMerchantKey('7-Eleven 33021'), 'eleven');
assert.equal(toMerchantKey('Café  Nero'), 'cafe nero');
assert.equal(toMerchantKey('12345'), null);
assert.equal(toMerchantKey('*ABC'), null);
assert.equal(toMerchantKey(null), null);
assert.equal(toMerchantKey(undefined), null);
assert.match(merchantDocId('amzn mktp us'), /^[0-9a-f]{24}$/);
assert.equal(
  merchantDocId(toMerchantKey('AMZN Mktp US*2K3AB1') as string),
  merchantDocId(toMerchantKey('AMZN Mktp US') as string),
);

// Entries: the clean name and the bank's descriptor both carry the same display fields; others are ignored.
const amazon = tx({
  merchantName: 'Amazon',
  name: 'AMZN Mktp US*2K3AB1',
  logoUrl: 'https://logos.example/amazon.png',
  category: 'general_merchandise_online_marketplaces',
});
const entries = toMerchantEntries(
  [
    amazon,
    amazon,
    tx({ merchantEntityId: null, merchantName: 'Joe', name: 'JOE 77' }),
    tx({ categoryPrimary: 'BANK_FEES', merchantName: 'Overdraft' }),
  ].flatMap((entry) => (entry ? [entry] : [])),
);
assert.equal(entries.length, 2);
assert.deepEqual(
  entries.map(({ name, logo, category }) => ({ name, logo, category })),
  [
    {
      name: 'Amazon',
      logo: 'https://logos.example/amazon.png',
      category: 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES',
    },
    {
      name: 'Amazon',
      logo: 'https://logos.example/amazon.png',
      category: 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES',
    },
  ],
);
assert.deepEqual(
  new Set(entries.map(({ id }) => id)),
  new Set([merchantDocId('amazon'), merchantDocId('amzn mktp us')]),
);
// A generic or one-word descriptor that doesn't hold the name never becomes an alias for everyone.
const aliasCount = (merchantName: string, name: string) => {
  const one = tx({ merchantName, name });
  return toMerchantEntries(one ? [one] : []).length;
};
assert.equal(
  aliasCount('Blue Bottle', 'SQ *COFFEE 1234'),
  1,
  'one generic word',
);
assert.equal(aliasCount('Blue Bottle', 'POS DEBIT 4411'), 1, 'banking words');
assert.equal(
  aliasCount('Blue Bottle', 'SQ *BLUE BOTTLE OAK'),
  2,
  'holds the name',
);
assert.equal(
  aliasCount('Amazon', 'AMZN Mktp US*2K3AB1'),
  2,
  'a named descriptor',
);
// A name that equals the descriptor makes one entry; a charge with a logo wins over one without.
const plain = tx({ merchantName: 'Shell', name: 'Shell', logoUrl: null });
assert.equal(toMerchantEntries(plain ? [plain] : []).length, 1);
const shell = tx({ merchantName: 'Shell', name: 'Shell', logoUrl: null });
const shellLogo = tx({
  merchantName: 'Shell',
  name: 'Shell',
  logoUrl: 'https://logos.example/shell.png',
});
assert.equal(
  toMerchantEntries([shell, shellLogo].flatMap((e) => (e ? [e] : [])))[0].logo,
  'https://logos.example/shell.png',
);

// Refresh: write when missing, changed, or older than a week; keep a stored logo Plaid now leaves out.
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 24);
const entry = {
  id: 'x',
  name: 'Shell',
  logo: 'https://logos.example/shell.png',
  category: 'TRANSPORTATION_GAS',
};
const stored = { name: 'Shell', logo: entry.logo, category: entry.category };
assert.deepEqual(toMerchantWrite(entry, undefined, NOW), {
  ...stored,
  seenAt: NOW,
});
assert.equal(
  toMerchantWrite(entry, { ...stored, seenAt: NOW - DAY }, NOW),
  null,
);
assert.equal(
  toMerchantWrite(entry, { ...stored, seenAt: NOW - 8 * DAY }, NOW)?.seenAt,
  NOW,
);
assert.equal(
  toMerchantWrite(
    { ...entry, name: 'Shell Oil' },
    { ...stored, seenAt: NOW - DAY },
    NOW,
  )?.name,
  'Shell Oil',
);
assert.equal(
  toMerchantWrite(
    { ...entry, logo: null },
    { ...stored, seenAt: NOW - DAY },
    NOW,
  ),
  null,
  'a missing logo never rewrites or erases one',
);
assert.equal(
  Object.keys(toMerchantWrite(entry, undefined, NOW) ?? {})
    .sort()
    .join(),
  'category,logo,name,seenAt',
  'a document holds nothing about a person',
);

// Email fill-in: a hit gives the clean name, logo and category; a miss or a failing read gives nothing.
const docs = new Map<string, unknown>([
  [
    `${MERCHANT_NAMES_PATH}/${merchantDocId('amzn mktp us')}`,
    {
      name: 'Amazon',
      logo: 'https://logos.example/amazon.png',
      category: null,
      seenAt: 1,
    },
  ],
]);
const fake = (fail: boolean) =>
  ({
    doc: (path: string) => ({
      get: async () => {
        if (fail) throw new Error('down');
        return { data: () => docs.get(path) };
      },
    }),
  }) as unknown as Firestore;
assert.deepEqual(await findMerchant(fake(false), 'AMZN Mktp US*9X8Y7Z'), {
  name: 'Amazon',
  logo: 'https://logos.example/amazon.png',
  category: null,
});
assert.equal(await findMerchant(fake(false), 'Corner Deli'), null);
assert.equal(await findMerchant(fake(false), null), null);
assert.equal(await findMerchant(fake(true), 'AMZN Mktp US'), null);

// Existing email purchases: an unanswered one moves into Needs a home and takes what the list knows; a placed one is never moved.
const known = {
  name: 'Amazon',
  logo: 'https://logos.example/amazon.png',
  category: 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES',
};
const emailed = (
  extra: Record<string, unknown> = {},
  view: Record<string, unknown> = {},
) => ({
  needsHome: false,
  createdAt: 100,
  updatedAt: 100,
  merchantCheckedAt: null,
  payload: {
    merchant: 'AMZN Mktp US*2K3AB1',
    merchantLogo: null,
    category: null,
    assignedBy: null,
    ruleId: null,
    pairedWithId: null,
    incomeDayId: null,
    lines: [{ envelopeId: null, cents: 500, via: 'free' }],
    ...extra,
  },
  ...view,
});
assert.deepEqual(planEmailPurchaseFill(emailed(), known, NOW), {
  needsHome: true,
  patch: {
    merchant: 'Amazon',
    merchantLogo: known.logo,
    category: known.category,
  },
});
assert.deepEqual(planEmailPurchaseFill(emailed(), null, NOW), {
  needsHome: true,
  patch: null,
});
const placed = [
  emailed({ lines: [{ envelopeId: 'e1', cents: 500, via: 'free' }] }),
  emailed({ ruleId: 'r1' }),
  emailed({ assignedBy: 'person' }),
  emailed({ pairedWithId: 'p' }),
  emailed({ incomeDayId: 'd' }),
  emailed({}, { updatedAt: 200 }),
];
placed.forEach((view) =>
  assert.equal(planEmailPurchaseFill(view, null, NOW)?.needsHome ?? null, null),
);
// A purchase already in Needs a home keeps its name when the person touched it, and still takes the logo.
assert.deepEqual(
  planEmailPurchaseFill(
    emailed({ merchant: 'Mom stuff' }, { needsHome: true, updatedAt: 200 }),
    known,
    NOW,
  ),
  {
    needsHome: null,
    patch: { merchantLogo: known.logo, category: known.category },
  },
);
// A category the person set stays.
assert.deepEqual(
  planEmailPurchaseFill(
    emailed({ category: 'X' }, { needsHome: true }),
    known,
    NOW,
  )?.patch,
  { merchant: 'Amazon', merchantLogo: known.logo },
);
// Already filled, or a miss checked within the week: nothing to read or write; a week later it is tried again.
assert.equal(
  planEmailPurchaseFill(
    emailed({ merchantLogo: known.logo }, { needsHome: true }),
    known,
    NOW,
  ),
  null,
);
const missed = emailed({}, { needsHome: true, merchantCheckedAt: NOW - DAY });
assert.equal(planEmailPurchaseFill(missed, known, NOW), null);
assert.notEqual(
  planEmailPurchaseFill(
    { ...missed, merchantCheckedAt: NOW - 8 * DAY },
    known,
    NOW,
  ),
  null,
);

console.log('runwayMerchantNames: ok');
