import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { HELM_COPY } from '@apps/helm/constants';

/** After a "Keep it on Today" the offer waits four weeks. */
const KEPT_WAIT_MS = 28 * 86_400_000;

const keptKey = (habitId: string) => `helm.formedKept.${habitId}`;

const readKept = (habitId: string, now: number) => {
  try {
    const at = Number(window.localStorage.getItem(keptKey(habitId)));
    return at > 0 && now - at < KEPT_WAIT_MS;
  } catch {
    return false;
  }
};

interface HabitFormedOfferProps {
  habitId: string;
  name: string;
  now: number;
  isTaking: boolean;
  onTakeOff: () => void;
}

/** "This one's formed": offered a week after it reached Formed. Keeping it on Today changes nothing and is asked again in four weeks; taking it off leaves its weeks and count. */
function HabitFormedOffer({
  habitId,
  name,
  now,
  isTaking,
  onTakeOff,
}: HabitFormedOfferProps) {
  const [isKept, setIsKept] = useState(() => readKept(habitId, now));
  if (isKept) return null;

  const keep = () => {
    try {
      window.localStorage.setItem(keptKey(habitId), String(Date.now()));
    } catch {
      setIsKept(true);
      return;
    }
    setIsKept(true);
  };

  return (
    <section className='helm-card border-primary/40 space-y-3 border border-dashed p-4'>
      <p className='text-foreground text-[15px] leading-[21px] font-medium text-pretty'>
        {`${HELM_COPY.habitFormedTitle(name)}. ${HELM_COPY.habitFormedAsk}`}
      </p>
      <div className='flex items-center justify-between gap-3'>
        <Button type='button' variant='tertiary' size='sm' onClick={keep}>
          {HELM_COPY.habitFormedKeep}
        </Button>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          loading={isTaking}
          onClick={onTakeOff}
        >
          {HELM_COPY.habitFormedTake}
        </Button>
      </div>
    </section>
  );
}

export default HabitFormedOffer;
