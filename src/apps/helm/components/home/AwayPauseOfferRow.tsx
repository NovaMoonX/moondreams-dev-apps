import { useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { msToDayKey } from '@/utils/cadenceUtils';
import { HELM_COPY } from '@apps/helm/constants';
import {
  formatSpanDays,
  type AwayZoneOffer,
} from '@apps/helm/engine/whereabouts';
import { useTodayKey } from '@apps/helm/hooks/useTodayKey';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { pauseScheduledActionsForSpan } from '@apps/helm/store/actions/scheduledActionWrites';
import { setWhoWhere } from '@apps/helm/store/actions/whoActions';

interface AwayPauseOfferRowProps {
  offer: Pick<AwayZoneOffer, 'awayId' | 'from' | 'to'>;
}

const dismissedKey = (awayId: string) => `helm-pause-offer-not-now:${awayId}`;

const readDismissed = (awayId: string) => {
  try {
    return localStorage.getItem(dismissedKey(awayId)) === '1';
  } catch {
    return false;
  }
};

const keepDismissed = (awayId: string) => {
  try {
    localStorage.setItem(dismissedKey(awayId), '1');
  } catch {
    return;
  }
};

/** Under the answer that wrote a time-away span, when the person has scheduled actions: pause the ones that run at home while they are away, now and for ones made during the span; once per span, with Not now and Pause them, then one line with Undo. */
function AwayPauseOfferRow({ offer }: AwayPauseOfferRowProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const todayKey = useTodayKey();
  const self = useAppSelector((state) =>
    state.helm.who.items.find((who) => who.isSelf),
  );
  const hasActions = useAppSelector((state) =>
    state.helm.scheduledActions.items.some(
      (action) => action.status === 'active' && !action.isUnreadable,
    ),
  );
  const isMarked =
    self?.away?.some(
      (span) => span.id === offer.awayId && span.pausesScheduled === true,
    ) ?? false;
  const [isDismissed, setIsDismissed] = useState(() =>
    readDismissed(offer.awayId),
  );
  const [isBusy, setIsBusy] = useState(false);
  const putBack = useRef<(() => Promise<void>) | null>(null);

  const mark = async (value: boolean | null) => {
    if (!user || !self) return;
    const encryption = await getHelmEncryption(user.uid);
    await setWhoWhere(user.uid, encryption, self.id, todayKey, {
      kind: 'pauses',
      id: offer.awayId,
      value,
    });
  };

  const run = (write: () => Promise<unknown>) => {
    if (isBusy) return;
    setIsBusy(true);
    void write()
      .catch((error: unknown) => {
        console.error('Helm away pause was not saved', error);
        addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
      })
      .finally(() => setIsBusy(false));
  };

  const pause = () =>
    run(async () => {
      if (!user) return;
      const paused = pauseScheduledActionsForSpan(user.uid, {
        fromDay: msToDayKey(offer.from),
        toDay: msToDayKey(offer.to),
      });
      putBack.current = paused.undo;
      await Promise.all([paused.written, mark(true)]);
    });

  const undo = () =>
    run(async () => {
      if (!user) return;
      await mark(null);
      await putBack.current?.();
      putBack.current = null;
    });

  if (!self || (!isMarked && !hasActions)) return null;
  if (isMarked) {
    return (
      <div className='ml-[30px] flex items-baseline justify-between gap-3'>
        <p className='text-muted-foreground min-w-0 text-[13px] text-pretty'>
          {HELM_COPY.awayPauseOn(formatSpanDays(offer.from, offer.to))}
        </p>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          disabled={isBusy}
          onClick={undo}
        >
          {HELM_COPY.undo}
        </Button>
      </div>
    );
  }
  if (isDismissed) return null;

  return (
    <div className='helm-card ml-[30px] w-[calc(100%-30px)] space-y-2 p-3.5'>
      <p className='text-[15px] font-medium'>{HELM_COPY.awayPauseTitle}</p>
      <p className='text-muted-foreground text-[13px] text-pretty'>
        {HELM_COPY.awayPauseLine(formatSpanDays(offer.from, offer.to))}
      </p>
      <div className='flex justify-end gap-2'>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          onClick={() => {
            keepDismissed(offer.awayId);
            setIsDismissed(true);
          }}
        >
          {HELM_COPY.zoneOfferNotNow}
        </Button>
        <Button type='button' size='sm' loading={isBusy} onClick={pause}>
          {HELM_COPY.awayPauseAction}
        </Button>
      </div>
    </div>
  );
}

export default AwayPauseOfferRow;
