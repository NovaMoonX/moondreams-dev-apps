import { Button } from '@moondreamsdev/dreamer-ui/components';
import type { ReactNode } from 'react';
import { ChevronRight, ListOrdered } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useLocalStoragePreference } from '@/hooks/useLocalStoragePreference';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { PRIORITIES_NUDGE_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  selectBills,
  selectEnvelopes,
  selectGoals,
} from '@apps/runway/store/selectors/runwaySelectors';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';

const DISMISSED_KEY_PREFIX = 'runway.prioritiesNudgeDismissed.';
const MIN_ITEMS = 3;

/** Asks the person to sort priorities while every item is still the default; gone once one changes, or for good on this device once hidden. */
function PrioritiesNudge({ isHeldBack, otherwise }: PrioritiesNudgeProps) {
  const { user } = useAuth();
  return user ? (
    <PrioritiesNudgeRow
      key={user.uid}
      uid={user.uid}
      isHeldBack={isHeldBack}
      otherwise={otherwise}
    />
  ) : (
    otherwise
  );
}

interface PrioritiesNudgeProps {
  /** True while something more pressing asks on the same screen, or while that is still being worked out: then neither it nor what stands in for it draws. */
  isHeldBack: boolean;
  /** Drawn in its place when it doesn't apply, so a screen asks one thing at a time. */
  otherwise: ReactNode;
}

function PrioritiesNudgeRow({
  uid,
  isHeldBack,
  otherwise,
}: PrioritiesNudgeProps & { uid: string }) {
  const today = todayAsUtcDate(useNow(60_000));
  const { openMoreEntry } = useRunwayUrlState();
  const [isDismissed, setIsDismissed] = useLocalStoragePreference(
    `${DISMISSED_KEY_PREFIX}${uid}`,
    false,
  );
  const priorities = useAppSelector((state) =>
    [
      ...selectBills(state, today),
      ...selectEnvelopes(state, today),
      ...selectGoals(state, today),
    ]
      .map(({ version }) => version.payload.priority)
      .join(','),
  );
  const listed = priorities === '' ? [] : priorities.split(',');
  const isUnsorted =
    listed.length >= MIN_ITEMS && listed.every((value) => value === 'should');

  if (isHeldBack) return null;
  if (isDismissed || !isUnsorted) return otherwise;
  return (
    <section
      aria-label={PRIORITIES_NUDGE_WORDS.title}
      className='bg-card border-border flex flex-col rounded-2xl border'
    >
      <Button
        type='button'
        variant='tertiary'
        className='hover:bg-muted/60 h-auto min-h-0 min-w-0 flex-1 justify-start gap-3 rounded-2xl px-4! pt-3.5! pb-1! text-left max-[359px]:px-3!'
        onClick={() => openMoreEntry('priorities')}
      >
        <ListOrdered
          className='text-muted-foreground h-5 w-5 shrink-0'
          aria-hidden='true'
        />
        <span className='min-w-0 flex-1'>
          <span className='text-foreground block text-sm leading-5 font-medium'>
            {PRIORITIES_NUDGE_WORDS.title}
          </span>
          <span className='text-muted-foreground mt-0.5 block text-xs leading-4'>
            {PRIORITIES_NUDGE_WORDS.subtitle}
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
          onClick={() => setIsDismissed(true)}
        >
          {PRIORITIES_NUDGE_WORDS.dismiss}
        </Button>
      </div>
    </section>
  );
}

export default PrioritiesNudge;
