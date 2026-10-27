import { useAppSelector } from '@/store';
import ChangeRow from '@apps/runway/components/ChangeRow';
import { ITEM_VIEW_WORDS, MAX_WINDOW_CHANGES } from '@apps/runway/constants';
import { useItemChanges } from '@apps/runway/hooks/useItemChanges';

interface ItemHistoryViewProps {
  itemId: string;
}

/** Every change to one item over the past year, newest first. */
function ItemHistoryView({ itemId }: ItemHistoryViewProps) {
  const state = useItemChanges(itemId);
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
  return (
    <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
      {state.changes.map((change) => (
        <ChangeRow
          key={change.id}
          change={change}
          confirmedDayKey={null}
          onOpenRecord={() => undefined}
        />
      ))}
      {isCut && (
        <li className='text-muted-foreground p-3 text-sm'>
          {ITEM_VIEW_WORDS.historyOlder}
        </li>
      )}
    </ul>
  );
}

export default ItemHistoryView;
