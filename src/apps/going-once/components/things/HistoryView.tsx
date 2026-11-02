import BackLink from '@/components/BackLink';
import { usePersonNames } from '@apps/going-once/hooks/usePersonNames';
import type { Item } from '@apps/going-once/types';
import {
  describeStatusChange,
  formatChangeTime,
} from '@apps/going-once/utils/status';

interface HistoryViewProps {
  item: Item;
  uid: string;
  onBack: () => void;
}

/** A thing's status changes, newest first: what happened, who and when. Read-only. */
function HistoryView({ item, uid, onBack }: HistoryViewProps) {
  const getName = usePersonNames(
    item.statusHistory.map((change) => change.byUid),
    uid,
  );
  const changes = [...item.statusHistory].reverse();

  return (
    <div className='space-y-5'>
      <BackLink onBack={onBack} label='History' />
      {changes.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          Nothing has changed yet. Marking it pending or sold shows up here.
        </p>
      ) : (
        <ul className='divide-border border-border divide-y overflow-hidden rounded-2xl border'>
          {changes.map((change) => (
            <li key={`${change.at}-${change.status}`} className='px-3 py-2.5'>
              <p className='break-words'>
                {describeStatusChange(change)} · {getName(change.byUid)} ·{' '}
                {formatChangeTime(change.at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default HistoryView;
