import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useLocalStorageState } from '@/hooks/useLocalStorageState';
import { useAppSelector } from '@/store';
import { msToDayKey } from '@/utils/cadenceUtils';
import { HELM_COPY } from '@apps/helm/constants';
import {
  formatSpanDays,
  type AwayZoneOffer,
} from '@apps/helm/engine/whereabouts';
import { useTodayKey } from '@apps/helm/hooks/useTodayKey';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  pauseScheduledActionsForSpan,
  unpauseScheduledActionsForSpan,
} from '@apps/helm/store/actions/scheduledActionWrites';
import { setWhoWhere } from '@apps/helm/store/actions/whoActions';

interface AwayPauseOfferRowProps {
  offer: Pick<AwayZoneOffer, 'awayId' | 'from' | 'to'>;
}

const dismissedKey = (awayId: string) => `helm-pause-offer-not-now:${awayId}`;

const parseDismissed = (stored: unknown) =>
  stored === true || stored === 1 ? true : null;

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
  const [isDismissed, setIsDismissed] = useLocalStorageState(
    dismissedKey(offer.awayId),
    false,
    parseDismissed,
  );
  const [isBusy, setIsBusy] = useState(false);
  const [keptCount, setKeptCount] = useState(0);

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

  const span = {
    awayId: offer.awayId,
    fromDay: msToDayKey(offer.from),
    toDay: msToDayKey(offer.to),
  };

  const pause = () =>
    run(async () => {
      if (!user) return;
      const paused = pauseScheduledActionsForSpan(user.uid, span);
      setKeptCount(paused.kept);
      await Promise.all([paused.written, mark(true)]);
    });

  const undo = () =>
    run(async () => {
      if (!user) return;
      const { notPutBack } = await unpauseScheduledActionsForSpan(
        user.uid,
        span,
      );
      await mark(null);
      setKeptCount(0);
      if (notPutBack > 0)
        addToast({
          title: HELM_COPY.awayPauseNotPutBack(notPutBack),
          type: 'info',
        });
    });

  if (!self || (!isMarked && !hasActions)) return null;
  if (isMarked) {
    return (
      <div className='ml-[30px] flex items-baseline justify-between gap-3'>
        <p className='text-muted-foreground min-w-0 text-[13px] text-pretty'>
          {HELM_COPY.awayPauseOn(formatSpanDays(offer.from, offer.to))}
          {keptCount > 0 && ` ${HELM_COPY.awayPauseKept(keptCount)}`}
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
