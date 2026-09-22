import { useMemo } from 'react';

import { Badge, Disclosure } from '@moondreamsdev/dreamer-ui/components';

import { useUserInfo } from '@/hooks/useUserInfo';
import { formatDateTime } from '@/utils/formatUtils';
import { EVENT_FIELD_LABELS } from '@apps/waypoint/constants';
import type { EventChangeSnapshot, EventFieldChange } from '@apps/waypoint/types';

interface ChangeBadgeProps {
  changeHistory: EventChangeSnapshot[];
}

function formatPreviousValue(field: EventFieldChange['field'], value: number | string) {
  if (field === 'startAt' || field === 'endAt') {
    return formatDateTime(value as number);
  }
  if (field === 'dayIndex' || field === 'endDayIndex') {
    return `Day ${(value as number) + 1}`;
  }

  return String(value);
}

export function ChangeBadge({ changeHistory }: ChangeBadgeProps) {
  const changedByIds = useMemo(
    () =>
      Array.from(
        new Set(
          changeHistory.flatMap((snapshot) => snapshot.changes.map((change) => change.changedBy)),
        ),
      ),
    [changeHistory],
  );
  const members = useUserInfo(changedByIds)?.map ?? {};
  const getEditorName = (uid: string) =>
    members[uid]?.displayName || members[uid]?.email || 'Someone';

  if (changeHistory.length === 0) {
    return null;
  }

  const latest = changeHistory[changeHistory.length - 1];

  return (
    <Disclosure
      label={
        <Badge variant='muted' className='cursor-pointer'>
          Edited by {getEditorName(latest.latestChangedBy)} ·{' '}
          {formatDateTime(latest.latestChangedAt)}
        </Badge>
      }
      className='mt-2'
    >
      <ul className='text-muted-foreground mt-2 space-y-2 text-sm'>
        {[...changeHistory].reverse().map((snapshot, snapshotIndex) => (
          <li key={snapshotIndex} className='space-y-1'>
            {snapshot.changes.map((change, changeIndex) => (
              <p key={changeIndex}>
                {EVENT_FIELD_LABELS[change.field]} was{' '}
                {formatPreviousValue(change.field, change.previousValue)} — changed by{' '}
                {getEditorName(change.changedBy)} on {formatDateTime(change.changedAt)}
              </p>
            ))}
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

export default ChangeBadge;
