import PlanChangeRow from '@apps/runway/components/PlanChangeRow';
import type { PlanChange } from '@apps/runway/engine/planChanges';
import { getChangeRef } from '@apps/runway/utils/comingChangeText';

interface ComingChangesListProps {
  changes: readonly PlanChange[];
  today: number;
  textOf?: (change: PlanChange) => string;
  /** Opens a change inside the sheet that holds the list; without it each row opens its own item's sheet. */
  onOpen?: (change: PlanChange) => void;
}

/** Changes in date order, each opening its own sheet: the list behind "3 coming changes" and a day's "5 things change". */
function ComingChangesList({
  changes,
  today,
  textOf,
  onOpen,
}: ComingChangesListProps) {
  return (
    <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
      {changes.map((change) => (
        <PlanChangeRow
          key={`${getChangeRef(change).changeId}${change.on}`}
          change={change}
          today={today}
          text={textOf?.(change)}
          onOpen={onOpen ? () => onOpen(change) : undefined}
        />
      ))}
    </ul>
  );
}

export default ComingChangesList;
