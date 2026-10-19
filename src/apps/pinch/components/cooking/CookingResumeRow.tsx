import { useEffect, useMemo, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { CookingPot } from 'lucide-react';

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
  const plannedMealIds = useMemo(
    () => new Set(plannedMeals.map((meal) => meal.id)),
    [plannedMeals],
  );
  const plan = useMemo(
    () =>
      snapshot === null
        ? null
        : resolveCookingResume(snapshot, recipesById, plannedMealIds),
    [snapshot, recipesById, plannedMealIds],
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
  const isPlate = plan.dishTitle !== null;
  const timerLine = getResumeTimerLine(
    snapshot.resume.timers,
    now,
    formatClock,
  );
  const detail = [
    isPlate ? `${plan.dishTitle}, step ${plan.stepNumber}` : null,
    timerLine,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      aria-label='Pick up cooking'
      className='bg-accent/60 border-border rounded-2xl border p-3'
    >
      <div className='flex items-start gap-3'>
        <CookingPot className='mt-0.5 h-5 w-5 shrink-0' aria-hidden='true' />
        <div className='min-w-0 flex-1'>
          <p className='text-sm font-medium text-pretty'>
            {isPlate
              ? `Pick up ${plan.title}?`
              : `Pick up ${plan.title}, step ${plan.stepNumber}?`}
          </p>
          {detail !== '' && (
            <p className='text-muted-foreground text-xs'>{detail}</p>
          )}
        </div>
      </div>
      <div className='mt-3 flex gap-2'>
        <Button type='button' className='h-10 flex-1' onClick={onKeep}>
          Keep cooking
        </Button>
        <Button
          type='button'
          variant='secondary'
          className='border-border h-10 border px-5'
          onClick={onDismiss}
        >
          Not now
        </Button>
      </div>
    </section>
  );
}

export default CookingResumeRow;
