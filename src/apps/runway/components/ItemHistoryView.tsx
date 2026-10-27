import { useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import ChangeRow from '@apps/runway/components/ChangeRow';
import { ITEM_VIEW_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { startChangesListener } from '@apps/runway/store/listeners/changeListeners';
import type { OpenChange } from '@apps/runway/types';
import { getChangeWindow } from '@apps/runway/utils/changeWindow';

interface ItemHistoryViewProps {
  itemId: string;
}

const YEAR_DAYS = 365;

/** Every change to one item over the past year, newest first, read by this view alone so the sheet it sits in stays where it was. */
function ItemHistoryView({ itemId }: ItemHistoryViewProps) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const [state, setState] = useState<{
    changes: OpenChange[] | null;
    isFailed: boolean;
  }>({ changes: null, isFailed: false });

  useEffect(() => {
    if (!uid) return;
    const run = { isCurrent: true };
    const stop: { current: (() => void) | null } = { current: null };
    const window = getChangeWindow(todayAsUtcDate(), YEAR_DAYS, 0);
    getRunwayEncryption(uid)
      .then((encryption) => {
        if (!run.isCurrent) return;
        stop.current = startChangesListener(
          uid,
          encryption,
          { from: window.from, to: window.to, itemId },
          (changes) => setState({ changes, isFailed: false }),
          (error) => {
            console.error('The history did not open', error);
            setState({ changes: null, isFailed: true });
          },
        );
      })
      .catch(() => {
        if (run.isCurrent) setState({ changes: null, isFailed: true });
      });
    return () => {
      run.isCurrent = false;
      stop.current?.();
    };
  }, [uid, itemId]);

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
    </ul>
  );
}

export default ItemHistoryView;
