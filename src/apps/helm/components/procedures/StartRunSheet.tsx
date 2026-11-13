import { useState } from 'react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import {
  CalendarDays,
  FolderOpen,
  ListChecks,
  Play,
  Plane,
} from 'lucide-react';
import type { ReactNode } from 'react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import LockedButton from '@/components/LockedButton';
import SectionDivider from '@/components/SectionDivider';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import {
  formatDateShort,
  formatDateShortUTC,
  formatTime,
} from '@/utils/formatUtils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import {
  DAY_MS,
  HELM_COPY,
  RUN_START_DAYS,
  RUN_START_LISTED,
} from '@apps/helm/constants';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { startRun } from '@apps/helm/store/actions/runActions';
import { selectActiveProjects } from '@apps/helm/store/selectors/projectSelectors';
import { selectProcedures } from '@apps/helm/store/selectors/procedureSelectors';
import {
  findOpenRunFor,
  selectOpenRuns,
} from '@apps/helm/store/selectors/runSelectors';
import type {
  OpenProcedure,
  RunAttachment,
  SyncedRecord,
} from '@apps/helm/types';
import { getRunProgress } from '@apps/helm/utils/runSteps';
import { mergeSameThings } from '@apps/helm/utils/sameThing';
import { toFirstDay } from '@apps/helm/utils/synced';
import { countSteps, groupSteps } from '@apps/helm/utils/stepGroups';

interface Row {
  key: string;
  icon: ReactNode;
  label: string;
  subtitle?: string;
  procedure: OpenProcedure;
  attachment: RunAttachment;
  alsoIds: string[];
  attachedLabel: string | null;
  dueOn: number | null;
}

/** A project, trip or event the sheet is opened from: the run is for it, so only the procedure is asked. */
export interface RunTarget {
  attachment: NonNullable<RunAttachment>;
  label: string;
  dueOn: number | null;
  alsoIds: string[];
}

interface StartRunSheetProps {
  isOpen: boolean;
  /** Set when the sheet opens from a procedure: it asks what the run is for. */
  procedure?: OpenProcedure;
  /** Set when the sheet opens from a project or trip: it asks which procedure. */
  target?: RunTarget;
  onClose: () => void;
  onStarted: (runId: string) => void;
}

const toWhen = (record: SyncedRecord) =>
  record.startAt === null
    ? undefined
    : record.isAllDay
      ? formatDateShortUTC(record.startAt)
      : `${formatDateShort(record.startAt)}, ${formatTime(record.startAt)}`;

/** Trips and events from other apps that are on now or start within the window, each thing once: trips first, since a meal plan's events would crowd them out, then soonest first. A trip stands for its stays, rentals, flights and drives. */
const getOffered = (records: SyncedRecord[], now: number) =>
  mergeSameThings(
    records.filter(
      (record) =>
        (record.kind === 'trip' || record.kind === 'event') &&
        record.category !== 'itinerary' &&
        record.connectionEndedAt === null &&
        record.startAt !== null &&
        record.startAt <= now + RUN_START_DAYS * DAY_MS &&
        (record.isAllDay
          ? (record.endAt ?? record.startAt) + DAY_MS
          : (record.endAt ?? record.startAt)) > now,
    ),
  ).sort(
    (left, right) =>
      Number(right.record.kind === 'trip') -
        Number(left.record.kind === 'trip') ||
      (left.record.startAt ?? 0) - (right.record.startAt ?? 0),
  );

function StartRunBody({
  procedure,
  target,
  onClose,
  onStarted,
}: Omit<StartRunSheetProps, 'isOpen'>) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const now = useNow(60_000);
  const synced = useAppSelector((state) => state.helm.synced.items);
  const projects = useAppSelector(selectActiveProjects);
  const procedures = useAppSelector(selectProcedures);
  const openRuns = useAppSelector(selectOpenRuns);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const [isStarting, setIsStarting] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);

  const stepsOf = (entry: OpenProcedure) => countSteps(groupSteps(entry));
  const forProcedure = (
    entry: OpenProcedure,
    fields: Omit<Row, 'procedure'>,
  ): Row => ({ ...fields, procedure: entry });

  const coming: Row[] = procedure
    ? getOffered(synced, now).map(({ record, alsoIn }) =>
        forProcedure(procedure, {
          key: record.id,
          icon:
            record.kind === 'trip' ? (
              <Plane aria-hidden='true' />
            ) : (
              <CalendarDays aria-hidden='true' />
            ),
          label: record.sealed.title,
          subtitle:
            record.startAt !== null && record.startAt <= now
              ? HELM_COPY.runStartNow
              : toWhen(record),
          attachment: { kind: 'synced', id: record.id },
          alsoIds: alsoIn.map((copy) => copy.id),
          attachedLabel: record.sealed.title,
          dueOn: toFirstDay(record, timeZone),
        }),
      )
    : [];
  const forProjects: Row[] = procedure
    ? projects.map((project) =>
        forProcedure(procedure, {
          key: project.id,
          icon: <FolderOpen aria-hidden='true' />,
          label: project.name,
          attachment: { kind: 'project', id: project.id },
          alsoIds: [],
          attachedLabel: project.name,
          dueOn: null,
        }),
      )
    : [];
  const justARun: Row[] = procedure
    ? [
        forProcedure(procedure, {
          key: 'just-a-run',
          icon: <Play aria-hidden='true' />,
          label: HELM_COPY.runJustARun,
          subtitle: HELM_COPY.runJustARunHint,
          attachment: null,
          alsoIds: [],
          attachedLabel: null,
          dueOn: null,
        }),
      ]
    : [];
  const pickable: Row[] = target
    ? procedures.map((entry) =>
        forProcedure(entry, {
          key: entry.id,
          icon: <ListChecks aria-hidden='true' />,
          label: entry.title || HELM_COPY.procedureUntitled,
          subtitle: stepsOf(entry) === 0 ? HELM_COPY.runNoStepsRow : undefined,
          attachment: target.attachment,
          alsoIds: target.alsoIds,
          attachedLabel: target.label,
          dueOn: target.dueOn,
        }),
      )
    : [];

  const start = async (row: Row) => {
    if (!user || isStarting) return;
    setIsStarting(true);
    try {
      const made = await startRun(user.uid, await getHelmEncryption(user.uid), {
        procedure: row.procedure,
        attachment: row.attachment,
        label: row.attachedLabel,
        dueOn: row.dueOn,
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

  const rows = (choices: Row[], section: string, isFolded: boolean) => {
    const isAll = expanded.includes(section);
    return (
      <>
        <ActionGroup>
          {(isFolded && !isAll
            ? choices.slice(0, RUN_START_LISTED)
            : choices
          ).map((row) => {
            const existing = findOpenRunFor(
              openRuns,
              row.procedure.id,
              row.attachment,
              row.alsoIds,
            );
            const progress = existing ? getRunProgress(existing) : null;
            return (
              <ActionRow
                key={row.key}
                isGrouped
                icon={row.icon}
                label={row.label}
                subtitle={
                  progress
                    ? HELM_COPY.runStartRunning(progress.done, progress.total)
                    : row.subtitle
                }
                isDisabled={
                  isStarting || (!existing && stepsOf(row.procedure) === 0)
                }
                onClick={() => {
                  if (!existing) {
                    void start(row);
                    return;
                  }
                  onClose();
                  onStarted(existing.id);
                }}
              />
            );
          })}
        </ActionGroup>
        {isFolded && choices.length > RUN_START_LISTED && (
          <ShowMoreButton
            isOpen={isAll}
            onClick={() =>
              setExpanded((open) =>
                isAll
                  ? open.filter((key) => key !== section)
                  : [...open, section],
              )
            }
          >
            {isAll ? HELM_COPY.runStartShowFewer : HELM_COPY.runStartShowMore}
          </ShowMoreButton>
        )}
      </>
    );
  };

  const hasNoSteps = procedure !== undefined && stepsOf(procedure) === 0;

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={target ? HELM_COPY.runStartPickTitle : HELM_COPY.runStartTitle}
    >
      <div className='space-y-4 pb-4'>
        <p className='text-muted-foreground text-[13px]'>
          {target
            ? `${HELM_COPY.runStartFor(target.label)}. ${HELM_COPY.runStartPickHint}`
            : HELM_COPY.runStartHint}
        </p>
        {hasNoSteps ? (
          <LockedButton
            label={HELM_COPY.runStart}
            title={HELM_COPY.runNoStepsTitle}
            className='w-full'
          >
            <p>{HELM_COPY.runNoStepsBody}</p>
          </LockedButton>
        ) : (
          <>
            {rows(justARun, 'just', false)}
            {coming.length > 0 && (
              <>
                <SectionDivider label={HELM_COPY.runStartTrips} />
                {rows(coming, 'coming', true)}
              </>
            )}
            {forProjects.length > 0 && (
              <>
                <SectionDivider label={HELM_COPY.runStartProjects} />
                {rows(forProjects, 'projects', true)}
              </>
            )}
            {pickable.length > 0 && rows(pickable, 'procedures', true)}
          </>
        )}
      </div>
    </DetailSheet>
  );
}

/** Start a run: from a procedure, what it is for (just a run first, then a trip or event coming up, a project); from a project or trip, which procedure. */
function StartRunSheet({ isOpen, ...rest }: StartRunSheetProps) {
  return isOpen ? <StartRunBody {...rest} /> : null;
}

export default StartRunSheet;
