import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CalendarDays, ChevronRight } from 'lucide-react';

import AppLogo from '@/components/AppLogo';
import { readConnectorAppId } from '@/lib/connections/contract';
import { formatDateShort, formatTime } from '@/utils/formatUtils';
import DiscrepancyLine from '@apps/helm/components/today/DiscrepancyLine';
import { HELM_COPY } from '@apps/helm/constants';
import { findOtherTime, findPlace } from '@apps/helm/engine/authority';
import { useSourceAppName } from '@apps/helm/hooks/useSourceAppName';
import type { SyncedRecord } from '@apps/helm/types';

interface SyncedCardProps {
  record: SyncedRecord;
  onOpen: (record: SyncedRecord) => void;
}

interface EventCardProps extends SyncedCardProps {
  /** The same event's copies from other sources, shown as a second mark. */
  alsoIn: SyncedRecord[];
}

function SourceMark({
  record,
  className,
}: {
  record: SyncedRecord;
  className: string;
}) {
  return record.connectorId === 'google:calendar' ? (
    <span
      className={`bg-muted text-muted-foreground flex shrink-0 items-center justify-center ${className}`}
    >
      <CalendarDays className='size-[55%]' aria-hidden='true' />
    </span>
  ) : (
    <AppLogo
      appId={readConnectorAppId(record.connectorId) ?? ''}
      className={className}
    />
  );
}

const timeLine = (record: SyncedRecord) => {
  if (record.isAllDay || record.startAt === null) return HELM_COPY.syncedAllDay;
  if (record.endAt === null) return formatTime(record.startAt);
  const isOneDay =
    new Date(record.startAt).toDateString() ===
    new Date(record.endAt).toDateString();
  return isOneDay
    ? `${formatTime(record.startAt)} – ${formatTime(record.endAt)}`
    : `${formatDateShort(record.startAt)}, ${formatTime(record.startAt)} – ${formatDateShort(record.endAt)}, ${formatTime(record.endAt)}`;
};

/** Another app's event: a plain card with the source's logo (and a second source's, when both have it), read-only, that opens its source block. */
export function SyncedCard({ record, alsoIn, onOpen }: EventCardProps) {
  const { nameOf } = useSourceAppName();
  const other = findOtherTime(record, alsoIn);
  const second = alsoIn.find((copy) => copy.connectorId !== record.connectorId);
  const detail = [
    timeLine(record),
    record.sealed.extra.isTentative === true ? HELM_COPY.syncedTentative : null,
    record.sealed.subtitle,
    findPlace(record, alsoIn),
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
      <span className='relative shrink-0'>
        <SourceMark record={record} className='size-9 rounded-lg' />
        {second && (
          <SourceMark
            record={second}
            className='ring-card absolute -right-1.5 -bottom-1.5 size-5 rounded-md ring-2'
          />
        )}
      </span>
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block text-[15px] leading-[21px] break-words'>
          {record.sealed.title}
        </span>
        <span className='text-muted-foreground block text-[13px] break-words'>
          {detail}
        </span>
        {other && other.startAt !== null && (
          <span className='text-muted-foreground block text-[13px] break-words'>
            {HELM_COPY.sameThingTime(
              nameOf(other.connectorId),
              formatTime(other.startAt),
            )}
          </span>
        )}
        <DiscrepancyLine record={record} />
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
