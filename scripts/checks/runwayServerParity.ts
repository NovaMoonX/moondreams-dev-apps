// `npm run check:runway-server-parity` runs the app's figures engine and its server copy on the same plans, 60 days in a row across month ends, and fails on any difference. Only ids and paths are printed, never amounts.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

import {
  computeFigures as appComputeFigures,
  toFiguresInput as appToFiguresInput,
  type FiguresInput,
} from '../../src/apps/runway/engine/figures.ts';
import { toPlacementInput } from '../../functions/src/apps/runway/figures/sortPurchases.ts';
import {
  planRulePlacements as serverPlanRulePlacements,
  toMerchantKey,
} from '../../functions/src/apps/runway/engine/rules.ts';
import { planRulePlacements as appPlanRulePlacements } from '../../src/apps/runway/engine/rules.ts';
import {
  buildShareSummary as appBuildShareSummary,
  toShareSummaryInput as appToShareSummaryInput,
} from '../../src/apps/runway/engine/shareSummary.ts';
import {
  openAccountBalance,
  openCard,
  openDay,
  openItem,
  openMove,
  openPlan,
  openPurchase,
  openRecord,
  openVersion,
  type ReadSealed,
} from '../../src/apps/runway/engine/openDocs.ts';
import { DAY_MS, todayAsUtcDate } from '../../src/apps/runway/engine/dates.ts';
import { ENGINE_VERSION } from '../../src/apps/runway/engine/engineConstants.ts';
import {
  computeFigures as serverComputeFigures,
  toFiguresInput as serverToFiguresInput,
} from '../../functions/src/apps/runway/engine/figures.ts';
import {
  buildShareSummary as serverBuildShareSummary,
  toShareSummaryInput as serverToShareSummaryInput,
} from '../../functions/src/apps/runway/engine/shareSummary.ts';
import { openJson, sealJson } from '../../src/apps/runway/security.ts';
import { selectBankBacking } from '../../src/apps/runway/store/selectors/balanceSelectors.ts';
import {
  selectBalances,
  selectBillCover,
} from '../../src/apps/runway/store/selectors/billCoverSelectors.ts';
import { selectAutoBills } from '../../src/apps/runway/store/selectors/autoPaySelectors.ts';
import { selectTwinHeldIds } from '../../src/apps/runway/store/selectors/emailSelectors.ts';
import { selectLevel } from '../../src/apps/runway/store/selectors/levelSelectors.ts';
import { selectLedgerOnlyBalances } from '../../src/apps/runway/store/selectors/balanceSelectors.ts';
import { selectRecentFrom } from '../../src/apps/runway/store/selectors/historySelectors.ts';
import {
  selectAccounts,
  selectEnvelopes,
  selectIsLinkHistory,
} from '../../src/apps/runway/store/selectors/runwaySelectors.ts';
import { selectBillsDueBeforePay } from '../../src/apps/runway/store/selectors/overviewSelectors.ts';
import type { RootState } from '../../src/store/index.ts';
import type {
  AccountBalanceDoc,
  CardDoc,
  DayRecordDoc,
  IncomeDayDoc,
  MoveDoc,
  OpenAccount,
  OpenPurchase,
  OpenRule,
  PlanDoc,
  PlanItemDoc,
  PlanSealedFields,
  PlanVersionDoc,
  PurchaseDoc,
  RunwayEncryption,
} from '../../src/apps/runway/types.ts';
import { buildRunwayScaleDocs } from '../seeds/runwayScale.ts';

const UID = 'parity-plan';
const SPAN_DAYS = 60;
const encryption: RunwayEncryption = {
  appId: 'runway',
  keyId: 'parity',
  keyVersion: 1,
  key: '0123456789abcdef'.repeat(4),
};
const read: ReadSealed = (sealed) => openJson(sealed, encryption);

type Doc = { path: string; value: object };

const idOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const under = (docs: Doc[], collection: string) =>
  docs.filter(({ path }) =>
    new RegExp(`^apps/runway/plans/${UID}/${collection}/[^/]+$`).test(path),
  );

/** The plan's documents opened into what the figures read, by the same openers the app's listeners call. */
const openPlanInput = async (docs: Doc[]): Promise<FiguresInput> => {
  const planDoc = docs.find(({ path }) => path === `apps/runway/plans/${UID}`)
    ?.value as PlanDoc;
  const plan = openPlan(
    planDoc,
    planDoc.sealed ? await read<PlanSealedFields>(planDoc.sealed) : null,
  );
  const days = await Promise.all(
    under(docs, 'days').map(({ path, value }) =>
      openDay({ ...(value as IncomeDayDoc), id: idOf(path) }, read),
    ),
  );
  const confirmed = new Set(
    days.filter((day) => day.status === 'confirmed').map((day) => day.id),
  );
  const records = await Promise.all(
    docs
      .filter(({ path }) =>
        new RegExp(`^apps/runway/plans/${UID}/days/([^/]+)/records/`).test(
          path,
        ),
      )
      .filter(({ path }) => confirmed.has(path.split('/')[5]))
      .map(({ path, value }) =>
        openRecord({ ...(value as DayRecordDoc), id: idOf(path) }, read),
      ),
  );
  const versions = (
    await Promise.all(
      under(docs, 'versions').map(({ path, value }) =>
        openVersion({ ...(value as PlanVersionDoc), id: idOf(path) }, read),
      ),
    )
  ).filter((version) => version !== null);
  return {
    today: 0,
    zone: null,
    plan,
    items: under(docs, 'items').map(({ path, value }) =>
      openItem({ ...(value as Partial<PlanItemDoc>), id: idOf(path) }),
    ),
    versions,
    days,
    moves: await Promise.all(
      under(docs, 'moves').map(({ path, value }) =>
        openMove({ ...(value as MoveDoc), id: idOf(path) }, read),
      ),
    ),
    records,
    purchases: await Promise.all(
      under(docs, 'purchases').map(({ path, value }) =>
        openPurchase({ ...(value as PurchaseDoc), id: idOf(path) }, read),
      ),
    ),
    needsHome: [],
    cards: [],
    accounts: [],
    accountBalances: [],
    startedPayments: [],
    closing: null,
  };
};

/** Every path where two results differ: ids and keys only, never a value. */
const diffValues = (
  a: unknown,
  b: unknown,
  path: string,
  found: string[],
): void => {
  if (found.length >= 20) return;
  if (a instanceof Map || b instanceof Map) {
    return diffValues(
      a instanceof Map ? Object.fromEntries(a) : a,
      b instanceof Map ? Object.fromEntries(b) : b,
      path,
      found,
    );
  }
  if (a instanceof Set || b instanceof Set) {
    return diffValues(
      a instanceof Set ? [...a].sort() : a,
      b instanceof Set ? [...b].sort() : b,
      path,
      found,
    );
  }
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  ) {
    if (!Object.is(a, b)) found.push(path);
    return;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    found.push(path);
    return;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) found.push(`${path}.length`);
    a.slice(0, b.length).forEach((entry, index) =>
      diffValues(entry, b[index], `${path}[${index}]`, found),
    );
    return;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  [...new Set([...Object.keys(left), ...Object.keys(right)])].forEach((key) =>
    diffValues(left[key], right[key], `${path}.${key}`, found),
  );
};

interface Scenario {
  name: string;
  input: FiguresInput;
  zones: (string | null)[];
}

const runScenario = ({ name, input, zones }: Scenario, firstDay: number) => {
  const diffs = Array.from({ length: SPAN_DAYS }, (_, offset) => {
    const today = firstDay + offset * DAY_MS;
    return zones.flatMap((zone) => {
      const base = { ...input, today, zone };
      const context = {
        today,
        currency: 'USD',
        startDate: input.plan.startDate,
        recentFrom: today - 180 * DAY_MS,
      };
      const app = appComputeFigures(base);
      const server = serverComputeFigures(base);
      const found: string[] = [];
      diffValues(app, server, 'figures', found);
      diffValues(
        appBuildShareSummary(appToShareSummaryInput(app, context)),
        serverBuildShareSummary(serverToShareSummaryInput(server, context)),
        'summary',
        found,
      );
      return found.map((path) => `${name} day+${offset} ${zone}: ${path}`);
    });
  }).flat();
  return diffs;
};

/** The plan as a Link plan: a linked card and account with the bank's figures, a charge waiting, a card payment started. */
const buildLink = async (base: FiguresInput, firstDay: number) => {
  const startDate = base.plan.startDate ?? firstDay;
  const linkedCard = 'parity-card';
  const linkedAccount = 'parity-account';
  const cloneBank = (
    purchase: OpenPurchase,
    patch: Partial<OpenPurchase>,
  ): OpenPurchase => ({ ...purchase, source: 'link', ...patch });
  const sample = base.purchases[base.purchases.length - 1];
  const asOf = firstDay - 30 * 60_000;
  const onCard = (id: string, amountCents: number, daysAgo: number) =>
    cloneBank(sample, {
      id,
      amountCents,
      paidByCardId: linkedCard,
      status: 'posted',
      date: firstDay - daysAgo * DAY_MS,
    });
  const emailed = (id: string, amountCents: number, daysAgo: number) => ({
    ...onCard(id, amountCents, daysAgo),
    source: 'email' as const,
    emailWaiting: true,
    needsHome: true,
    lines: [],
  });
  const emailCase = {
    banks: [
      onCard('parity-twin-bank', 4_218, 3),
      onCard('parity-split-bank-a', 7_500, 4),
      onCard('parity-split-bank-b', 7_500, 5),
    ],
    emails: [
      emailed('parity-twin-email', 4_218, 3),
      emailed('parity-split-email', 7_500, 4),
      emailed('parity-lone-email', 1_999, 1),
    ],
  };
  const accounts: OpenAccount[] = [
    {
      id: linkedAccount,
      createdAt: startDate,
      updatedAt: startDate,
      archivedAt: null,
      linkId: 'parity-link',
      name: 'Checking',
      institution: 'Parity Bank',
      kind: 'checking',
      countedTowardTotal: true,
      isPullAccount: true,
      lastFour: '1111',
      balanceCents: null,
      balanceOn: null,
      holds: [],
      apyBps: null,
      interestDay: null,
    },
    {
      id: 'parity-typed',
      createdAt: startDate,
      updatedAt: startDate,
      archivedAt: null,
      linkId: null,
      name: 'Savings',
      institution: 'Parity Credit Union',
      kind: 'savings',
      countedTowardTotal: true,
      isPullAccount: false,
      lastFour: null,
      balanceCents: 500_000,
      balanceOn: startDate,
      holds: base.items
        .filter((item) => item.kind === 'goal')
        .slice(0, 2)
        .map((item) => item.id),
      apyBps: null,
      interestDay: null,
    },
  ];
  const card = await openCard(
    {
      id: linkedCard,
      createdAt: asOf,
      updatedAt: asOf,
      archivedAt: null,
      linkId: 'parity-link',
      sealed: await sealJson(
        {
          issuer: 'Parity Bank',
          name: 'Venture',
          dueDay: 12,
          lastFour: '4242',
          payFromAccountId: linkedAccount,
          annualFee: null,
        },
        encryption,
      ),
    } as CardDoc & { id: string },
    read,
  );
  const balanceDocs = await Promise.all(
    [
      { id: linkedAccount, cents: 2_750_000 },
      { id: linkedCard, cents: 64_000 },
    ].map(async ({ id, cents }) =>
      openAccountBalance(
        {
          id,
          asOf,
          sealed: await sealJson({ cents, availableCents: null }, encryption),
        } as AccountBalanceDoc,
        read,
      ),
    ),
  );
  const link: FiguresInput = {
    ...base,
    plan: {
      ...base.plan,
      trackingPeriods: [
        { from: startDate, to: null, linkedFrom: todayAsUtcDate(asOf) },
      ],
    },
    cards: [card],
    accounts: [],
    accountBalances: balanceDocs,
    needsHome: [
      cloneBank(sample, {
        id: 'parity-waiting',
        needsHome: true,
        lines: [],
        date: firstDay - DAY_MS,
        paidByCardId: linkedCard,
        status: 'pending',
      }),
      ...emailCase.emails,
    ],
    purchases: [
      ...base.purchases,
      ...emailCase.banks,
      ...emailCase.emails,
      cloneBank(sample, {
        id: 'parity-card-charge',
        paidByCardId: linkedCard,
        status: 'pending',
        date: firstDay - 2 * DAY_MS,
      }),
    ],
    startedPayments: [
      {
        id: 'parity-started',
        cardId: linkedCard,
        startedOn: firstDay - 3 * DAY_MS,
        createdAt: firstDay - 3 * DAY_MS,
        amountCents: 10_000,
      },
    ],
  };
  return { link, accounts };
};

/** Charges waiting for a home that a rule can place: two posted, one pending, one another merchant's, so a batch shares its balances and a posted-only pass skips one. */
const waitingCharges = (sample: OpenPurchase, today: number): OpenPurchase[] =>
  [
    ['parity-rule-posted-a', 'posted', 'Parity Merchant', 41_234],
    ['parity-rule-posted-b', 'posted', 'Parity Merchant', 9_000_000],
    ['parity-rule-pending', 'pending', 'Parity Merchant', 2_500],
    ['parity-rule-other', 'posted', 'Other Merchant', 1_700],
  ].map(([id, status, merchant, cents]) => ({
    ...sample,
    id: id as string,
    source: 'link' as const,
    status: status as 'posted' | 'pending',
    merchant: merchant as string,
    label: null,
    amountCents: cents as number,
    needsHome: true,
    lines: [],
    assignedBy: null,
    ruleId: null,
    pairedWithId: null,
    incomeDayId: null,
    paidByCardId: null,
    emailWaiting: false,
    date: today - DAY_MS,
  }));

/** Bank charges dated the day before a link's day as the device reads it, for a link made in the device's early morning, and on that day for one made in its evening: each is history on the phone and not on a server that reads the link's day in another zone, or the reverse. The device's own zone is the one `process.env.TZ` holds. */
const buildHistoryCase = (
  sample: OpenPurchase,
  linked: OpenAccount,
  now: number,
) => {
  const day = new Date(now);
  const at = (hour: number) =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate() - 3, hour);
  const linkDay = Date.UTC(
    day.getFullYear(),
    day.getMonth(),
    day.getDate() - 3,
  );
  const cases = [
    {
      id: 'parity-history-morning',
      linkAt: at(2).getTime(),
      date: linkDay - DAY_MS,
    },
    { id: 'parity-history-evening', linkAt: at(20).getTime(), date: linkDay },
  ];
  return {
    links: cases.map(({ id, linkAt }) => ({
      id: `${id}-link`,
      createdAt: linkAt,
    })),
    accounts: cases.map(({ id }) => ({
      ...linked,
      id: `${id}-account`,
      linkId: `${id}-link`,
    })),
    charges: cases.map(({ id, linkAt, date }) => ({
      ...sample,
      id,
      source: 'link' as const,
      status: 'posted' as const,
      merchant: 'Parity Merchant',
      label: null,
      amountCents: 1_300,
      needsHome: true,
      lines: [],
      assignedBy: null,
      ruleId: null,
      pairedWithId: null,
      incomeDayId: null,
      paidByCardId: null,
      accountId: `${id}-account`,
      emailWaiting: false,
      createdAt: linkAt + 60_000,
      date,
    })),
  };
};

/** The placements a pass makes, as ids and lines only. */
const toPlacementKeys = (
  placements: ReturnType<typeof appPlanRulePlacements>,
) =>
  placements.map(({ purchase, rule, lines }) => ({
    purchaseId: purchase.id,
    ruleId: rule.id,
    lines,
  }));

/** The server reads a day in its own zone, UTC, unless the plan's zone is passed; the phone reads the device's. */
const inServerZone = <T>(run: () => T): T => {
  const device = process.env.TZ;
  process.env.TZ = 'UTC';
  try {
    return run();
  } finally {
    process.env.TZ = device;
  }
};

/** Rule placements through the app's selectors and through the server copy over the same documents: the same charges, rules and lines. */
const placementDiffs = (
  name: string,
  state: RootState,
  input: FiguresInput,
  today: number,
  expectsPlacement: boolean,
  links: readonly { id: string; createdAt: number }[],
  zone: string,
): string[] => {
  const envelopes = selectEnvelopes(state, today);
  const rule: OpenRule = {
    id: 'parity-rule',
    createdAt: 1,
    updatedAt: 1,
    merchantKey: toMerchantKey('Parity Merchant'),
    merchantName: 'Parity Merchant',
    category: null,
    cardId: null,
    target: envelopes[0].item.id,
  };
  const serverInput = { ...input, today, zone };
  const figures = serverComputeFigures(serverInput);
  const recentFrom = selectRecentFrom(state);
  const trackingPeriods = input.plan.trackingPeriods;
  return [false, true].flatMap((postedOnly) => {
    const app = appPlanRulePlacements(
      {
        level: selectLevel(state),
        today,
        needsHome: state.runway.needsHome,
        purchases: state.runway.purchases,
        rules: [rule],
        autoBills: selectAutoBills(state, today),
        accounts: selectAccounts(state),
        spill: {
          trackingPeriods,
          envelopes,
          assignedByItem: () => selectLedgerOnlyBalances(state).assignedByItem,
        },
        twinHeld: selectTwinHeldIds(state),
        isLinkHistory: selectIsLinkHistory(state),
      },
      { postedOnly },
    );
    const server = inServerZone(() =>
      serverPlanRulePlacements(
        toPlacementInput(
          {
            input: serverInput,
            figures,
            dirtyFrom: null,
            from: recentFrom ?? 0,
            readLists: () => Promise.reject(new Error('Not read here')),
          },
          { rules: [rule], links, matchKeys: {} },
          today,
        ),
        { postedOnly },
      ),
    );
    const found: string[] = [];
    diffValues(
      toPlacementKeys(app),
      toPlacementKeys(server),
      'placements',
      found,
    );
    return [
      ...found.map(
        (path) => `placements ${name} posted ${postedOnly}: ${path}`,
      ),
      ...(expectsPlacement && app.length === 0
        ? [`placements ${name} posted ${postedOnly}: nothing was placed`]
        : []),
    ];
  });
};

/** The app's own selectors, run over a store holding the same plan, against the engine's figures for today: one implementation, so they never disagree. */
const selectorDiffs = async (zone: string): Promise<string[]> => {
  process.env.TZ = zone;
  const now = Date.now();
  const today = todayAsUtcDate(now);
  const { docs } = await buildRunwayScaleDocs({
    uid: UID,
    encryption,
    now,
    years: 1,
    purchaseCount: 600,
  });
  const base = await openPlanInput(docs);
  const { link, accounts } = await buildLink(base, today);
  const sample = base.purchases[base.purchases.length - 1];
  const extras = waitingCharges(sample, today);
  const history = buildHistoryCase(sample, accounts[0], now);
  const linkInput = appToFiguresInput({
    ...link,
    zone: null,
    savedAccounts: accounts,
  });
  const inputs: [
    string,
    FiguresInput,
    boolean,
    { id: string; createdAt: number }[],
  ][] = [
    [
      'plan',
      { ...base, plan: { ...base.plan, trackingPeriods: [] } },
      false,
      [],
    ],
    ['track', base, false, []],
    ['track-waiting', { ...base, needsHome: extras }, true, []],
    [
      'link',
      { ...linkInput, needsHome: [...linkInput.needsHome, ...extras] },
      true,
      [],
    ],
    [
      'link-history',
      {
        ...base,
        accounts: [...base.accounts, ...history.accounts],
        needsHome: history.charges,
      },
      true,
      history.links,
    ],
  ];
  return inputs.flatMap(([name, input, expectsPlacement, links]) => {
    const state = {
      runway: {
        plan: input.plan,
        isLoaded: true,
        items: input.items,
        versions: input.versions,
        days: input.days,
        records: input.records,
        moves: input.moves,
        cards: input.cards,
        accounts: input.accounts,
        accountBalances: input.accountBalances,
        startedPayments: input.startedPayments,
        purchases: input.purchases,
        needsHome: input.needsHome,
        links,
        matchKeys: {},
        closing: null,
        closingFor: 'none',
        loadDay: today,
        failedRebuild: null,
      },
    } as unknown as RootState;
    const figures = appComputeFigures({ ...input, today, zone: null });
    const found: string[] = [];
    diffValues(selectBalances(state), figures.balances, 'balances', found);
    diffValues(selectBillCover(state), figures.billCover, 'billCover', found);
    diffValues(
      selectBankBacking(state),
      figures.bankBacking,
      'bankBacking',
      found,
    );
    diffValues(
      selectBillsDueBeforePay(state, today, 'want'),
      figures.dueBeforePay,
      'dueBeforePay',
      found,
    );
    return [
      ...found.map((path) => `selectors ${name}: ${path}`),
      ...placementDiffs(
        `${name} ${zone}`,
        state,
        input,
        today,
        expectsPlacement,
        links,
        zone,
      ),
    ];
  });
};

const FINGERPRINT_PATH = new URL(
  './runwayEngineFingerprint.json',
  import.meta.url,
);

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
  );
};

/** What the figures come to on the fixed fixture (`detail.assignedByItem`, added after the version was recorded, is left out; the balances it sums into are in): a change to it without a new `ENGINE_VERSION` would let phones accept figures from the old maths. */
const checkEngineVersion = (scenarios: Scenario[], firstDay: number) => {
  process.env.TZ = 'UTC';
  const figures = scenarios.map(({ name, input }) => [
    name,
    [0, 11, 29, 59].map((offset) => {
      const { detail, ...figures } = appComputeFigures({
        ...input,
        today: firstDay + offset * DAY_MS,
        zone: null,
      });
      return {
        ...figures,
        detail: Object.fromEntries(
          Object.entries(detail).filter(([key]) => key !== 'assignedByItem'),
        ),
      };
    }),
  ]);
  const hash = createHash('sha256')
    .update(JSON.stringify(sortKeys(figures)))
    .digest('hex');
  if (process.argv.includes('--update')) {
    writeFileSync(
      FINGERPRINT_PATH,
      `${JSON.stringify({ engineVersion: ENGINE_VERSION, hash }, null, 2)}\n`,
    );
    console.log(`Recorded the figures for engine version ${ENGINE_VERSION}.`);
    return;
  }
  const saved = JSON.parse(readFileSync(FINGERPRINT_PATH, 'utf8')) as {
    engineVersion: number;
    hash: string;
  };
  assert.ok(
    saved.engineVersion !== ENGINE_VERSION || saved.hash === hash,
    'The figures changed without a new ENGINE_VERSION: raise it in engine/engineConstants.ts, then run `npm run check:runway-server-parity -- --update`.',
  );
  assert.ok(
    saved.engineVersion === ENGINE_VERSION,
    `ENGINE_VERSION is ${ENGINE_VERSION} but the recorded figures are for ${saved.engineVersion}: run \`npm run check:runway-server-parity -- --update\`.`,
  );
};

const zones = [
  'America/Los_Angeles',
  'Pacific/Auckland',
  'Australia/Sydney',
  'UTC',
];

const main = async () => {
  const firstDay = Date.UTC(2026, 0, 20);
  const { docs } = await buildRunwayScaleDocs({
    uid: UID,
    encryption,
    now: firstDay + 15 * 3_600_000,
    years: 2,
    purchaseCount: 1_200,
  });
  const base = await openPlanInput(docs);
  const { link, accounts } = await buildLink(base, firstDay);
  const withAccounts = (copy: 'app' | 'server', zone: string | null) => {
    const make = copy === 'app' ? appToFiguresInput : serverToFiguresInput;
    return make({ ...link, zone, savedAccounts: accounts });
  };

  const plan: Scenario = {
    name: 'plan',
    input: { ...base, plan: { ...base.plan, trackingPeriods: [] } },
    zones: [null],
  };
  const track: Scenario = { name: 'track', input: base, zones: [null] };
  checkEngineVersion([plan, track], firstDay);
  const diffs = [
    ...(await zones.reduce<Promise<string[]>>(
      async (previous, zone) => [
        ...(await previous),
        ...(await selectorDiffs(zone)),
      ],
      Promise.resolve([]),
    )),
    ...runScenario(plan, firstDay),
    ...runScenario(track, firstDay),
    ...zones.flatMap((zone) => {
      process.env.TZ = zone;
      const appInput = withAccounts('app', null);
      const serverInput = withAccounts('server', zone);
      const found: string[] = [];
      diffValues(appInput.accounts, serverInput.accounts, 'accounts', found);
      const scenario = { name: `link ${zone}`, input: appInput, zones: [null] };
      return [
        ...found.map((path) => `link ${zone}: ${path}`),
        ...runScenario(scenario, firstDay),
      ];
    }),
  ];
  assert.equal(
    diffs.length,
    0,
    `The engine's copies or the app's selectors differ (${diffs.length} paths, first 40):\n${diffs.slice(0, 40).join('\n')}`,
  );
  console.log(
    `Figures and rule placements match across the app's selectors and the server copy: ${SPAN_DAYS} days across month ends, plan, track and link plans, ${zones.length} time zones.`,
  );
};

void main();
