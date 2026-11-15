import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { keepFormedOnToday } from '@apps/helm/store/actions/habitActions';
import { readFormedSummary } from '@apps/helm/store/actions/habitJudgementActions';
import type { Habit, OpenHabit } from '@apps/helm/types';

interface HabitFormedOfferProps {
  habit: OpenHabit;
  dayKey: string;
  timeZone: string;
  isTaking: boolean;
  /** Hands over the summary this offer already read, so taking it off needs no second read. */
  onTakeOff: (summary: NonNullable<Habit['formedSummary']> | null) => void;
}

/** "This one's formed": offered a week after it reached Formed. Taking it off Today is the one action, with what it kept under it; keeping it on Today is a quiet line below and is asked again after a longer wait. */
function HabitFormedOffer({
  habit,
  dayKey,
  timeZone,
  isTaking,
  onTakeOff,
}: HabitFormedOfferProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const summary =
    useQuery({
      queryKey: ['helm', 'formedSummary', user?.uid, habit.id, dayKey],
      queryFn: () =>
        readFormedSummary(user?.uid ?? '', habit, dayKey, timeZone),
      enabled: user !== null,
      staleTime: Infinity,
    }).data ?? null;

  const keep = () => {
    if (!user) return;
    keepFormedOnToday(user.uid, habit).catch((error: unknown) => {
      console.error('Helm formed offer was not kept', error);
      addToast({ title: HELM_COPY.habitFormedFailed, type: 'error' });
    });
    addToast({ title: HELM_COPY.habitFormedKept, type: 'info' });
  };

  return (
    <section className='helm-card border-primary/40 space-y-3 border border-dashed p-4'>
      <p className='text-foreground text-[15px] leading-[21px] font-medium text-pretty'>
        {`${HELM_COPY.habitFormedTitle(habit.name)}. ${HELM_COPY.habitFormedAsk}`}
      </p>
      <div className='space-y-1.5'>
        <Button
          type='button'
          className='w-full'
          loading={isTaking}
          onClick={() => onTakeOff(summary)}
        >
          {HELM_COPY.habitFormedTake}
        </Button>
        {summary && (
          <p className='text-muted-foreground text-center text-[13px]'>
            {HELM_COPY.habitFormedEvidence(
              summary.doneCount,
              formatDateShortUTC(summary.since),
            )}
          </p>
        )}
      </div>
      <div className='border-border flex justify-center border-t pt-3'>
        <Button type='button' variant='tertiary' size='sm' onClick={keep}>
          {HELM_COPY.habitFormedKeep}
        </Button>
      </div>
    </section>
  );
}

export default HabitFormedOffer;
