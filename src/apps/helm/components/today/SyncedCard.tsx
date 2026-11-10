import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CalendarDays, ChevronRight } from 'lucide-react';

import AppLogo from '@/components/AppLogo';
import { readConnectorAppId } from '@/lib/connections/contract';
import { formatTime } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import type { SyncedRecord } from '@apps/helm/types';

interface SyncedCardProps {
  record: SyncedRecord;
  onOpen: (record: SyncedRecord) => void;
}

const timeLine = (record: SyncedRecord) => {
  if (record.isAllDay || record.startAt === null) return HELM_COPY.syncedAllDay;
  return record.endAt === null
    ? formatTime(record.startAt)
    : `${formatTime(record.startAt)} – ${formatTime(record.endAt)}`;
};

/** Another app's event: a plain card with the source's logo, read-only, that opens its source block. */
export function SyncedCard({ record, onOpen }: SyncedCardProps) {
  const isCalendar = record.connectorId === 'google:calendar';
  const detail = [
    timeLine(record),
    record.sealed.extra.isTentative === true ? HELM_COPY.syncedTentative : null,
    record.sealed.subtitle,
    record.sealed.placeLabel,
  ]
    .filter((part): part is string => !!part)
    .join(' · ');
  return (
    <Button
      type='button'
      variant='tertiary'
      className='helm-card flex h-auto min-h-14 w-full items-center justify-start gap-3 px-4 py-3 text-left'
      onClick={() => onOpen(record)}
    >
      {isCalendar ? (
        <span className='bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-lg'>
          <CalendarDays className='size-5' aria-hidden='true' />
        </span>
      ) : (
        <AppLogo
          appId={readConnectorAppId(record.connectorId) ?? ''}
          className='size-9 rounded-lg'
        />
      )}
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block text-[15px] leading-[21px] break-words'>
          {record.sealed.title}
        </span>
        <span className='text-muted-foreground block text-[13px] break-words'>
          {detail}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

/** Another app's task: a read-only row with no tick, since it is finished in its own app. */
export function SyncedTaskRow({ record, onOpen }: SyncedCardProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='flex h-auto min-h-12 w-full items-center justify-start gap-3 rounded-none border-0 px-4 py-3 text-left focus-visible:-outline-offset-2'
      onClick={() => onOpen(record)}
    >
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block text-[15px] leading-[21px] break-words'>
          {record.sealed.title}
        </span>
        {record.sealed.subtitle && (
          <span className='text-muted-foreground block text-[13px] break-words'>
            {record.sealed.subtitle}
          </span>
        )}
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default SyncedCard;
