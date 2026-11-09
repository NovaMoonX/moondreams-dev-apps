import { useState, type ReactNode } from 'react';
import { CalendarClock, ChevronRight } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import HorizonPlanView from '@apps/runway/components/HorizonPlanView';
import { HORIZON_PLAN_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  getLinkedEventId,
  getTargetDateSetOn,
  shouldNudgeHorizon,
} from '@apps/runway/engine/horizonGoal';
import HorizonForm, { type HorizonSeed } from '@apps/runway/forms/HorizonForm';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { dismissHorizonNudge } from '@apps/runway/store/actions/planActions';
import {
  selectAllHorizonItems,
  selectGoals,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { GoalSealed } from '@apps/runway/types';

interface HorizonNudgeProps {
  /** Drawn in its place when no goal is asking, so Home asks one thing at a time. */
  otherwise?: ReactNode;
}

/** Asks about the soonest dated goal whose date is near and that no event draws from: "Know what it'll cost?" opens the same which-event step as the goal's sheet; "Don't ask again" keeps it quiet for that goal and date. */
function HorizonNudge({ otherwise = null }: HorizonNudgeProps) {
  const today = todayAsUtcDate(useNow(60_000));
  const { user } = useAuth();
  const { addToast } = useToast();
  const goals = useAppSelector((state) => selectGoals(state, today));
  const events = useAppSelector((state) => selectAllHorizonItems(state, today));
  const versions = useAppSelector((state) => state.runway.versions);
  const dismissed = useAppSelector(
    (state) => state.runway.plan?.horizonNudgeDismissed ?? null,
  );
  const [isPlanning, setIsPlanning] = useState(false);
  const [seed, setSeed] = useState<HorizonSeed | null>(null);

  const asking = goals
    .filter(({ item, version }) =>
      shouldNudgeHorizon({
        targetDate: version.payload.targetDate,
        setOn:
          version.payload.targetDate === null
            ? null
            : getTargetDateSetOn(
                versions.flatMap((entry) =>
                  entry.itemId === item.id && entry.kind === 'goal'
                    ? [
                        {
                          effectiveFrom: entry.effectiveFrom,
                          targetDate: (entry.payload as GoalSealed).targetDate,
                        },
                      ]
                    : [],
                ),
                version.payload.targetDate,
              ),
        today,
        isLinked:
          getLinkedEventId(
            item.id,
            events.map((event) => ({
              id: event.item.id,
              horizon: event.version.payload,
            })),
          ) !== null,
        dismissedDate: dismissed?.[item.id],
      }),
    )
    .sort(
      (a, b) =>
        (a.version.payload.targetDate ?? 0) -
        (b.version.payload.targetDate ?? 0),
    )[0];

  if (!asking) return otherwise;
  const { item, version } = asking;
  const goal = version.payload;
  const targetDate = goal.targetDate ?? today;

  const dismiss = async () => {
    if (!user) return;
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await dismissHorizonNudge(user.uid, encryption, item.id, targetDate);
    } catch {
      addToast({ title: HORIZON_PLAN_WORDS.nudgeDismissFailed, type: 'error' });
    }
  };

  const close = () => {
    setSeed(null);
    setIsPlanning(false);
  };

  return (
    <section
      aria-label={HORIZON_PLAN_WORDS.nudgeTitle}
      className='bg-card border-border flex flex-col rounded-2xl border'
    >
      <Button
        type='button'
        variant='tertiary'
        className='hover:bg-muted/60 h-auto min-h-0 min-w-0 flex-1 justify-start gap-3 rounded-2xl px-4! pt-3.5! pb-1! text-left max-[359px]:px-3!'
        onClick={() => setIsPlanning(true)}
      >
        <CalendarClock
          className='text-muted-foreground h-5 w-5 shrink-0'
          aria-hidden='true'
        />
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block text-sm leading-5 font-medium'>
            {HORIZON_PLAN_WORDS.nudgeTitle}
          </span>
          <span className='text-muted-foreground mt-0.5 block text-xs leading-4'>
            {HORIZON_PLAN_WORDS.nudgeSub(
              goal.name,
              formatDateOrdinalUTC(targetDate),
            )}
          </span>
        </span>
        <ChevronRight
          className='text-muted-foreground h-5 w-5 shrink-0'
          aria-hidden='true'
        />
      </Button>
      <div className='flex justify-end px-2 pb-1.5'>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          className='text-muted-foreground! relative text-xs after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[""]'
          onClick={() => void dismiss()}
        >
          {HORIZON_PLAN_WORDS.nudgeDismiss}
        </Button>
      </div>
      {isPlanning && (
        <FormSheet
          isOpen
          isDrawerWhenShort
          onClose={close}
          title={goal.name}
          actions={<ValuesEyeButton />}
        >
          <HorizonPlanView
            source={{
              kind: 'goal',
              goalId: item.id,
              name: goal.name,
              emoji: goal.emoji,
              targetCents: goal.targetCents,
              targetDate: goal.targetDate,
            }}
            today={today}
            onBack={close}
            onNewEvent={setSeed}
            onClose={close}
          />
        </FormSheet>
      )}
      {seed !== null && (
        <HorizonForm
          isOpen
          title={HORIZON_PLAN_WORDS.newEvent}
          seed={seed}
          onClose={() => setSeed(null)}
          onSaved={close}
        />
      )}
    </section>
  );
}

export default HorizonNudge;
