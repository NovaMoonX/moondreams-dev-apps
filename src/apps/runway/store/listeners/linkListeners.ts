import { collection, onSnapshot, type Unsubscribe } from 'firebase/firestore';

import { db } from '@lib/firebase/config';

import { createSealedReader } from '@apps/runway/security';
import type {
  AccountBalanceDoc,
  CardDetailsAnswer,
  CardStatementDoc,
  CardStatementSealed,
  LinkDoc,
  LinkSealed,
  OpenAccountBalance,
  OpenCardStatement,
  OpenRecurringCharges,
  RecurringChargesDoc,
  RecurringChargesSealed,
  RecurringStream,
  OpenLink,
  OpenReleasedCharge,
  ReleasedChargeDoc,
  ReleasedChargeSealed,
  RunwayEncryption,
} from '@apps/runway/types';
import { RECURRING_FREQUENCIES, RECURRING_STATUSES } from '@apps/runway/types';

const toError = (error: unknown) =>
  error instanceof Error ? error : new Error('The plan did not open.');

/** Opens every document of one collection under the plan, keeping the newest snapshot and dropping a slow one that lands late. */
function startOpenedListener<TDoc extends { id: string }, TOpen>(
  uid: string,
  collectionName: string,
  open: (data: TDoc) => Promise<TOpen>,
  onChange: (opened: TOpen[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const sequence = { latest: 0 };
  const run = { isStopped: false };

  const stop = onSnapshot(
    collection(db, 'apps', 'runway', 'plans', uid, collectionName),
    async (snapshot) => {
      sequence.latest += 1;
      const current = sequence.latest;
      /* Bank data is optional: a document that won't open is left out rather than closing the plan. */
      const opened = await Promise.all(
        snapshot.docs.map((entry) =>
          open(entry.data() as TDoc).catch((error: unknown) => {
            console.error(`An unreadable ${collectionName} document`, error);
            return null;
          }),
        ),
      );
      if (current !== sequence.latest || run.isStopped) return;
      onChange(
        opened.filter((entry): entry is Awaited<TOpen> => entry !== null),
      );
    },
    (error) => onError(toError(error)),
  );

  return () => {
    run.isStopped = true;
    stop();
  };
}

/** Every link the bank sign-ins made; Functions write them, this only reads. */
const toCardDetails = (
  data: Pick<LinkDoc, 'cardDetails' | 'needsCardConsent'>,
): CardDetailsAnswer | null => {
  const value: unknown = data.cardDetails;
  if (value === 'shared' || value === 'needsConsent' || value === 'unsupported')
    return value;
  return data.needsCardConsent === true ? 'needsConsent' : null;
};

export function startLinksListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (links: OpenLink[]) => void,
  onError: (error: Error) => void,
) {
  const read = createSealedReader(encryption);
  return startOpenedListener<LinkDoc, OpenLink>(
    uid,
    'links',
    async (data) => {
      const payload = await read<Partial<LinkSealed>>(data.sealed);
      return {
        id: data.id,
        status: data.status,
        lastSyncAt: data.lastSyncAt ?? null,
        needsCardConsent: data.needsCardConsent === true,
        cardDetails: toCardDetails(data),
        createdAt: data.createdAt,
        institutionName: payload.institutionName ?? '',
        institutionLogo: payload.institutionLogo?.startsWith(
          'data:image/png;base64,',
        )
          ? payload.institutionLogo
          : null,
        providerAccounts: (payload.providerAccounts ?? []).map((entry) => ({
          ...entry,
          mask: entry.mask ?? null,
          balanceCents: entry.balanceCents ?? null,
          accountId: entry.accountId ?? null,
          cardId: entry.cardId ?? null,
          isSkipped: entry.isSkipped ?? false,
        })),
      };
    },
    onChange,
    onError,
  );
}

/** What the bank last said each linked account or card holds, keyed by the account or card id. */
export function startAccountBalancesListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (balances: OpenAccountBalance[]) => void,
  onError: (error: Error) => void,
) {
  const read = createSealedReader(encryption);
  return startOpenedListener<AccountBalanceDoc, OpenAccountBalance>(
    uid,
    'accountBalances',
    async (data) => {
      const payload = await read<{
        cents: number;
        availableCents?: number | null;
        limitCents?: number | null;
        hasInstantBalance?: boolean | null;
      }>(data.sealed);
      return {
        id: data.id,
        asOf: data.asOf,
        cents: payload.cents,
        availableCents: payload.availableCents ?? null,
        limitCents: payload.limitCents ?? null,
        hasInstantBalance: payload.hasInstantBalance ?? null,
      };
    },
    onChange,
    onError,
  );
}

/** What the bank's latest statement says about each linked card (minimum, balance, due date), keyed by the card id. */
export function startCardStatementsListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (statements: OpenCardStatement[]) => void,
  onError: (error: Error) => void,
) {
  const read = createSealedReader(encryption);
  return startOpenedListener<CardStatementDoc, OpenCardStatement>(
    uid,
    'cardStatements',
    async (data) => {
      const payload = await read<Partial<CardStatementSealed>>(data.sealed);
      return {
        id: data.id,
        asOf: data.asOf,
        minimumCents: payload.minimumCents ?? null,
        statementCents: payload.statementCents ?? null,
        statementOn: payload.statementOn ?? null,
        dueOn: payload.dueOn ?? null,
        lastPaymentCents: payload.lastPaymentCents ?? null,
        lastPaymentOn: payload.lastPaymentOn ?? null,
      };
    },
    onChange,
    onError,
  );
}

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value !== '';

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const toStream = (raw: unknown): RecurringStream[] => {
  if (typeof raw !== 'object' || raw === null) return [];
  const value = raw as Record<string, unknown>;
  const frequency = RECURRING_FREQUENCIES.find(
    (one) => one === value.frequency,
  );
  const status = RECURRING_STATUSES.find((one) => one === value.status);
  if (
    !isText(value.streamId) ||
    !isText(value.providerAccountId) ||
    !frequency ||
    !status ||
    !isCount(value.averageCents) ||
    !isCount(value.lastCents) ||
    !isCount(value.firstOn) ||
    !isCount(value.lastOn)
  ) {
    return [];
  }
  return [
    {
      streamId: value.streamId,
      providerAccountId: value.providerAccountId,
      description:
        typeof value.description === 'string' ? value.description : '',
      merchantName: isText(value.merchantName) ? value.merchantName : null,
      frequency,
      averageCents: value.averageCents,
      lastCents: value.lastCents,
      firstOn: value.firstOn,
      lastOn: value.lastOn,
      nextOn: isCount(value.nextOn) ? value.nextOn : null,
      status,
      isActive: value.isActive === true,
      category: isText(value.category) ? value.category : null,
    },
  ];
};

/** The repeating charges the bank found on each linked account, keyed by the link id. */
export function startRecurringChargesListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (charges: OpenRecurringCharges[]) => void,
  onError: (error: Error) => void,
) {
  const read = createSealedReader(encryption);
  return startOpenedListener<RecurringChargesDoc, OpenRecurringCharges>(
    uid,
    'recurringCharges',
    async (data) => {
      const payload = await read<Partial<RecurringChargesSealed>>(data.sealed);
      return {
        id: data.id,
        asOf: data.asOf,
        streams: Array.isArray(payload.streams)
          ? payload.streams.flatMap(toStream)
          : [],
      };
    },
    onChange,
    onError,
  );
}

/** Notes Functions leave when the bank drops a pending charge the person had placed; read once and deleted by the app. */
export function startReleasedChargesListener(
  uid: string,
  encryption: RunwayEncryption,
  onChange: (charges: OpenReleasedCharge[]) => void,
  onError: (error: Error) => void,
) {
  const read = createSealedReader(encryption);
  return startOpenedListener<ReleasedChargeDoc, OpenReleasedCharge>(
    uid,
    'releasedCharges',
    async (data) => {
      const payload = await read<ReleasedChargeSealed>(data.sealed);
      return {
        id: data.id,
        date: data.date,
        title: payload.title ?? null,
        amountCents: payload.amountCents,
        lines: payload.lines ?? [],
      };
    },
    onChange,
    onError,
  );
}
