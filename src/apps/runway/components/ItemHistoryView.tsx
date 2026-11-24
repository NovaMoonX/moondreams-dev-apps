import { useState, type ReactNode } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Flag,
  History as HistoryIcon,
  Receipt,
} from 'lucide-react';

import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { selectItemLooks } from '@apps/runway/store/selectors/runwaySelectors';
import { selectLevel } from '@apps/runway/store/selectors/levelSelectors';
import ChangeRow from '@apps/runway/components/ChangeRow';
import ItemRow from '@apps/runway/components/ItemRow';
import PurchaseRow from '@apps/runway/components/PurchaseRow';
import {
  ITEM_HISTORY_PREVIEW,
  ITEM_VIEW_WORDS,
  MAX_WINDOW_CHANGES,
  MOVE_WORDS,
  STORE_ORDER_WORDS,
} from '@apps/runway/constants';
import type { ItemMoneyRow } from '@apps/runway/engine/itemMoney';
import { useItemChanges } from '@apps/runway/hooks/useItemChanges';
import { useItemMoney } from '@apps/runway/hooks/useItemMoney';
import {
  describeHeldAfter,
  getPurchaseTitle,
  readPurchaseChange,
} from '@apps/runway/utils/purchaseText';
import type { OpenChange } from '@apps/runway/types';

interface ItemHistoryViewProps {
  itemId: string;
  /** Opens a purchase from its row; without it a purchase row opens nothing. */
  onOpenPurchase?: (purchaseId: string) => void;
}

type Entry =
  | {
      type: 'money';
      day: number;
      row: ItemMoneyRow;
      notes: OpenChange[];
      /** The log entry of a move or paid mark, which keeps its Take back. */
      moveChange: OpenChange | null;
    }
  | { type: 'change'; day: number; change: OpenChange };

/** The calendar day a change was made on, as a date-only value, so it sorts beside dated money. */
const toDay = (instant: number) => {
  const at = new Date(instant);
  return Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
};

const iconTile = (icon: ReactNode) => (
  <span
    className='border-border bg-accent text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl border'
    aria-hidden='true'
  >
    {icon}
  </span>
);

const STORE_REFUND = new RegExp(
  `^${STORE_ORDER_WORDS.refundSummary('\u0001', '\u0002')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace('\u0001', '(.+)')
    .replace('\u0002', '(.+)')}$`,
);

const signed = (cents: number) =>
  cents > 0 ? `+${formatCents(cents)}` : formatCents(-cents);

/** Every change to one item over the past year, newest first; for an envelope, goal or Horizon item each row that moved its money also shows what it held after, as a bank shows a balance. */
function ItemHistoryView({ itemId, onOpenPurchase }: ItemHistoryViewProps) {
  const state = useItemChanges(itemId);
  const money = useItemMoney(itemId);
  const [isAll, setIsAll] = useState(false);
  const looks = useAppSelector(selectItemLooks);
  const level = useAppSelector(selectLevel);
  const kind = useAppSelector(
    (current) =>
      current.runway.items.find((item) => item.id === itemId)?.kind ?? null,
  );
  const itemName = looks.get(itemId)?.name ?? null;
  const startDate = useAppSelector(
    (current) => current.runway.plan?.startDate ?? null,
  );
  const isCut =
    (state.changes?.length ?? 0) >= MAX_WINDOW_CHANGES ||
    (startDate !== null && startDate < state.from);

  if (state.isFailed) {
    return (
      <p className='text-muted-foreground text-sm'>
        {ITEM_VIEW_WORDS.historyFailed}
      </p>
    );
  }
  if (state.changes === null || (money !== null && !money.isReady)) {
    return (
      <p className='text-muted-foreground text-sm'>
        {ITEM_VIEW_WORDS.historyLoading}
      </p>
    );
  }
  const moneyRows = money?.rows ?? [];
  if (state.changes.length === 0 && moneyRows.length === 0) {
    return (
      <p className='text-muted-foreground text-sm'>
        {ITEM_VIEW_WORDS.historyEmpty}
      </p>
    );
  }
  const nameOf = (id: string) => looks.get(id)?.name ?? 'An envelope';
  const purchaseRows = moneyRows.filter(
    (row): row is Extract<ItemMoneyRow, { kind: 'purchase' }> =>
      row.kind === 'purchase',
  );
  const findPurchaseRow = (change: OpenChange) => {
    if (change.kind !== 'purchaseChange' || change.isUnreadable) return null;
    const refund = STORE_REFUND.exec(change.summary.trim());
    if (refund !== null) {
      const matches = purchaseRows.filter(
        (row) =>
          row.cents > 0 &&
          refund[2] === itemName &&
          getPurchaseTitle(row.purchase, nameOf) === refund[1],
      );
      return matches.length === 1 ? matches[0].id : null;
    }
    const parts = readPurchaseChange(change.summary);
    if (parts === null) return null;
    const named = purchaseRows.filter(
      (row) => getPurchaseTitle(row.purchase, nameOf) === parts.title,
    );
    const dated =
      parts.date === ''
        ? named
        : named.filter((row) => formatDateOrdinalUTC(row.on) === parts.date);
    return dated.length === 1 ? dated[0].id : null;
  };
  const notesByRow = state.changes.reduce<Map<string, OpenChange[]>>(
    (acc, change) => {
      const rowId = findPurchaseRow(change);
      return rowId === null
        ? acc
        : new Map(acc).set(rowId, [...(acc.get(rowId) ?? []), change]);
    },
    new Map(),
  );
  const moneyIds = new Set(moneyRows.map((row) => row.id));
  const moveChangeByRow = new Map(
    state.changes.flatMap((change): [string, OpenChange][] => {
      if (change.move === null || change.move.isUndo) return [];
      const rowId = [
        change.move.moveId,
        `${change.move.moveId}_${itemId}`,
      ].find((id) => moneyIds.has(id));
      return rowId === undefined ? [] : [[rowId, change]];
    }),
  );
  const folded = new Set([
    ...[...notesByRow.values()].flat().map((change) => change.id),
    ...[...moveChangeByRow.values()].map((change) => change.id),
  ]);
  const entries: Entry[] = [
    ...moneyRows.map((row): Entry => ({
      type: 'money',
      day: row.on,
      row,
      notes: notesByRow.get(row.id) ?? [],
      moveChange: moveChangeByRow.get(row.id) ?? null,
    })),
    ...state.changes
      .filter((change) => !folded.has(change.id))
      .map((change): Entry => ({
        type: 'change',
        day: toDay(change.createdAt),
        change,
      })),
  ].sort(
    (a, b) =>
      b.day - a.day || (a.type === b.type ? 0 : a.type === 'money' ? -1 : 1),
  );
  const undoneMoveIds = new Set(
    state.changes.flatMap((change) =>
      change.move?.isUndo ? [change.move.moveId] : [],
    ),
  );
  const moneyKind =
    kind === 'envelope' || kind === 'goal' || kind === 'horizon' ? kind : null;

  const renderMoney = (
    row: ItemMoneyRow,
    notes: OpenChange[],
    moveChange: OpenChange | null,
  ) => {
    const held =
      moneyKind === null
        ? null
        : describeHeldAfter(moneyKind, level, row.heldAfterCents);
    const day = formatDateOrdinalUTC(row.on);
    const common =
      row.kind === 'earlier'
        ? {
            figure: held?.value ?? signed(row.cents),
            figureWord: held?.word ?? null,
            isFigureWordOver: held?.isOver ?? false,
          }
        : {
            figure: signed(row.cents),
            figureWord: held?.text ?? null,
            isFigureWordOver: held?.isOver ?? false,
          };
    if (row.kind === 'purchase') {
      const parts = notes.flatMap((change) => {
        const read = readPurchaseChange(change.summary);
        return read === null ? [] : [read];
      });
      const extraFacts = [
        parts.some((part) => part.action.startsWith('Changed'))
          ? ITEM_VIEW_WORDS.moneyEdited
          : null,
        parts.some((part) => part.rule !== null)
          ? ITEM_VIEW_WORDS.moneyByRule
          : null,
      ].flatMap((fact) => (fact === null ? [] : [fact]));
      return (
        <PurchaseRow
          key={row.id}
          purchase={row.purchase}
          looks={looks}
          isBrief
          shareCents={row.cents}
          figureWord={common.figureWord}
          isFigureWordOver={common.isFigureWordOver}
          extraFacts={extraFacts}
          onOpen={
            onOpenPurchase === undefined
              ? undefined
              : () => onOpenPurchase(row.id)
          }
        />
      );
    }
    const look = describeOther(row);
    const detail =
      row.kind === 'earlier'
        ? ITEM_VIEW_WORDS.moneyEarlierDetail(formatDateOrdinalUTC(row.before))
        : day;
    const rowLook = {
      name: look.name,
      leading: iconTile(look.icon),
      detail,
      ...common,
      isFigureNarrow: true,
      ariaLabel: `${look.name}, ${common.figure}, ${detail}${common.figureWord ? `, ${common.figureWord}` : ''}`,
    };
    return moveChange === null ? (
      <ItemRow key={row.id} {...rowLook} />
    ) : (
      <ChangeRow
        key={row.id}
        change={moveChange}
        confirmedDayKey={null}
        onOpenRecord={() => undefined}
        undoneMoveIds={undoneMoveIds}
        moneyRow={rowLook}
      />
    );
  };

  const describeOther = (
    row: Exclude<ItemMoneyRow, { kind: 'purchase' }>,
  ): { name: string; icon: ReactNode } => {
    if (row.kind === 'start') {
      return {
        name: ITEM_VIEW_WORDS.moneyStart,
        icon: <Flag className='h-4 w-4' />,
      };
    }
    if (row.kind === 'earlier') {
      return {
        name: ITEM_VIEW_WORDS.moneyEarlier,
        icon: <HistoryIcon className='h-4 w-4' />,
      };
    }
    if (row.kind === 'pay') {
      return {
        name:
          (row.payLineId === null ? null : looks.get(row.payLineId)?.name) ??
          ITEM_VIEW_WORDS.moneyPay,
        icon: <ArrowDownLeft className='h-4 w-4' />,
      };
    }
    if (row.kind === 'paid') {
      return {
        name:
          row.ownerId === itemId
            ? ITEM_VIEW_WORDS.moneyPaid
            : ITEM_VIEW_WORDS.moneyWentTo(
                looks.get(row.ownerId)?.name ?? ITEM_VIEW_WORDS.moneyPaid,
              ),
        icon: <Receipt className='h-4 w-4' />,
      };
    }
    const other =
      row.otherId === null
        ? row.isOutside
          ? null
          : MOVE_WORDS.freeToSpend
        : (looks.get(row.otherId)?.name ?? MOVE_WORDS.freeToSpend);
    const isIn = row.cents > 0;
    return {
      name:
        other === null
          ? isIn
            ? ITEM_VIEW_WORDS.moneyOutsideIn
            : ITEM_VIEW_WORDS.moneyOutsideOut
          : isIn
            ? ITEM_VIEW_WORDS.moneyFrom(other)
            : ITEM_VIEW_WORDS.moneyTo(other),
      icon: isIn ? (
        <ArrowDownLeft className='h-4 w-4' />
      ) : (
        <ArrowUpRight className='h-4 w-4' />
      ),
    };
  };

  const shown = isAll ? entries : entries.slice(0, ITEM_HISTORY_PREVIEW);
  return (
    <div className='space-y-1'>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {shown.map((entry) =>
          entry.type === 'money' ? (
            renderMoney(entry.row, entry.notes, entry.moveChange)
          ) : (
            <ChangeRow
              key={entry.change.id}
              change={entry.change}
              confirmedDayKey={null}
              onOpenRecord={() => undefined}
              undoneMoveIds={undoneMoveIds}
              itemName={itemName}
            />
          ),
        )}
        {isCut && (isAll || entries.length <= ITEM_HISTORY_PREVIEW) && (
          <li className='text-muted-foreground p-3 text-sm'>
            {ITEM_VIEW_WORDS.historyOlder}
          </li>
        )}
      </ul>
      {entries.length > ITEM_HISTORY_PREVIEW && (
        <ShowMoreButton
          isOpen={isAll}
          onClick={() => setIsAll((open) => !open)}
        >
          {isAll ? 'Show fewer' : `Show all ${entries.length}`}
        </ShowMoreButton>
      )}
    </div>
  );
}

export default ItemHistoryView;
