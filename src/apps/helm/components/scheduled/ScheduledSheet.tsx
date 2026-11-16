import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  CalendarArrowUp,
  CalendarClock,
  ChevronRight,
  CircleStop,
  PenLine,
  Pause,
  Play,
  SkipForward,
} from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import DateInput from '@/components/DateInput';
import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SectionDivider from '@/components/SectionDivider';
import SectionHeader from '@/components/SectionHeader';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { shiftDayKeyBy } from '@/utils/cadenceUtils';
import { formatDate, formatTime } from '@/utils/formatUtils';
import RadioRows from '@/apps/helm/components/scheduled/RadioRows';
import ScheduledForm from '@/apps/helm/components/scheduled/ScheduledForm';
import { useScheduledChange } from '@apps/helm/components/scheduled/useScheduledChange';
import { HELM_COPY } from '@apps/helm/constants';
import {
  readMoveRange,
  readNextRun,
  toDayKeyIn,
  type Occurrence,
} from '@apps/helm/engine/scheduledActions';
import {
  endScheduledAction,
  moveScheduledRun,
  pauseScheduledAction,
  pauseScheduledActionUntil,
  restoreScheduledRun,
  resumeScheduledAction,
  skipScheduledRun,
  toActionState,
} from '@apps/helm/store/actions/scheduledActionWrites';
import {
  selectScheduledById,
  selectScheduledRuns,
} from '@apps/helm/store/selectors/scheduledSelectors';
import type { OpenScheduledAction } from '@apps/helm/types';
import {
  formatClockWords,
  formatRun,
  formatRunDay,
  formatShortDay,
  isPausedNow,
  readActionZone,
  readNextOf,
  readRuleWords,
  readZoneName,
} from '@apps/helm/utils/scheduledWords';

type View =
  | { kind: 'main' }
  | { kind: 'pause' }
  | { kind: 'run'; key: string }
  | { kind: 'move'; key: string };

type PauseChoice = 'next' | 'until' | 'open';

interface ScheduledSheetProps {
  /** The action to show; null keeps the sheet closed. */
  actionId: string | null;
  onClose: () => void;
  /** Without it the last-run row and "See all" are left out. */
  onOpenActivity?: () => void;
  /** Where "Ended · Undo" is said once the action is ended; without it the sheet says it in a toast. */
  onEnded?: (title: string, undo: () => void) => void;
}

interface RunRow {
  key: string;
  at: number;
  day: string;
  time: string;
  movedFrom: string | null;
  isSkipped: boolean;
}

const MAY_CHANGE: Record<string, string> = {
  createTask: HELM_COPY.scheduledMayTasks,
  updateTask: HELM_COPY.scheduledMayTasks,
  planDay: HELM_COPY.scheduledMayDay,
};

const rowClass =
  'flex min-h-12 w-full items-center gap-3 rounded-none border-0 px-0 py-2 text-left font-normal';

/** The next runs in time order, with a run that was skipped still listed (struck) so its Undo stays where it was made. */
const readRunRows = (
  action: OpenScheduledAction,
  next: Occurrence[],
): RunRow[] => {
  const last = next.at(-1)?.key ?? null;
  const first = next[0]?.key ?? null;
  const skipped = action.skipped.filter(
    (key) => first !== null && last !== null && key >= first && key <= last,
  );
  return [
    ...next.map((run) => ({
      key: run.key,
      at: run.at,
      day: run.day,
      time: run.time,
      movedFrom: action.moved[run.key] ? run.key : null,
      isSkipped: false,
    })),
    ...skipped.map((key) => ({
      key,
      at: 0,
      day: key,
      time: action.time,
      movedFrom: null,
      isSkipped: true,
    })),
  ].sort(
    (left, right) =>
      left.day.localeCompare(right.day) || left.time.localeCompare(right.time),
  );
};

/** One scheduled action over the screen it was opened from: what it does, its next runs (each opens skip, move or change), what it did and the three things to do with it; Pause and a single run swap in place. */
function ScheduledSheet({
  actionId,
  onClose,
  onOpenActivity,
  onEnded,
}: ScheduledSheetProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const now = useNow(60_000);
  const { guard, undoOf, report } = useScheduledChange();
  const byId = useAppSelector(selectScheduledById);
  const runs = useAppSelector(selectScheduledRuns);
  const homeZone =
    useAppSelector((state) => state.helm.profile?.timeZone) ?? 'UTC';
  const [view, setView] = useState<View>({ kind: 'main' });
  const [form, setForm] = useState<{
    runKey: string | null;
    token: number;
  } | null>(null);
  const action = actionId ? (byId.get(actionId) ?? null) : null;
  const isOpen = action !== null && action.status !== 'ended';

  const close = () => {
    setView({ kind: 'main' });
    onClose();
  };
  const back = () => setView({ kind: 'main' });

  if (!action || !isOpen) {
    return (
      <DetailSheet isOpen={false} onClose={close} title=''>
        {null}
      </DetailSheet>
    );
  }

  const zone = readActionZone(action, homeZone);
  const state = toActionState(action);
  const next = readNextOf(action, homeZone, now);
  const isPaused = isPausedNow(action, now, zone);
  const { words } = readRuleWords(action, homeZone, now);
  const rows = readRunRows(action, next);
  const lastRun = runs.find((run) => run.actionId === action.id) ?? null;
  const mayChange = [
    ...new Set(action.allowed.map((kind) => MAY_CHANGE[kind] ?? kind)),
  ];
  const doing = action.instruction ?? action.title;
  const resumeRun = readNextRun(
    { ...state, pausedFrom: null, pausedUntil: null },
    homeZone,
    { now },
  );
  const afterOf = (key: string) =>
    readNextRun(state, homeZone, { now, afterKey: key });

  const skip = (key: string | null) => {
    if (!user) return;
    const skippedKey = key ?? action.nextRunKey;
    const after = skippedKey
      ? readNextRun(
          { ...state, skipped: [...state.skipped, skippedKey] },
          homeZone,
          { now },
        )
      : null;
    const isDone = report(
      skipScheduledRun(user.uid, action.id, key),
      HELM_COPY.scheduledSkipped(
        after
          ? `${formatRunDay(after.day)} at ${formatClockWords(after.time)}`
          : null,
      ),
    );
    if (isDone) back();
  };

  const endIt = async () => {
    if (!user) return;
    const isConfirmed = await confirm({
      title: HELM_COPY.scheduledEndTitle(action.title),
      message: HELM_COPY.scheduledEndMessage,
      confirmText: HELM_COPY.scheduledEndAction,
      cancelText: HELM_COPY.scheduledKeep,
      destructive: true,
    });
    if (!isConfirmed) return;
    const write = guard(endScheduledAction(user.uid, action.id));
    if (!write) return;
    close();
    if (onEnded) {
      onEnded(action.title, undoOf(write));
      return;
    }
    report(
      { ...write, undo: write.undo },
      HELM_COPY.scheduledEnded(action.title),
    );
  };

  const resume = () => {
    if (!user) return;
    report(
      resumeScheduledAction(user.uid, action.id),
      HELM_COPY.scheduledResumed(action.title),
    );
  };

  const main = (
    <div className='space-y-5'>
      <div className='bg-muted space-y-1 rounded-[14px] px-3.5 py-3'>
        <p className='text-[13px] font-semibold'>
          {HELM_COPY.scheduledWhatItDoes}
        </p>
        <p className='text-[15px] text-pretty break-words'>{doing}</p>
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {mayChange.length > 0
            ? HELM_COPY.scheduledMayChange(mayChange.join(', '))
            : HELM_COPY.scheduledMayChangeNothing}
        </p>
      </div>
      <section className='space-y-1'>
        <SectionHeader
          title={HELM_COPY.scheduledComingUp}
          subtitle={
            isPaused
              ? action.status === 'paused'
                ? HELM_COPY.scheduledPausedOpen
                : HELM_COPY.scheduledPausedUntil(
                    formatShortDay(
                      toDayKeyIn(action.pausedUntil ?? now, 'UTC'),
                    ),
                  )
              : undefined
          }
        />
        {rows.length === 0 && (
          <p className='text-muted-foreground py-2 text-[15px]'>
            {action.status === 'paused'
              ? HELM_COPY.scheduledPausedNoRuns
              : HELM_COPY.scheduledNoMoreRuns}
          </p>
        )}
        <ul className='divide-border divide-y'>
          {rows.map((row) => {
            const label = formatRun(row, zone);
            return (
              <li key={row.key}>
                {row.isSkipped ? (
                  <div className={join(rowClass, 'justify-between')}>
                    <span className='flex min-w-0 items-center gap-3'>
                      <CalendarClock
                        className='text-muted-foreground size-4 shrink-0'
                        aria-hidden='true'
                      />
                      <span className='text-muted-foreground min-w-0 text-[15px] line-through'>
                        {label}
                      </span>
                    </span>
                    <span className='flex shrink-0 items-center gap-1 text-[13px]'>
                      <span className='text-muted-foreground'>
                        {HELM_COPY.scheduledSkippedMark}
                      </span>
                      <Button
                        type='button'
                        variant='tertiary'
                        size='sm'
                        className="text-primary! relative font-semibold before:absolute before:-inset-2 before:content-['']"
                        onClick={() =>
                          user &&
                          guard(
                            restoreScheduledRun(user.uid, action.id, row.key),
                          )
                        }
                      >
                        {HELM_COPY.undo}
                      </Button>
                    </span>
                  </div>
                ) : (
                  <div className='flex items-center'>
                    <Button
                      type='button'
                      variant='tertiary'
                      className={join(rowClass, 'min-w-0 flex-1')}
                      onClick={() => setView({ kind: 'run', key: row.key })}
                    >
                      <CalendarClock
                        className='text-muted-foreground size-4 shrink-0'
                        aria-hidden='true'
                      />
                      <span className='min-w-0 flex-1'>
                        <span className='block text-[15px]'>{label}</span>
                        {row.movedFrom && (
                          <span className='text-muted-foreground block text-[13px]'>
                            {HELM_COPY.scheduledMovedFrom(
                              formatRunDay(row.movedFrom),
                            )}
                          </span>
                        )}
                      </span>
                      {!row.movedFrom && (
                        <ChevronRight
                          className='text-muted-foreground size-4 shrink-0'
                          aria-hidden='true'
                        />
                      )}
                    </Button>
                    {row.movedFrom && (
                      <Button
                        type='button'
                        variant='tertiary'
                        size='sm'
                        className="text-primary! relative shrink-0 font-semibold before:absolute before:-inset-2 before:content-['']"
                        onClick={() =>
                          user &&
                          guard(
                            restoreScheduledRun(user.uid, action.id, row.key),
                          )
                        }
                      >
                        {HELM_COPY.undo}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      {lastRun && onOpenActivity && (
        <section className='space-y-1'>
          <SectionHeader title={HELM_COPY.scheduledWhatItDid} />
          <Button
            type='button'
            variant='tertiary'
            className={join(rowClass, 'min-h-13')}
            onClick={() => {
              close();
              onOpenActivity();
            }}
          >
            <span className='min-w-0 flex-1'>
              <span className='block text-[15px] text-pretty break-words'>
                {lastRun.line}
              </span>
              <span className='text-muted-foreground block text-[13px]'>
                {HELM_COPY.scheduledSeeAll}
              </span>
            </span>
            <ChevronRight
              className='text-muted-foreground size-4 shrink-0'
              aria-hidden='true'
            />
          </Button>
        </section>
      )}
      <div className='space-y-4'>
        {isPaused ? (
          <ActionRow
            icon={<Play />}
            label={HELM_COPY.scheduledResume}
            subtitle={
              resumeRun
                ? HELM_COPY.scheduledResumeSubtitle(formatRun(resumeRun, zone))
                : undefined
            }
            onClick={resume}
          />
        ) : (
          <ActionRow
            icon={<Pause />}
            label={HELM_COPY.scheduledPause}
            subtitle={HELM_COPY.scheduledPauseSubtitle}
            hasChevron
            onClick={() => setView({ kind: 'pause' })}
          />
        )}
        <ActionRow
          icon={<PenLine />}
          label={HELM_COPY.scheduledChange}
          subtitle={HELM_COPY.scheduledChangeSubtitle}
          hasChevron
          onClick={() => setForm({ runKey: null, token: Date.now() })}
        />
      </div>
      <div className='space-y-3 pt-4'>
        <SectionDivider label={HELM_COPY.scheduledOtherChoices} />
        <ActionRow
          icon={<CircleStop />}
          label={HELM_COPY.scheduledEnd}
          subtitle={HELM_COPY.scheduledEndSubtitle}
          isDestructive
          onClick={() => void endIt()}
        />
      </div>
      <p className='text-muted-foreground text-[13px]'>
        {action.createdBy === 'nomos' && action.sourceCaptureId !== null
          ? HELM_COPY.scheduledSaid
          : HELM_COPY.scheduledMadeHere}
        {` · ${formatDate(action.createdAt)}, ${formatTime(action.createdAt)}`}
      </p>
    </div>
  );

  const pauseView = (
    <PauseView
      title={action.title}
      nextWords={next[0] ? formatRunDay(next[0].day) : null}
      today={toDayKeyIn(now, zone)}
      onCancel={back}
      onPause={(choice, day) => {
        if (!user) return;
        const write =
          choice === 'next'
            ? null
            : choice === 'until' && day
              ? pauseScheduledActionUntil(user.uid, action.id, day)
              : pauseScheduledAction(user.uid, action.id);
        if (write === null) return skip(null);
        const message =
          choice === 'until' && day
            ? HELM_COPY.scheduledPausedUntilToast(
                action.title,
                formatShortDay(day),
              )
            : HELM_COPY.scheduledPausedToast(action.title);
        if (report(write, message)) back();
      }}
    />
  );

  const runKey = view.kind === 'run' || view.kind === 'move' ? view.key : null;
  const run = runKey ? (rows.find((row) => row.key === runKey) ?? null) : null;
  const after = runKey ? afterOf(runKey) : null;

  const runView = run && (
    <div className='space-y-4'>
      <p className='text-muted-foreground text-[15px] text-pretty'>{doing}</p>
      <div className='space-y-4'>
        <ActionRow
          icon={<CalendarArrowUp />}
          label={HELM_COPY.scheduledMoveThis}
          subtitle={HELM_COPY.scheduledMoveSubtitle}
          hasChevron
          onClick={() => setView({ kind: 'move', key: run.key })}
        />
        <ActionRow
          icon={<PenLine />}
          label={HELM_COPY.scheduledChangeRun}
          subtitle={HELM_COPY.scheduledChangeRunSubtitle}
          hasChevron
          onClick={() => setForm({ runKey: run.key, token: Date.now() })}
        />
      </div>
      <div className='space-y-3 pt-4'>
        <SectionDivider label={HELM_COPY.scheduledOtherChoices} />
        <ActionRow
          icon={<SkipForward />}
          label={HELM_COPY.scheduledSkipThis}
          subtitle={
            after
              ? HELM_COPY.scheduledSkipSubtitle(
                  `${formatRunDay(after.day)} at ${formatClockWords(after.time)}`,
                )
              : HELM_COPY.scheduledSkipLast
          }
          onClick={() => skip(run.key)}
        />
      </div>
    </div>
  );

  const moveRange =
    run && view.kind === 'move'
      ? readMoveRange(state, homeZone, {
          key: run.key,
          now,
          lastRunDay:
            action.lastRunDueAt === null
              ? null
              : toDayKeyIn(action.lastRunDueAt, zone),
        })
      : null;

  const moveView = run && view.kind === 'move' && (
    <MoveView
      key={run.key}
      run={run}
      range={moveRange}
      after={after ? formatRunDay(after.day) : null}
      rule={words}
      time={action.time}
      onCancel={() => setView({ kind: 'run', key: run.key })}
      onMove={(day, time) => {
        if (!user) return;
        const isDone = report(
          moveScheduledRun(user.uid, action.id, {
            key: run.key,
            day,
            time,
          }),
          HELM_COPY.scheduledMoved(
            `${formatRunDay(day)} at ${formatClockWords(time ?? run.time)}`,
          ),
        );
        if (isDone) back();
      }}
    />
  );

  const title =
    view.kind === 'pause'
      ? HELM_COPY.scheduledPauseTitle(action.title)
      : view.kind === 'run' && run
        ? formatRun(run, zone)
        : view.kind === 'move'
          ? HELM_COPY.scheduledMoveTitle
          : action.title;
  const subtitle =
    view.kind === 'main' ? `${words} · ${readZoneName(zone)}` : null;
  const body =
    view.kind === 'pause'
      ? pauseView
      : view.kind === 'run' && runView
        ? runView
        : view.kind === 'move' && moveView
          ? moveView
          : main;

  return (
    <>
      <DetailSheet
        isOpen={form === null}
        onClose={close}
        title={title}
        viewKey={view.kind === 'main' ? 'main' : `${view.kind}`}
      >
        <div className='space-y-4'>
          {view.kind !== 'main' && (
            <BackLink
              onBack={
                view.kind === 'move' && run
                  ? () => setView({ kind: 'run', key: run.key })
                  : back
              }
              label={
                view.kind === 'move' && run
                  ? formatRunDay(run.day)
                  : action.title
              }
            />
          )}
          {subtitle && (
            <p className='text-muted-foreground -mt-2 text-[13px] text-pretty'>
              {subtitle}
            </p>
          )}
          {body}
        </div>
      </DetailSheet>
      {form && (
        <ScheduledForm
          key={form.token}
          action={action}
          runKey={form.runKey}
          onClose={() => setForm(null)}
          onSaved={() => back()}
        />
      )}
    </>
  );
}

interface PauseViewProps {
  title: string;
  nextWords: string | null;
  today: string;
  onCancel: () => void;
  onPause: (choice: PauseChoice, day: string | null) => void;
}

function PauseView({
  nextWords,
  today,
  onCancel,
  onPause,
}: Omit<PauseViewProps, 'title'> & { title: string }) {
  const [choice, setChoice] = useState<PauseChoice>('next');
  const [day, setDay] = useState('');
  const tomorrow = shiftDayKeyBy(today, 1);
  const canPause = choice !== 'until' || day >= tomorrow;
  return (
    <div className='space-y-4'>
      <RadioRows
        value={choice}
        onChange={setChoice}
        rows={[
          {
            value: 'next',
            label: HELM_COPY.scheduledPauseNext,
            subtitle: nextWords
              ? HELM_COPY.scheduledPauseNextSubtitle(nextWords)
              : undefined,
          },
          { value: 'until', label: HELM_COPY.scheduledPauseUntil },
          {
            value: 'open',
            label: HELM_COPY.scheduledPauseOpen,
            subtitle: HELM_COPY.scheduledPauseOpenSubtitle,
          },
        ]}
      />
      {choice === 'until' && (
        <DateInput
          aria-label={HELM_COPY.scheduledPauseUntil}
          value={day}
          min={tomorrow}
          onChange={(event) => setDay(event.target.value)}
        />
      )}
      <ModalFooterActions
        note={
          choice === 'until' && !canPause
            ? HELM_COPY.scheduledPauseNeedsDay
            : null
        }
        cancelAction={
          <Button type='button' variant='tertiary' onClick={onCancel}>
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            disabled={!canPause}
            onClick={() => onPause(choice, choice === 'until' ? day : null)}
          >
            {HELM_COPY.scheduledPauseAction}
          </Button>
        }
      />
    </div>
  );
}

interface MoveViewProps {
  run: RunRow;
  range: { earliest: string; latest: string | null } | null;
  after: string | null;
  rule: string;
  time: string;
  onCancel: () => void;
  onMove: (day: string, time: string | null) => void;
}

function MoveView({
  run,
  range,
  after,
  rule,
  time: ruleTime,
  onCancel,
  onMove,
}: MoveViewProps) {
  const [day, setDay] = useState(run.day);
  const [time, setTime] = useState(run.time);
  const isDayValid =
    range !== null &&
    day >= range.earliest &&
    (range.latest === null || day <= range.latest);
  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <label className='block text-sm font-medium'>
          {HELM_COPY.scheduledDayLabel}
          <DateInput
            className='mt-1.5'
            value={day}
            min={range?.earliest}
            max={range?.latest ?? undefined}
            onChange={(event) => setDay(event.target.value)}
          />
        </label>
        {range && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {range.latest
              ? HELM_COPY.scheduledMoveRange(
                  formatRunDay(range.earliest),
                  formatRunDay(range.latest),
                )
              : HELM_COPY.scheduledMoveFrom(formatRunDay(range.earliest))}
          </p>
        )}
      </div>
      <div className='space-y-1.5'>
        <label className='block text-sm font-medium'>
          {HELM_COPY.scheduledTimeLabel}
          <Input
            className='helm-field mt-1.5'
            type='time'
            variant='outline'
            value={time}
            onChange={(event) => setTime(event.target.value)}
          />
        </label>
      </div>
      {after && (
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.scheduledMoveStays(
            after,
            rule,
            formatClockWords(ruleTime),
          )}
        </p>
      )}
      <ModalFooterActions
        cancelAction={
          <Button type='button' variant='tertiary' onClick={onCancel}>
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            disabled={!isDayValid || time === ''}
            onClick={() => onMove(day, time === run.time ? null : time)}
          >
            {HELM_COPY.scheduledMoveAction}
          </Button>
        }
      />
    </div>
  );
}

export default ScheduledSheet;
