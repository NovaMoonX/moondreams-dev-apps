import { useState } from 'react';

import AppToggle from '@/components/AppToggle';
import DetailSheet from '@/components/DetailSheet';
import { useAuth } from '@/hooks/useAuth';
import { afterBackLayersClose } from '@/hooks/useBackHistory';
import { useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import SyncedSourceBlock from '@apps/helm/components/connections/SyncedSourceBlock';
import { RunsSection } from '@apps/helm/components/procedures/RunRows';
import { DiscrepancyBlock } from '@apps/helm/components/today/DiscrepancyLine';
import { HELM_COPY } from '@apps/helm/constants';
import { findOtherTime, findPlace } from '@apps/helm/engine/authority';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { useSourceAppName } from '@apps/helm/hooks/useSourceAppName';
import { setAllDayEventBusy } from '@apps/helm/store/actions/settingsActions';
import type { SyncedRecord } from '@apps/helm/types';
import {
  formatClock,
  formatDayWord,
  formatSlotRange,
  toDayKey,
} from '@apps/helm/utils/planDays';
import { isCalendarEvent, toFirstDay } from '@apps/helm/utils/synced';

interface SyncedSheetProps {
  record: SyncedRecord | null;
  /** The same event's copies from other sources, each with its own source block. */
  alsoIn?: SyncedRecord[];
  now: number;
  onClose: () => void;
}

const getEventWhen = (
  record: SyncedRecord,
  startAt: number,
  now: number,
  timeZone: string,
) => {
  const { endAt, isAllDay } = record;
  const todayKey = toDayKey(now, timeZone);
  const keyOf = (at: number) =>
    isAllDay ? new Date(at).toISOString().slice(0, 10) : toDayKey(at, timeZone);
  const startKey = keyOf(startAt);
  const endKey = endAt === null ? startKey : keyOf(endAt);
  const startDay = formatDayWord(startKey, todayKey);
  const endDay = formatDayWord(endKey, todayKey);
  if (isAllDay) {
    const days = endKey === startKey ? startDay : `${startDay} to ${endDay}`;
    return `${days} · ${HELM_COPY.syncedAllDay}`;
  }
  if (endAt === null) {
    return `${startDay} · ${formatClock(startAt, timeZone)}`;
  }
  return startKey === endKey
    ? `${startDay} · ${formatSlotRange(startAt, endAt, timeZone)}`
    : `${startDay} ${formatClock(startAt, timeZone)} to ${endDay} ${formatClock(endAt, timeZone)}`;
};

/** "Today · 3:00 to 4:00 PM", "Tomorrow · All day", or both ends named when it spans days; an all-day event's dates are UTC days. */
const getEventFacts = (record: SyncedRecord, now: number, timeZone: string) => {
  if (record.startAt === null) return null;
  const when = getEventWhen(record, record.startAt, now, timeZone);
  return record.sealed.extra.isTentative === true
    ? `${when} · ${HELM_COPY.syncedTentative}`
    : when;
};

/** An all-day calendar event's switch: it writes at once and touches nothing else on the sheet, with a failure on its own row. */
function BusyAllDayRow({ eventId }: { eventId: string }) {
  const { user } = useAuth();
  const isBusy = useAppSelector((state) =>
    state.helm.profile?.busyAllDayEventRefs.includes(eventId),
  );
  const [hasFailed, setHasFailed] = useState(false);

  return (
    <div className='space-y-1'>
      <label className='flex items-center justify-between gap-3 text-[15px]'>
        <span>{HELM_COPY.busyAllDayLabel}</span>
        <AppToggle
          aria-label={HELM_COPY.busyAllDayLabel}
          checked={isBusy === true}
          onCheckedChange={(next) => {
            if (!user) return;
            setHasFailed(false);
            setAllDayEventBusy(user.uid, eventId, next).catch(
              (error: unknown) => {
                console.error('Helm busy all day was not saved', error);
                setHasFailed(true);
              },
            );
          }}
        />
      </label>
      <p className='text-muted-foreground text-[13px] text-pretty'>
        {HELM_COPY.busyAllDayHint}
      </p>
      {hasFailed && (
        <p className='text-[13px] text-[var(--helm-overdue)]'>
          {HELM_COPY.busyAllDayFailed}
        </p>
      )}
    </div>
  );
}

/** A copied record, read-only: its words, then where it came from. A calendar event also says when it is, and an all-day one can be marked as keeping the person busy. */
function SyncedSheet({ record, alsoIn = [], now, onClose }: SyncedSheetProps) {
  const { nameOf, sourceNameOf } = useSourceAppName();
  const { showView } = useHelmUrlState();
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const isCalendar = record !== null && isCalendarEvent(record);
  const other = record && findOtherTime(record, alsoIn);
  return (
    <DetailSheet
      isOpen={record !== null}
      onClose={onClose}
      title={record?.sealed.title ?? ''}
    >
      {record && (
        <div className='flex flex-col gap-4'>
          {[
            isCalendar ? getEventFacts(record, now, timeZone) : null,
            other && other.startAt !== null
              ? HELM_COPY.sameThingTime(
                  sourceNameOf(other),
                  formatClock(other.startAt, timeZone),
                )
              : null,
            record.sealed.subtitle,
            findPlace(record, alsoIn),
          ]
            .filter((line): line is string => !!line)
            .map((line) => (
              <p key={line} className='text-[15px] break-words'>
                {line}
              </p>
            ))}
          {record.sealed.detail && (
            <p className='text-muted-foreground text-[15px] text-pretty whitespace-pre-line'>
              {record.sealed.detail}
            </p>
          )}
          {isCalendar && record.isAllDay && (
            <BusyAllDayRow key={record.id} eventId={record.id} />
          )}
          <RunsSection
            field='attachedTo.id'
            id={record.id}
            variant='thing'
            onOpen={(runId) =>
              afterBackLayersClose(() => void showView('run', runId))
            }
            start={{
              attachment: { kind: 'synced', id: record.id },
              label: record.sealed.title,
              dueOn: toFirstDay(record, timeZone),
              alsoIds: alsoIn.map((copy) => copy.id),
            }}
          />
          <DiscrepancyBlock record={record} />
          {[record, ...alsoIn].map((copy) => (
            <SyncedSourceBlock
              key={copy.id}
              record={copy}
              appName={nameOf(copy.connectorId)}
              now={now}
            />
          ))}
        </div>
      )}
    </DetailSheet>
  );
}

export default SyncedSheet;
