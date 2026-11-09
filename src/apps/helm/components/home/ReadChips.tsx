import { useState } from 'react';

import {
  Button,
  Calendar,
  Popover,
} from '@moondreamsdev/dreamer-ui/components';
import { X } from 'lucide-react';

import Drawer from '@/components/Drawer';
import { useSheetHistory } from '@/hooks/useBackHistory';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { HELM_COPY } from '@apps/helm/constants';
import type { CaptureReading, TaskDue } from '@apps/helm/types';
import {
  getDueDay,
  getReadingKey,
  URGENT_KEY,
} from '@apps/helm/utils/captureReading';

interface ReadChipsProps {
  reading: CaptureReading;
  timeZone: string;
  /** Left out where the reading is only shown: the chips then have no "Read as text" and no calendar. */
  onDismiss: ((key: string, label: string) => void) | null;
  onPickDay: ((key: string, day: number) => void) | null;
}

interface Chip {
  key: string;
  label: string;
  due: TaskDue | null;
}

const MAX_SHOWN_CHIPS = 6;

const formatDue = (due: TaskDue, timeZone: string) => {
  const isOtherYear = (year: number) => year !== new Date().getFullYear();
  if (due.kind === 'day') {
    const date = new Date(due.date);
    return date.toLocaleDateString('en-US', {
      timeZone: 'UTC',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      ...(isOtherYear(date.getUTCFullYear()) ? { year: 'numeric' } : {}),
    });
  }
  const at = new Date(due.at);
  const year = Number(
    at.toLocaleDateString('en-US', { timeZone, year: 'numeric' }),
  );
  return at.toLocaleString('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(isOtherYear(year) ? { year: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
  });
};

const toChips = (reading: CaptureReading, timeZone: string): Chip[] => [
  ...reading.people.map((token) => ({
    key: getReadingKey('people', token.text),
    label: `@${token.text}`,
    due: null,
  })),
  ...reading.places.map((token) => ({
    key: getReadingKey('places', token.text),
    label: `#${token.text}`,
    due: null,
  })),
  ...reading.documents.map((token) => ({
    key: getReadingKey('documents', token.text),
    label: `^${token.text}`,
    due: null,
  })),
  ...(reading.isUrgent
    ? [{ key: URGENT_KEY, label: HELM_COPY.readUrgent, due: null }]
    : []),
  ...reading.dates.map((span) => ({
    key: getReadingKey('dates', span.text),
    label: formatDue(span.due, timeZone),
    due: span.due,
  })),
];

const toLocalDay = (day: number) => {
  const date = new Date(day);
  return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

/** One quiet pill for each thing read for certain, with its words; a date opens a calendar to fix the day. */
function ReadChips({
  reading,
  timeZone,
  onDismiss,
  onPickDay,
}: ReadChipsProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const isPhone = useMediaQuery().isBelow('sm');
  const { dialogId, onDialogClose } = useSheetHistory(
    openKey !== null && isPhone,
    () => setOpenKey(null),
  );
  // The same words said twice are one chip, as dropping or fixing one answers for both.
  const chips = Array.from(
    new Map(
      toChips(reading, timeZone).map((chip) => [chip.key, chip]),
    ).values(),
  );
  if (chips.length === 0) return null;
  const shown = isExpanded ? chips : chips.slice(0, MAX_SHOWN_CHIPS);
  const hiddenCount = chips.length - shown.length;
  const openChip = chips.find((chip) => chip.key === openKey);

  const renderCalendar = (chip: Chip & { due: TaskDue }) => (
    <Calendar
      mode='single'
      size='auto'
      initialDate={toLocalDay(getDueDay(chip.due, timeZone))}
      onDateSelect={(date) =>
        // The calendar reports a pick from inside its own state update, so it is applied just after.
        queueMicrotask(() => {
          onPickDay?.(
            chip.key,
            Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
          );
          setOpenKey(null);
        })
      }
    />
  );

  return (
    <>
      <ul
        aria-label={HELM_COPY.readChipsLabel}
        className='flex flex-wrap items-center gap-1.5'
      >
        {shown.map((chip) => {
          const face =
            chip.due && onPickDay ? (
              <Button
                type='button'
                variant='tertiary'
                size='sm'
                className='h-7 max-w-[16rem] min-w-0 rounded-full px-2.5 text-[13px] tabular-nums'
                aria-label={HELM_COPY.changeDay(chip.label)}
                onClick={() =>
                  setOpenKey((current) =>
                    current === chip.key ? null : chip.key,
                  )
                }
              >
                <span className='truncate'>{chip.label}</span>
              </Button>
            ) : (
              <span className='block max-w-[16rem] truncate px-2.5 text-[13px] tabular-nums'>
                {chip.label}
              </span>
            );
          return (
            <li
              key={chip.key}
              className='border-border bg-card text-foreground inline-flex h-8 max-w-full items-center rounded-full border'
            >
              {chip.due && onPickDay && !isPhone ? (
                <Popover
                  isOpen={openKey === chip.key}
                  onOpenChange={(isOpen) =>
                    setOpenKey(isOpen ? chip.key : null)
                  }
                  placement='top'
                  alignment='start'
                  className='w-72 p-2'
                  trigger={face}
                >
                  {openKey === chip.key &&
                    renderCalendar({ ...chip, due: chip.due })}
                </Popover>
              ) : (
                <span className='min-w-0'>{face}</span>
              )}
              {onDismiss && (
                <Button
                  type='button'
                  variant='tertiary'
                  size='sm'
                  className="text-muted-foreground relative size-7 min-w-0 shrink-0 rounded-full p-0 before:absolute before:-inset-1.5 before:content-['']"
                  aria-label={`${HELM_COPY.readAsText}: ${chip.label}`}
                  onClick={() => onDismiss(chip.key, chip.label)}
                >
                  <X className='size-3.5' aria-hidden='true' />
                </Button>
              )}
            </li>
          );
        })}
        {hiddenCount > 0 && (
          <li className='inline-flex h-8 items-center'>
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className="text-muted-foreground relative h-7 rounded-full px-2.5 text-[13px] before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
              onClick={() => setIsExpanded(true)}
            >
              {HELM_COPY.moreChips(hiddenCount)}
            </Button>
          </li>
        )}
      </ul>
      {isPhone && (
        <Drawer
          id={dialogId}
          isOpen={openChip?.due != null && onPickDay !== null}
          onClose={onDialogClose}
          title={HELM_COPY.changeDayTitle}
          showCloseButton
        >
          <div className='pb-4'>
            {openChip?.due &&
              renderCalendar({ ...openChip, due: openChip.due })}
          </div>
        </Drawer>
      )}
    </>
  );
}

export default ReadChips;
