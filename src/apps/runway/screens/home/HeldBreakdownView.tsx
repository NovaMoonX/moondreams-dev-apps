import { useState } from 'react';

import HelpTip from '@/components/HelpTip';
import SectionDivider from '@/components/SectionDivider';
import SensitiveValue from '@/components/SensitiveValue';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { BillSheet } from '@apps/runway/components/BillRow';
import ItemRow from '@apps/runway/components/ItemRow';
import { HELD_BREAKDOWN_WORDS } from '@apps/runway/constants';
import { BILL_COVER_DAYS } from '@apps/runway/engine/billCover';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';
import { selectBalances } from '@apps/runway/store/selectors/billCoverSelectors';
import {
  selectAllHorizonItems,
  selectBillPayments,
  selectBills,
  selectCards,
  selectEnvelopes,
  selectGoals,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { PlanSection } from '@apps/runway/types';
import { getCardName } from '@apps/runway/utils/cardText';
import { revealItem } from '@apps/runway/utils/revealItem';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

export type HeldKind = 'bills' | 'goals' | 'envelopes' | 'horizon' | 'cards';

interface HeldBreakdownViewProps {
  kind: HeldKind;
  name: string;
  totalCents: number;
}

interface HeldRow {
  id: string;
  name: string;
  emoji: string | null;
  detail: string | null;
  cents: number;
  onOpen: () => void;
}

interface Named {
  item: { id: string };
  version: { payload: { name: string; emoji: string | null } };
}

/** What one sum row of Free to Spend is made of: each item holding money for it, opening that item on Plan. */
function HeldBreakdownView({ kind, name, totalCents }: HeldBreakdownViewProps) {
  const balances = useAppSelector(selectBalances);
  const today = todayAsUtcDate(useNow(60_000));
  const bills = useAppSelector((state) => selectBills(state, today));
  const goals = useAppSelector((state) => selectGoals(state, today));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const horizon = useAppSelector((state) =>
    selectAllHorizonItems(state, today),
  );
  const cards = useAppSelector(selectCards);
  const items = useAppSelector((state) => state.runway.items);
  const versions = useAppSelector((state) => state.runway.versions);
  const newestPayload = versions.reduce<
    Map<string, { name: string; emoji: string | null; at: number }>
  >((acc, version) => {
    const seen = acc.get(version.itemId);
    return seen && seen.at >= version.createdAt
      ? acc
      : acc.set(version.itemId, {
          name: version.payload.name,
          emoji: 'emoji' in version.payload ? version.payload.emoji : null,
          at: version.createdAt,
        });
  }, new Map());
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const stance = useAppSelector(selectStance);
  const [openBill, setOpenBill] = useState<{
    id: string;
    step: string | null;
    dueOn: number | null;
    bill: (typeof bills)[number]['version']['payload'];
  } | null>(null);
  const openBillSheet = (
    id: string,
    step: string | null,
    dueOn: number | null,
  ) => {
    const entry = bills.find(({ item }) => item.id === id);
    if (entry) setOpenBill({ id, step, dueOn, bill: entry.version.payload });
    else void openOnPlan('bills', id);
  };
  const { leaveViewForTab, openItemAt } = useRunwayUrlState();
  const mask = useMaskedText();
  const { billCover } = balances;

  const openOnPlan = async (
    section: PlanSection,
    itemId: string,
    step: string | null = null,
  ) => {
    await leaveViewForTab('plan', section);
    revealItem(itemId);
    await openItemAt(itemId, step);
  };

  const ledgerOf = (id: string) => balances.assignedByItem[id] ?? 0;
  const heldOf = (id: string) => Math.max(0, ledgerOf(id));
  const getPlanRows = (
    section: PlanSection,
    itemKind: 'bill' | 'goal' | 'envelope' | 'horizon',
    resolved: readonly Named[],
    getCents: (id: string) => number,
    getDetail: (id: string, cents: number) => string | null = () => null,
    open: (id: string) => void = (id) => void openOnPlan(section, id),
  ): HeldRow[] => {
    const order = resolved.map(({ item }) => item.id);
    const rank = (id: string) =>
      order.includes(id) ? order.indexOf(id) : order.length;
    return items
      .filter(
        (item) =>
          item.kind === itemKind &&
          (item.heldReleasedOn === null || item.heldReleasedOn > today),
      )
      .map((item) => ({ id: item.id, cents: getCents(item.id) }))
      .filter((row) => row.cents !== 0)
      .sort((a, b) => rank(a.id) - rank(b.id))
      .map(({ id, cents }) => {
        const payload = newestPayload.get(id);
        return {
          id,
          name: payload?.name ?? '',
          emoji: payload?.emoji ?? null,
          detail: getDetail(id, cents),
          cents,
          onOpen: () => open(id),
        };
      });
  };

  const getBillDetail = (billId: string, putAside: number, covered: number) => {
    const nextDue = billCover.payments
      .filter(
        (payment) => payment.billId === billId && payment.coveredCents > 0,
      )
      .reduce<number | null>(
        (first, payment) =>
          first === null || payment.dueOn < first ? payment.dueOn : first,
        null,
      );
    const words = HELD_BREAKDOWN_WORDS;
    if (covered === 0) return null;
    const source =
      putAside > 0
        ? words.putAsideAndCovered(formatCents(putAside), formatCents(covered))
        : words.covered;
    return nextDue === null
      ? source
      : `${source} · ${words.due(formatDateOrdinalUTC(nextDue))}`;
  };

  const getRows = (): HeldRow[] => {
    if (kind === 'bills') {
      const coveredOf = (id: string) => billCover.coveredByBill[id] ?? 0;
      return getPlanRows(
        'bills',
        'bill',
        bills,
        (id) => ledgerOf(id) + coveredOf(id),
        (id) => getBillDetail(id, ledgerOf(id), coveredOf(id)),
        (id) => openBillSheet(id, null, null),
      );
    }
    if (kind === 'goals') return getPlanRows('goals', 'goal', goals, ledgerOf);
    if (kind === 'envelopes') {
      return getPlanRows('envelopes', 'envelope', envelopes, heldOf);
    }
    if (kind === 'horizon') {
      return getPlanRows('horizon', 'horizon', horizon, heldOf);
    }
    return cards.map((card) => ({
      id: card.id,
      name: getCardName(card, cards),
      emoji: null,
      detail: null,
      cents: Math.max(0, balances.reserveByCard[card.id] ?? 0),
      onOpen: () => void leaveViewForTab('plan', 'cards'),
    }));
  };
  const rows = getRows().filter((row) => row.cents !== 0);
  const shortPayments =
    kind === 'bills'
      ? billCover.payments.filter((payment) => payment.shortCents > 0)
      : [];

  const isPlanned = balances.isStarted && balances.hasMoney;
  const openBillEntry = bills.find(({ item }) => item.id === openBill?.id);

  return (
    <div className='space-y-4'>
      <div className='border-border bg-accent rounded-2xl border p-4'>
        <p className='text-muted-foreground flex items-center gap-1 text-sm font-medium'>
          {name}
          {kind === 'bills' && (
            <HelpTip title={name}>
              {HELD_BREAKDOWN_WORDS.coverRule(BILL_COVER_DAYS)}
            </HelpTip>
          )}
        </p>
        <p className='text-3xl font-semibold tracking-tight tabular-nums'>
          <SensitiveValue>{formatCents(totalCents)}</SensitiveValue>
        </p>
      </div>
      {rows.length === 0 && shortPayments.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {HELD_BREAKDOWN_WORDS.empty[kind]}
        </p>
      ) : (
        <>
          {rows.length > 0 && (
            <ul className='border-border bg-card divide-border divide-y rounded-2xl border'>
              {rows.map((row) => (
                <ItemRow
                  key={row.id}
                  itemId={row.id}
                  name={row.name}
                  emoji={row.emoji}
                  detail={row.detail}
                  figure={formatCents(row.cents)}
                  ariaLabel={mask(
                    `${row.name}, ${formatCents(row.cents)}${row.detail ? `. ${row.detail}` : ''}`,
                  )}
                  onOpen={row.onOpen}
                />
              ))}
            </ul>
          )}
          {shortPayments.length > 0 && (
            <div className='space-y-2'>
              <SectionDivider label={HELD_BREAKDOWN_WORDS.notCovered} />
              <ul className='border-border bg-card divide-border divide-y rounded-2xl border'>
                {shortPayments.map((payment) => {
                  const detail = isPlanned
                    ? HELD_BREAKDOWN_WORDS.short(
                        formatDateOrdinalUTC(payment.dueOn),
                      )
                    : HELD_BREAKDOWN_WORDS.shortSetStart;
                  return (
                    <ItemRow
                      key={`${payment.billId}:${payment.dueOn}`}
                      name={payment.name}
                      emoji={newestPayload.get(payment.billId)?.emoji ?? null}
                      detail={detail}
                      isDetailWarning
                      isDetailInked
                      figure={formatCents(payment.shortCents)}
                      ariaLabel={mask(
                        `${payment.name}, ${formatCents(payment.shortCents)}. ${detail}`,
                      )}
                      onOpen={() =>
                        openBillSheet(payment.billId, 'funding', payment.dueOn)
                      }
                    />
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
      {openBill && (
        <BillSheet
          key={openBill.id}
          billId={openBill.id}
          bill={openBillEntry?.version.payload ?? openBill.bill}
          payment={
            (payments[openBill.id] ?? []).find((entry) =>
              openBill.dueOn === null
                ? entry.dueOn >= today
                : entry.dueOn === openBill.dueOn,
            ) ?? null
          }
          planStance={stance}
          today={today}
          startsAtStep={openBill.step ?? undefined}
          onClose={() => setOpenBill(null)}
        />
      )}
    </div>
  );
}

export default HeldBreakdownView;
