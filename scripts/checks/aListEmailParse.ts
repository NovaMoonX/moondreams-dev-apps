import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  htmlToText,
  snippetOf,
  withoutEmailAddresses,
} from '../../functions/src/email/emailUtils.ts';
import {
  isForwardingConfirmation,
  readConfirmation,
} from '../../functions/src/email/forwardingConfirmation.ts';
import {
  buildTicket,
  findAttachTarget,
  findCancelTarget,
  findUsualTaxRate,
  isPartialRefund,
  localShowtimeToEpoch,
  normalizeTheatreName,
  reconcileAmounts,
} from '../../functions/src/apps/a-list/email/emailMatching.ts';
import { prepareAiPrompt } from '../../functions/src/apps/a-list/email/readAmcEmailWithAi.ts';
import {
  isFromAmc,
  looksLikeAmcOrder,
  parseAmcEmail,
  withoutMemberDetails,
} from '../../functions/src/apps/a-list/email/parseAmcEmail.ts';

const readFixture = (name: string) => {
  const raw = readFileSync(
    new URL(`../a-list/emailFixtures/${name}.txt`, import.meta.url),
    'utf8',
  );
  const [head, ...rest] = raw.split(/\n\n/);
  const header = (key: string) =>
    new RegExp(`^${key}: (.*)$`, 'm').exec(head)?.[1] ?? '';
  return {
    from: header('From'),
    subject: header('Subject'),
    text: rest.join('\n\n'),
  };
};

const local = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) => ({ year, month, day, hour, minute });

const reservations = [
  {
    name: 'reservation',
    confirmation: '0195443676',
    title: 'Focker In-Law',
    contentRating: 'PG-13',
    showtimeLocal: local(2026, 11, 25, 16, 15),
    theatreName: 'AMC Park Place 16',
    auditorium: '9',
    seats: 'F7',
    ticketCount: 1,
    ticketKind: 'ADULT',
    ticketPriceCents: 1449,
    feeWaivedCents: 269,
    format: null,
  },
  {
    name: 'reservation-two-tickets',
    confirmation: '0188120457',
    title: 'Wicked: For Good',
    contentRating: 'PG',
    showtimeLocal: local(2026, 12, 6, 11, 5),
    theatreName: 'AMC Southlake 24',
    auditorium: '14',
    seats: 'C5, C6',
    ticketCount: 2,
    ticketKind: 'ADULT',
    ticketPriceCents: 1449,
    feeWaivedCents: 269,
    format: null,
  },
  {
    name: 'reservation-dolby-24h',
    confirmation: '0191009922',
    title: 'Project Hail Mary',
    contentRating: 'PG-13',
    showtimeLocal: local(2026, 11, 27, 19, 40),
    theatreName: 'AMC Dine-In Rosedale 18',
    auditorium: '3',
    seats: 'H10',
    ticketCount: 1,
    ticketKind: 'ADULT',
    ticketPriceCents: 2049,
    feeWaivedCents: 269,
    format: 'DOLBY_CINEMA',
  },
  {
    name: 'reservation-forwarded',
    confirmation: '0177700123',
    title: 'Mercy Rule',
    contentRating: 'R',
    showtimeLocal: local(2026, 11, 29, 19, 30),
    theatreName: 'AMC Classic Bellevue 12',
    auditorium: '5',
    seats: 'D4',
    ticketCount: 1,
    ticketKind: 'ADULT',
    ticketPriceCents: 1199,
    feeWaivedCents: 269,
    format: null,
  },
];

reservations.forEach(({ name, ...expected }) => {
  const mail = readFixture(name);
  assert.ok(isFromAmc(mail.from, mail.text), `${name}: from AMC`);
  assert.deepEqual(
    parseAmcEmail(mail.text),
    { kind: 'reservation', ...expected },
    name,
  );
});

const cancellation = readFixture('cancellation');
assert.ok(isFromAmc(cancellation.from, cancellation.text));
assert.deepEqual(parseAmcEmail(cancellation.text), {
  kind: 'cancellation',
  confirmation: '0134540696',
  orderNumber: '1275187838',
  title: 'How to Rob a Bank',
  showtimeLocal: local(2026, 11, 13, 18, 50),
  theatreName: 'AMC Chattanooga 18',
  refundedCount: 1,
});

const partial = readFixture('cancellation-partial');
assert.deepEqual(parseAmcEmail(partial.text), {
  kind: 'cancellation',
  confirmation: '0188120457',
  orderNumber: '1275187999',
  title: 'Wicked: For Good',
  showtimeLocal: local(2026, 12, 6, 11, 5),
  theatreName: 'AMC Southlake 24',
  refundedCount: 1,
});
const twoTickets = [{ outcome: 'added', ticketCount: 2 }];
assert.equal(isPartialRefund(twoTickets, 1), true, 'one of two refunded');
assert.equal(isPartialRefund(twoTickets, 2), false, 'both refunded');
assert.equal(isPartialRefund(twoTickets, null), false, 'no count given');
assert.equal(isPartialRefund([], 1), false, 'no reservation recorded');
assert.equal(
  isPartialRefund(
    [...twoTickets, { outcome: 'partlyCanceled', ticketCount: 1 }],
    1,
  ),
  false,
  'the last ticket of a part-refunded order',
);

const marketing = readFixture('marketing');
assert.ok(isFromAmc(marketing.from, marketing.text));
assert.equal(parseAmcEmail(marketing.text), null, 'marketing: no reading');
assert.equal(
  looksLikeAmcOrder(marketing.text),
  false,
  'marketing: not an order',
);

const unrelated = readFixture('unrelated');
assert.equal(isFromAmc(unrelated.from, unrelated.text), false);
assert.equal(looksLikeAmcOrder(unrelated.text), false);

const lookalike = readFixture('lookalike');
assert.equal(
  isFromAmc(lookalike.from, lookalike.text),
  false,
  'lookalike: not AMC',
);

const forwarded = readFixture('reservation-forwarded');
assert.equal(
  isFromAmc(forwarded.from, ''),
  false,
  'a member sender alone is not AMC',
);

const asHtml = readFixture('reservation')
  .text.split('\n')
  .map((line) => `<tr><td>${line.replace(/: /, ':</td><td>')}</td></tr>`)
  .join('');
assert.equal(
  (
    parseAmcEmail(htmlToText(`<table>${asHtml}</table>`)) as {
      confirmation?: string;
    }
  )?.confirmation,
  '0195443676',
  'html table layout',
);

[readFixture('reservation'), cancellation].forEach(({ text }) => {
  const kept = withoutMemberDetails(text);
  ['Stephon', 'Ricks', '1101000550808436'].forEach((secret) =>
    assert.ok(!kept.includes(secret), `private detail kept: ${secret}`),
  );
});
assert.ok(
  withoutMemberDetails(readFixture('reservation').text).includes(
    'Focker In-Law',
  ),
);

[readFixture('reservation'), cancellation].forEach(({ subject, text }) => {
  const prompt = prepareAiPrompt(`${subject} Stephon <s@example.com>`, text);
  ['Stephon', 'Ricks', '1101000550808436', 's@example.com'].forEach((secret) =>
    assert.ok(!prompt.includes(secret), `private detail sent to AI: ${secret}`),
  );
});

const chicago = 'America/Chicago';
assert.equal(
  localShowtimeToEpoch(local(2026, 11, 25, 16, 15), chicago),
  Date.UTC(2026, 10, 25, 22, 15),
  'CST showtime',
);
assert.equal(
  localShowtimeToEpoch(local(2026, 7, 4, 19, 0), chicago),
  Date.UTC(2026, 6, 5, 0, 0),
  'CDT showtime',
);
assert.equal(
  normalizeTheatreName('AMC Park Place 16'),
  normalizeTheatreName('Park Place 16'),
);

assert.deepEqual(
  reconcileAmounts({
    emailPriceCents: 1449,
    amc: { priceCents: 1449, taxCents: 112 },
    usualTaxRate: 0.0875,
  }),
  { priceCents: 1449, taxCents: 112 },
  'email price is AMC price',
);
assert.deepEqual(
  reconcileAmounts({
    emailPriceCents: 1561,
    amc: { priceCents: 1449, taxCents: 112 },
    usualTaxRate: 0.0875,
  }),
  { priceCents: 1449, taxCents: 112 },
  'email price includes AMC tax',
);
assert.deepEqual(
  reconcileAmounts({
    emailPriceCents: 1450,
    amc: { priceCents: 1449, taxCents: null },
    usualTaxRate: 0.1,
  }),
  { priceCents: 1449, taxCents: 145 },
  'within a cent, no AMC tax: usual rate',
);
assert.deepEqual(
  reconcileAmounts({
    emailPriceCents: 1200,
    amc: { priceCents: 1449, taxCents: 112 },
    usualTaxRate: 0.0875,
  }),
  { priceCents: 1200, taxCents: 105 },
  'neither matches: the email price and the usual rate',
);
assert.deepEqual(
  reconcileAmounts({ emailPriceCents: 1449, amc: null, usualTaxRate: null }),
  { priceCents: 1449, taxCents: 0 },
  'nothing else known',
);
assert.deepEqual(
  reconcileAmounts({
    emailPriceCents: null,
    amc: { priceCents: 1449, taxCents: 112 },
    usualTaxRate: null,
  }),
  { priceCents: 1449, taxCents: 112 },
  'no email price: AMC lists it',
);
assert.equal(
  reconcileAmounts({ emailPriceCents: null, amc: null, usualTaxRate: 0.1 }),
  null,
  'no price anywhere',
);

const ticket = buildTicket({
  amounts: { priceCents: 1449, taxCents: 112 },
  format: 'STANDARD',
  standardPriceCents: 1449,
  feeAvoidedCents: 269,
});
assert.deepEqual(ticket, {
  entryMode: 'ITEMIZED',
  format: 'STANDARD',
  priceCents: 1449,
  standardPriceCents: null,
  feeAvoidedCents: 269,
  taxRate: 0.0773,
  taxCents: 112,
  taxChoice: null,
  totalCents: 1830,
});
assert.equal(
  buildTicket({
    amounts: null,
    format: 'IMAX',
    standardPriceCents: null,
    feeAvoidedCents: 0,
  }),
  null,
);

const park = {
  theatreId: '2087',
  name: 'AMC Park Place 16',
  city: null,
  state: null,
  timeZone: null,
};
const at = Date.UTC(2026, 10, 25, 22, 15);
const base = {
  id: 'v1',
  movieKey: 'tmdb-1',
  movie: { title: 'Focker In-Law' },
  showtimeAt: at,
  status: 'PLANNED' as const,
  ticket: null,
  theatre: park,
  amcConfirmation: null,
};
const reservation = {
  movieKey: 'tmdb-1',
  title: 'Focker In-Law',
  theatre: park,
  showtimeAt: at,
};
assert.equal(findAttachTarget([base], reservation)?.id, 'v1', 'exact');
assert.equal(
  findAttachTarget([{ ...base, showtimeAt: at + 44 * 60_000 }], reservation)
    ?.id,
  'v1',
  'within 45 minutes',
);
assert.equal(
  findAttachTarget([{ ...base, showtimeAt: at + 46 * 60_000 }], reservation),
  null,
  'past 45 minutes',
);
assert.equal(
  findAttachTarget(
    [{ ...base, movieKey: 'manual-x', movie: { title: 'Focker In-Law 2' } }],
    reservation,
  ),
  null,
  'a sequel is another movie',
);
assert.equal(
  findAttachTarget(
    [{ ...base, movieKey: 'manual-x', movie: { title: 'focker in-law' } }],
    reservation,
  )?.id,
  'v1',
  'same title, another key',
);
assert.equal(
  findAttachTarget([{ ...base, ticket: {} as never }], reservation),
  null,
  'already has a ticket',
);
assert.equal(
  findAttachTarget(
    [
      {
        ...base,
        theatre: { ...park, theatreId: '9', name: 'AMC Elsewhere 8' },
      },
    ],
    reservation,
  ),
  null,
  'another theater',
);
assert.equal(
  findAttachTarget(
    [{ ...base, theatre: { ...park, theatreId: 'manual-1' } }],
    reservation,
  )?.id,
  'v1',
  'typed theater with the same name',
);
assert.equal(
  findAttachTarget(
    [
      { ...base, id: 'far', showtimeAt: at + 40 * 60_000 },
      { ...base, id: 'near', showtimeAt: at + 10 * 60_000 },
    ],
    reservation,
  )?.id,
  'near',
  'nearest wins',
);
assert.equal(
  findAttachTarget([{ ...base, status: 'SEEN' }], reservation),
  null,
  'seen showings are left alone',
);

const cancel = {
  confirmation: '0195443676',
  title: 'Focker In-Law',
  theatreName: 'AMC Park Place 16',
  showtimeAt: at,
};
const paid = { ...base, ticket: {} as never };
assert.equal(
  findCancelTarget(
    [
      {
        ...paid,
        id: 'a',
        amcConfirmation: '0195443676',
        showtimeAt: at + 9 * 3_600_000,
      },
    ],
    cancel,
  )?.id,
  'a',
  'by confirmation, whatever the time',
);
assert.equal(
  findCancelTarget([paid], cancel)?.id,
  'v1',
  'by title, theater and time',
);
assert.equal(
  findCancelTarget([{ ...paid, showtimeAt: at + 6 * 60_000 }], cancel),
  null,
  'past five minutes',
);
assert.equal(
  findCancelTarget([base], cancel),
  null,
  'a showing with no ticket is not canceled by a guess',
);
assert.equal(
  findCancelTarget([{ ...paid, amcConfirmation: '0999999999' }], cancel),
  null,
  'a showing that holds another confirmation is not canceled by a guess',
);
assert.equal(
  findCancelTarget(
    [{ ...paid, status: 'SEEN', amcConfirmation: '0195443676' }],
    cancel,
  ),
  null,
  'a seen showing is left alone',
);

const tax = (rate: number | null, showtimeAt: number, theatre = park) => ({
  showtimeAt,
  theatre,
  ticket: { taxRate: rate } as never,
});
assert.equal(
  findUsualTaxRate([tax(0.07, 1), tax(0.08, 3), tax(0.09, 2)], park),
  0.08,
  'the most recent ticket there',
);
assert.equal(findUsualTaxRate([tax(null, 5), tax(0.07, 1)], park), 0.07);
assert.equal(
  findUsualTaxRate(
    [tax(0.07, 1, { ...park, theatreId: '9', name: 'AMC Elsewhere 8' })],
    park,
  ),
  0.07,
  'another theater: the most recent rate anywhere',
);
assert.equal(findUsualTaxRate([], park), null, 'no ticket at all');

const proton = {
  from: 'Proton Mail <no-reply@notify.proton.me>',
  subject: 'Forwarding request from someone@proton.me',
  text: 'Learn more https://proton.me/support/email-forwarding or accept: https://account.proton.me/u/0/mail/forwarding/accept?token=abc',
  isDkimPassed: true,
};
assert.equal(isForwardingConfirmation(proton), true, 'Proton invitation');
assert.equal(
  readConfirmation(proton).confirmUrl,
  'https://account.proton.me/u/0/mail/forwarding/accept?token=abc',
  'the accept link, not the support page',
);
assert.equal(
  isForwardingConfirmation({ ...proton, isDkimPassed: false }),
  false,
  'unsigned Proton mail',
);
assert.equal(
  isForwardingConfirmation({ ...proton, from: 'x@evil.example' }),
  false,
  'a look-alike sender',
);
assert.equal(
  isForwardingConfirmation({ ...proton, text: 'https://proton.me/blog/news' }),
  false,
  'no invitation link',
);
assert.equal(
  snippetOf(withoutEmailAddresses('To: <a.b@mail.com> Dear x; c@d.org ok'), 99),
  'To: Dear x; ok',
  'addresses are not kept',
);

console.log(
  `a-list email parse: ${reservations.length + 5} fixtures and the pricing and matching rules ok`,
);
