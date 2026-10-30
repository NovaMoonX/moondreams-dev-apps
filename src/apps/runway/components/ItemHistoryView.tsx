import { useState } from 'react';

import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import ChangeRow from '@apps/runway/components/ChangeRow';
import {
  ITEM_HISTORY_PREVIEW,
  ITEM_VIEW_WORDS,
  MAX_WINDOW_CHANGES,
} from '@apps/runway/constants';
import { useItemChanges } from '@apps/runway/hooks/useItemChanges';

interface ItemHistoryViewProps {
  itemId: string;
}

/** Every change to one item over the past year, newest first. */
function ItemHistoryView({ itemId }: ItemHistoryViewProps) {
  const state = useItemChanges(itemId);
  const [isAll, setIsAll] = useState(false);
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
  if (state.changes === null) {
    return (
      <p className='text-muted-foreground text-sm'>
        {ITEM_VIEW_WORDS.historyLoading}
      </p>
    );
  }
  if (state.changes.length === 0) {
    return (
      <p className='text-muted-foreground text-sm'>
        {ITEM_VIEW_WORDS.historyEmpty}
      </p>
    );
  }
  const undoneMoveIds = new Set(
    state.changes.flatMap((change) =>
      change.move?.isUndo ? [change.move.moveId] : [],
    ),
  );
  const shown = isAll
    ? state.changes
    : state.changes.slice(0, ITEM_HISTORY_PREVIEW);
  return (
    <div className='space-y-1'>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {shown.map((change) => (
          <ChangeRow
            key={change.id}
            change={change}
            confirmedDayKey={null}
            onOpenRecord={() => undefined}
            undoneMoveIds={undoneMoveIds}
          />
        ))}
        {isCut && (isAll || state.changes.length <= ITEM_HISTORY_PREVIEW) && (
          <li className='text-muted-foreground p-3 text-sm'>
            {ITEM_VIEW_WORDS.historyOlder}
          </li>
        )}
      </ul>
      {state.changes.length > ITEM_HISTORY_PREVIEW && (
        <ShowMoreButton
          isOpen={isAll}
          onClick={() => setIsAll((open) => !open)}
        >
          {isAll ? 'Show fewer' : `Show all ${state.changes.length}`}
        </ShowMoreButton>
      )}
    </div>
  );
}

export default ItemHistoryView;
