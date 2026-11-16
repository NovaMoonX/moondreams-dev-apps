import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CalendarClock } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import UndoButton from '@apps/helm/components/activity/UndoButton';
import ScheduledSheet from '@apps/helm/components/scheduled/ScheduledSheet';
import { useScheduledChange } from '@apps/helm/components/scheduled/useScheduledChange';
import { HELM_COPY } from '@apps/helm/constants';
import { canRunNow } from '@apps/helm/engine/scheduledActions';
import { useOnceVisible } from '@apps/helm/hooks/useOnceVisible';
import { markCaptureSeen } from '@apps/helm/store/actions/captureActions';
import {
  runScheduledActionNow,
  skipScheduledRun,
} from '@apps/helm/store/actions/scheduledActionWrites';
import { selectExecutionsById } from '@apps/helm/store/selectors/captureSelectors';
import {
  selectScheduledById,
  selectScheduledRuns,
  type ScheduledRunLine,
} from '@apps/helm/store/selectors/scheduledSelectors';
import { toDayKey } from '@apps/helm/utils/planDays';

const TODAY_CAP = 3;

interface ScheduledRunLinesProps {
  /** Today shows the unseen runs, the ones seen today and any that failed; Activity shows the last run of every action. */
  scope: 'today' | 'activity';
  onOpenConnectedApps: () => void;
  onOpenActivity: () => void;
}

interface RunLineProps {
  run: ScheduledRunLine;
  onOpenConnectedApps: () => void;
  onOpen: (actionId: string) => void;
}

function RunLine({ run, onOpenConnectedApps, onOpen }: RunLineProps) {
  const { user } = useAuth();
  const now = useNow(60_000);
  const { guard, report, toast } = useScheduledChange();
  const ref = useRef<HTMLDivElement>(null);
  const action = useAppSelector(selectScheduledById).get(run.actionId) ?? null;
  const execution = useAppSelector(selectExecutionsById).get(
    run.executionId ?? '',
  );
  useOnceVisible(
    ref,
    run.isUnseen && run.captureId !== null && user !== null,
    async () => {
      if (!user || !run.captureId) return;
      await markCaptureSeen(user.uid, run.captureId).catch((error: unknown) => {
        console.error('Helm scheduled run was not marked seen', error);
        throw error;
      });
    },
  );
  const [isWorking, setIsWorking] = useState(false);
  const isFailed = run.outcome === 'failed';
  const isRunnable =
    isFailed &&
    action !== null &&
    canRunNow({
      status: action.status,
      lastOutcome: action.lastOutcome,
      nextRunAt: action.nextRunAt,
      now,
    });
  const reconnects =
    run.reason === 'notConnected' || run.reason === 'grantExpired';

  const runNow = () => {
    if (!user || isWorking) return;
    setIsWorking(true);
    const result = runScheduledActionNow(user.uid, run.actionId);
    if (result.refused) {
      guard({ refused: result.refused });
      setIsWorking(false);
      return;
    }
    result.written
      .catch((error: unknown) => {
        console.error('Helm run now was not saved', error);
        toast({ title: HELM_COPY.scheduledSaveFailed, type: 'error' });
      })
      .finally(() => setIsWorking(false));
  };

  return (
    <div ref={ref} className='helm-card space-y-3 p-4'>
      <Button
        type='button'
        variant='tertiary'
        className='flex h-auto w-full min-w-0 items-start justify-start gap-3 p-0 text-left font-normal'
        onClick={() => onOpen(run.actionId)}
      >
        <CalendarClock
          className='text-muted-foreground mt-0.5 size-5 shrink-0'
          aria-hidden='true'
        />
        <span className='min-w-0 flex-1 text-[15px] leading-[21px] text-pretty break-words'>
          {run.line}
        </span>
      </Button>
      {isFailed && (
        <div className='flex flex-col items-start gap-2 pl-8'>
          {reconnects && (
            <Button
              type='button'
              variant='secondary'
              size='sm'
              onClick={onOpenConnectedApps}
            >
              {HELM_COPY.scheduledReconnect}
            </Button>
          )}
          {isRunnable && (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              disabled={isWorking}
              onClick={runNow}
            >
              {HELM_COPY.scheduledRunNow}
            </Button>
          )}
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            onClick={() =>
              user &&
              report(
                skipScheduledRun(user.uid, run.actionId, null),
                HELM_COPY.scheduledSkippedNext(run.title),
              )
            }
          >
            {HELM_COPY.scheduledRunSkip}
          </Button>
        </div>
      )}
      {!isFailed && execution && (
        <div className='pl-8'>
          <UndoButton execution={execution} lineCount={1} />
        </div>
      )}
    </div>
  );
}

/** The outcome of scheduled runs as one line each: on Today what has not been looked at yet (and what failed), in Activity the last run of every action. Never a push. */
function ScheduledRunLines({
  scope,
  onOpenConnectedApps,
  onOpenActivity,
}: ScheduledRunLinesProps) {
  const runs = useAppSelector(selectScheduledRuns);
  const homeZone =
    useAppSelector((state) => state.helm.profile?.timeZone) ?? 'UTC';
  const [openId, setOpenId] = useState<string | null>(null);
  const todayKey = toDayKey(useNow(60_000), homeZone);
  const shown =
    scope === 'activity'
      ? runs
      : runs.filter(
          (run) =>
            run.isUnseen ||
            run.outcome === 'failed' ||
            (run.seenAt !== null &&
              toDayKey(run.seenAt, homeZone) === todayKey),
        );
  const lines = scope === 'today' ? shown.slice(0, TODAY_CAP) : shown;
  const more = shown.length - lines.length;
  if (shown.length === 0) return null;

  return (
    <>
      <div className='space-y-3'>
        {lines.map((run) => (
          <RunLine
            key={run.id}
            run={run}
            onOpenConnectedApps={onOpenConnectedApps}
            onOpen={setOpenId}
          />
        ))}
        {more > 0 && (
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='text-muted-foreground px-0'
            onClick={onOpenActivity}
          >
            {HELM_COPY.scheduledMoreInActivity(more)}
          </Button>
        )}
      </div>
      <ScheduledSheet
        actionId={openId}
        onClose={() => setOpenId(null)}
        onOpenActivity={onOpenActivity}
      />
    </>
  );
}

export default ScheduledRunLines;
