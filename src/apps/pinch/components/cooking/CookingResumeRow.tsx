import { useEffect, useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight, CookingPot, X } from 'lucide-react';

import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatClock } from '@/utils/durationUtils';
import { usePinchOverlay } from '@apps/pinch/hooks/usePinchOverlay';
import { askIfCookingSessionLive } from '@apps/pinch/lib/cookingSessionPresence';
import {
  clearCookingSession,
  readCookingSession,
} from '@apps/pinch/lib/cookingSessionStorage';
import { cancelTimerPush } from '@apps/pinch/lib/timerPush';
import {
  selectPlannedMeals,
  selectRecipesById,
} from '@apps/pinch/store/selectors';
import {
  getCookingSessionKey,
  getResumeTimerLine,
  getTimerReminderIds,
  resolveCookingResume,
  type CookingResumePlan,
  type CookingSnapshot,
} from '@apps/pinch/utils/cookSession';
import { getMonthWindow } from '@apps/pinch/utils/dayKeys';

interface CookingResumeRowProps {
  uid: string;
}

function CookingResumeRow({ uid }: CookingResumeRowProps) {
  const { openSubview } = usePinchOverlay();
  const recipesById = useAppSelector(selectRecipesById);
  const plannedMeals = useAppSelector(selectPlannedMeals);
  const [snapshot, setSnapshot] = useState(() =>
    readCookingSession(uid, Date.now()),
  );
  const [notLiveFor, setNotLiveFor] = useState<string | null>(null);
  const sessionId = snapshot?.sessionId ?? null;
  const windowKey = useAppSelector(
    (state) => state.pinch.plannedMeals.windowKey,
  );
  const loadedMeals = useMemo(
    () => ({
      ids: new Set(plannedMeals.map((meal) => meal.id)),
      window: windowKey === null ? null : getMonthWindow(windowKey),
    }),
    [plannedMeals, windowKey],
  );
  const plan = useMemo(
    () =>
      snapshot === null
        ? null
        : resolveCookingResume(snapshot, recipesById, loadedMeals),
    [snapshot, recipesById, loadedMeals],
  );

  useEffect(() => {
    if (sessionId === null) return;
    return askIfCookingSessionLive(sessionId, (isLive) =>
      setNotLiveFor(isLive ? null : sessionId),
    );
  }, [sessionId]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === getCookingSessionKey(uid)) {
        setSnapshot(readCookingSession(uid, Date.now()));
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [uid]);

  useEffect(() => {
    if (snapshot === null || plan !== null) return;
    getTimerReminderIds(snapshot.resume.timers).forEach(cancelTimerPush);
    clearCookingSession(uid);
  }, [snapshot, plan, uid]);

  if (snapshot === null || plan === null || notLiveFor !== sessionId) {
    return null;
  }

  const keepCooking = () =>
    openSubview({
      kind: 'cook',
      recipeId: plan.open.recipeId,
      servings: plan.open.servings,
      plannedMealId: plan.open.plannedMealId ?? undefined,
      plate: plan.open.plate,
      resume: plan.resume,
    });
  const dismiss = () => {
    getTimerReminderIds(snapshot.resume.timers).forEach(cancelTimerPush);
    clearCookingSession(uid);
    setSnapshot(null);
  };

  return (
    <ResumeCard
      snapshot={snapshot}
      plan={plan}
      onKeep={keepCooking}
      onDismiss={dismiss}
    />
  );
}

interface ResumeCardProps {
  snapshot: CookingSnapshot;
  plan: CookingResumePlan;
  onKeep: () => void;
  onDismiss: () => void;
}

function ResumeCard({ snapshot, plan, onKeep, onDismiss }: ResumeCardProps) {
  const now = useNow(1000);
  const timerLine = getResumeTimerLine(
    snapshot.resume.timers,
    now,
    formatClock,
  );
  const dishName = plan.dishTitle ?? plan.title;

  return (
    <section
      aria-label='Pick up cooking'
      className='bg-accent/60 border-border flex min-h-12 items-stretch rounded-2xl border'
    >
      <Button
        type='button'
        variant='tertiary'
        className='hover:bg-accent h-auto min-h-0 min-w-0 flex-1 justify-start gap-3 rounded-2xl px-3! py-1! text-left max-[359px]:gap-2 max-[359px]:px-2!'
        onClick={onKeep}
      >
        <CookingPot className='h-5 w-5 shrink-0' aria-hidden='true' />
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block truncate text-sm leading-5 font-medium'>
            <span className='sr-only'>Keep cooking. </span>
            Pick up step {plan.stepNumber}?
          </span>
          <span className='text-muted-foreground flex gap-1 text-xs leading-4 font-normal'>
            <span className='min-w-0 shrink-10 truncate'>
              {timerLine === null ? dishName : `${dishName} ·`}
            </span>
            {timerLine !== null && (
              <span className='max-w-full shrink-0 truncate'>{timerLine}</span>
            )}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground h-5 w-5 shrink-0'
          aria-hidden='true'
        />
      </Button>
      <Button
        type='button'
        variant='tertiary'
        size='icon'
        aria-label='Not now'
        title='Not now'
        className='text-foreground! mr-1 size-10 min-w-10 shrink-0 self-center rounded-full p-0'
        onClick={onDismiss}
      >
        <X className='h-5 w-5' aria-hidden='true' />
      </Button>
    </section>
  );
}

export default CookingResumeRow;
