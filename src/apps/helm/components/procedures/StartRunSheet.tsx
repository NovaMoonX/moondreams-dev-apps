import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { CalendarDays, FolderOpen, Play, Plane } from 'lucide-react';
import type { ReactNode } from 'react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import Drawer from '@/components/Drawer';
import SectionDivider from '@/components/SectionDivider';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import {
  formatDateShort,
  formatDateShortUTC,
  formatTime,
} from '@/utils/formatUtils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { DAY_MS, HELM_COPY, RUN_START_DAYS } from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { startRun } from '@apps/helm/store/actions/runActions';
import { selectActiveProjects } from '@apps/helm/store/selectors/projectSelectors';
import type {
  OpenProcedure,
  RunAttachment,
  SyncedRecord,
} from '@apps/helm/types';
import { getDueDay } from '@apps/helm/utils/captureReading';
import { mergeSameThings } from '@apps/helm/utils/sameThing';

const OFFERED_MAX = 12;

interface Choice {
  key: string;
  icon: ReactNode;
  label: string;
  subtitle?: string;
  attachment: RunAttachment;
  dueOn: number | null;
}

interface StartRunSheetProps {
  isOpen: boolean;
  procedure: OpenProcedure;
  onClose: () => void;
  onStarted: (runId: string) => void;
}

/** A trip's or event's first day: an all-day one is already a UTC day, a timed one is read in the person's zone. */
const toFirstDay = (record: SyncedRecord, timeZone: string) =>
  record.startAt === null
    ? null
    : record.isAllDay
      ? record.startAt
      : getDueDay({ kind: 'moment', at: record.startAt }, timeZone);

const toWhen = (record: SyncedRecord) =>
  record.startAt === null
    ? undefined
    : record.isAllDay
      ? formatDateShortUTC(record.startAt)
      : `${formatDateShort(record.startAt)}, ${formatTime(record.startAt)}`;

/** Trips and events from other apps that are on now or start within the window, each thing once: trips first, since a meal plan's events would crowd them out, then soonest first. */
const getOffered = (records: SyncedRecord[], now: number) =>
  mergeSameThings(
    records
      .filter(
        (record) =>
          (record.kind === 'trip' || record.kind === 'event') &&
          record.connectionEndedAt === null &&
          record.startAt !== null &&
          record.startAt <= now + RUN_START_DAYS * DAY_MS &&
          (record.isAllDay
            ? (record.endAt ?? record.startAt) + DAY_MS
            : (record.endAt ?? record.startAt)) > now,
      )
      .sort(
        (left, right) =>
          Number(right.kind === 'trip') - Number(left.kind === 'trip') ||
          (left.startAt ?? 0) - (right.startAt ?? 0),
      ),
  )
    .map((entry) => entry.record)
    .slice(0, OFFERED_MAX);

function StartRunBody({
  procedure,
  onClose,
  onStarted,
}: Omit<StartRunSheetProps, 'isOpen'>) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const now = useNow(60_000);
  const synced = useAppSelector((state) => state.helm.synced.items);
  const projects = useAppSelector(selectActiveProjects);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const [isStarting, setIsStarting] = useState(false);

  const coming: Choice[] = getOffered(synced, now).map((record) => ({
    key: record.id,
    icon:
      record.kind === 'trip' ? (
        <Plane aria-hidden='true' />
      ) : (
        <CalendarDays aria-hidden='true' />
      ),
    label: record.sealed.title,
    subtitle: toWhen(record),
    attachment: { kind: 'synced', id: record.id },
    dueOn: toFirstDay(record, timeZone),
  }));
  const forProjects: Choice[] = projects
    .slice(0, OFFERED_MAX)
    .map((project) => ({
      key: project.id,
      icon: <FolderOpen aria-hidden='true' />,
      label: project.name,
      attachment: { kind: 'project', id: project.id },
      dueOn: null,
    }));

  const start = async (
    choice: Pick<Choice, 'attachment' | 'dueOn'> & { label: string | null },
  ) => {
    if (!user || isStarting) return;
    setIsStarting(true);
    try {
      const made = await startRun(user.uid, await getHelmEncryption(user.uid), {
        procedure,
        attachment: choice.attachment,
        label: choice.label,
        dueOn: choice.dueOn,
      });
      made.written.catch((error: unknown) => {
        console.error('Helm run was not saved', error);
        addToast({ title: HELM_COPY.runStartFailed, type: 'error' });
      });
      onClose();
      onStarted(made.id);
    } catch (error) {
      console.error('Helm run was not started', error);
      addToast({ title: HELM_COPY.runStartFailed, type: 'error' });
      setIsStarting(false);
    }
  };

  const rows = (choices: Choice[]) => (
    <ActionGroup>
      {choices.map((choice) => (
        <ActionRow
          key={choice.key}
          isGrouped
          icon={choice.icon}
          label={choice.label}
          subtitle={choice.subtitle}
          isDisabled={isStarting}
          onClick={() => void start(choice)}
        />
      ))}
    </ActionGroup>
  );

  return (
    <Drawer isOpen onClose={onClose} title={HELM_COPY.runStartTitle}>
      <div className='space-y-4 pb-4'>
        <p className='text-muted-foreground text-[13px]'>
          {HELM_COPY.runStartHint}
        </p>
        {coming.length > 0 && (
          <>
            <SectionDivider label={HELM_COPY.runStartTrips} />
            {rows(coming)}
          </>
        )}
        {forProjects.length > 0 && (
          <>
            <SectionDivider label={HELM_COPY.runStartProjects} />
            {rows(forProjects)}
          </>
        )}
        <ActionGroup>
          <ActionRow
            isGrouped
            icon={<Play aria-hidden='true' />}
            label={HELM_COPY.runJustARun}
            subtitle={HELM_COPY.runJustARunHint}
            isDisabled={isStarting}
            onClick={() =>
              void start({ attachment: null, dueOn: null, label: null })
            }
          />
        </ActionGroup>
      </div>
    </Drawer>
  );
}

/** Start a run: what is it for, a trip or event coming up, a project, or just a run. */
function StartRunSheet({ isOpen, ...rest }: StartRunSheetProps) {
  return isOpen ? <StartRunBody {...rest} /> : null;
}

export default StartRunSheet;
