import { useState } from 'react';
import { createSelector } from '@reduxjs/toolkit';

import SectionDivider from '@/components/SectionDivider';
import type { RootState } from '@/store';
import { useAppSelector } from '@/store';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import ItemRow from '@apps/runway/components/ItemRow';
import ItemSheet from '@apps/runway/components/ItemSheet';
import { HELD_WORDS } from '@apps/runway/constants';
import { resolveCurrentOrNext } from '@apps/runway/engine/resolve';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectAllPurposeEmojis } from '@apps/runway/store/selectors/runwaySelectors';
import { resolveItemEmoji } from '@apps/runway/utils/purposeEmoji';

type HoldingKind = 'envelope' | 'bill' | 'goal';

interface StoppedRow {
  itemId: string;
  name: string;
  emoji: string | null;
  cents: number;
  fact: string;
}

/** The items of a kind that stopped (archived, or past their last day) and still keep their money, so their sheet can release it. */
const selectStoppedHolding = createSelector(
  [
    (state: RootState) => state.runway.items,
    (state: RootState) => state.runway.versions,
    selectBalances,
    selectAllPurposeEmojis,
    (_state: RootState, on: number) => on,
    (_state: RootState, _on: number, kind: HoldingKind) => kind,
  ],
  (items, versions, balances, purposeEmojis, on, kind): StoppedRow[] => {
    const result = items
      .filter(
        (item) =>
          item.kind === kind &&
          item.heldReleasedOn === null &&
          ((item.archivedAt !== null && item.archivedAt <= on) ||
            (item.endedAt !== null && item.endedAt < on)) &&
          (balances.assignedByItem[item.id] ?? 0) > 0,
      )
      .flatMap((item) => {
        const version = resolveCurrentOrNext(versions, item.id, on);
        if (!version || version.kind !== kind) return [];
        const row: StoppedRow = {
          itemId: item.id,
          name: version.payload.name,
          emoji: resolveItemEmoji(
            version.payload.emoji,
            'groupId' in version.payload ? version.payload.groupId : null,
            purposeEmojis,
          ),
          cents: balances.assignedByItem[item.id] ?? 0,
          fact:
            item.archivedAt !== null
              ? HELD_WORDS.archived
              : HELD_WORDS.ended(formatDateShortUTC(item.endedAt ?? on)),
        };
        return [row];
      })
      .sort((a, b) => a.name.localeCompare(b.name));
    return result;
  },
);

interface StoppedHoldingListProps {
  kind: HoldingKind;
  today: number;
}

/** Stopped items that still hold money, under their own divider at the end of a Plan view; each opens its sheet, which can release it. Draws nothing when there are none. */
function StoppedHoldingList({ kind, today }: StoppedHoldingListProps) {
  const rows = useAppSelector((state) =>
    selectStoppedHolding(state, today, kind),
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((row) => row.itemId === openId) ?? null;

  if (rows.length === 0) return null;
  return (
    <div className='space-y-2'>
      <SectionDivider label={HELD_WORDS.stoppedDivider} />
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {rows.map((row) => (
          <ItemRow
            key={row.itemId}
            name={row.name}
            emoji={row.emoji}
            detail={row.fact}
            figure={formatCentsShort(row.cents)}
            ariaLabel={`${row.name}, ${row.fact}, holds ${formatCentsShort(row.cents)}. Open`}
            onOpen={() => setOpenId(row.itemId)}
          />
        ))}
      </ul>
      {open && (
        <ItemSheet
          itemId={open.itemId}
          kind={kind}
          today={today}
          figureLabel={HELD_WORDS.holds}
          figure={formatCents(open.cents)}
          fact={open.fact}
          canChange={false}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  );
}

export default StoppedHoldingList;
