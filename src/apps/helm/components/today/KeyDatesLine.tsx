import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Cake, CalendarHeart, ChevronRight } from 'lucide-react';

import { useAppSelector } from '@/store';
import { HELM_COPY, TODAY_KEY_DATES } from '@apps/helm/constants';
import { useTodayKey } from '@apps/helm/hooks/useTodayKey';
import { selectUpcomingKeyDates } from '@apps/helm/store/selectors/keyDateSelectors';
import { formatTodayLine } from '@apps/helm/utils/keyDateUpcoming';

interface KeyDatesLineProps {
  onOpenWho: (whoId: string) => void;
  onOpenComingUp: () => void;
}

const ROW =
  'flex h-auto w-full min-w-0 items-center gap-3 rounded-none border-0 px-4 py-2.5 text-left focus-visible:-outline-offset-2';

/** The dates that come back in the next 7 days, at most three quiet lines, each a door to whose it is, then "+N more this week" into Coming up. Nothing when there are none. */
function KeyDatesLine({ onOpenWho, onOpenComingUp }: KeyDatesLineProps) {
  const todayKey = useTodayKey();
  const dates = useAppSelector((state) =>
    selectUpcomingKeyDates(state, todayKey),
  );
  if (dates.length === 0) return null;
  const more = dates.length - TODAY_KEY_DATES;

  return (
    <section aria-label={HELM_COPY.keyDatesWeekLabel}>
      <ul className='helm-card divide-border divide-y overflow-hidden'>
        {dates.slice(0, TODAY_KEY_DATES).map((date) => (
          <li key={date.id}>
            <Button
              type='button'
              variant='tertiary'
              className={ROW}
              onClick={() => onOpenWho(date.whoId)}
            >
              {date.kind === 'birthday' ? (
                <Cake
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
              ) : (
                <CalendarHeart
                  className='text-muted-foreground size-4 shrink-0'
                  aria-hidden='true'
                />
              )}
              <span className='text-foreground min-w-0 flex-1 text-[14px] leading-5 break-words'>
                {formatTodayLine(date)}
              </span>
              <ChevronRight
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </li>
        ))}
        {more > 0 && (
          <li>
            <Button
              type='button'
              variant='tertiary'
              className={ROW}
              onClick={onOpenComingUp}
            >
              <span className='text-muted-foreground min-w-0 flex-1 text-[14px] leading-5'>
                {HELM_COPY.keyDatesMoreThisWeek(more)}
              </span>
              <ChevronRight
                className='text-muted-foreground size-4 shrink-0'
                aria-hidden='true'
              />
            </Button>
          </li>
        )}
      </ul>
    </section>
  );
}

export default KeyDatesLine;
