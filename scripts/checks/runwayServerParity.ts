// `npm run check:runway-server-parity` runs the app's figures engine and its server copy on the same plans, 60 days in a row across month ends, and fails on any difference. Only ids and paths are printed, never amounts.
import assert from 'node:assert/strict';

import {
  computeFigures as appComputeFigures,
  toFiguresInput as appToFiguresInput,
  type FiguresInput,
} from '../../src/apps/runway/engine/figures.ts';
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
    ],
    purchases: [
      ...base.purchases,
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

/** The app's own selectors, run over a store holding the same plan, against the engine's figures for today: one implementation, so they never disagree. */
const selectorDiffs = async (): Promise<string[]> => {
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
  const inputs: [string, FiguresInput][] = [
    ['plan', { ...base, plan: { ...base.plan, trackingPeriods: [] } }],
    ['track', base],
    [
      'link',
      appToFiguresInput({ ...link, zone: null, savedAccounts: accounts }),
    ],
  ];
  return inputs.flatMap(([name, input]) => {
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
    return found.map((path) => `selectors ${name}: ${path}`);
  });
};

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
  const zones = ['America/Los_Angeles', 'Pacific/Auckland', 'UTC'];
  const diffs = [
    ...(await selectorDiffs()),
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
    `Figures match across the app's selectors and the server copy: ${SPAN_DAYS} days across month ends, plan, track and link plans, ${zones.length} time zones.`,
  );
};

void main();
