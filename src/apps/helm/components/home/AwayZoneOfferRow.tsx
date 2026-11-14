import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import {
  formatSpanDays,
  type AwayZoneOffer,
} from '@apps/helm/engine/whereabouts';
import { useTodayKey } from '@apps/helm/hooks/useTodayKey';
import {
  addZoneSpan,
  removeZoneSpan,
} from '@apps/helm/store/actions/settingsActions';

interface AwayZoneOfferRowProps {
  offer: AwayZoneOffer;
}

const quietClass = 'text-muted-foreground ml-[30px] text-[13px] text-pretty';

/** Under the answer that wrote an away span in another zone: those days follow its clock, once per span, with Not now and Use it, then one line with Undo. */
function AwayZoneOfferRow({ offer }: AwayZoneOfferRowProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const todayKey = useTodayKey();
  const isUsed = useAppSelector((state) =>
    state.helm.profile?.zoneSpans.some((span) => span.awayId === offer.awayId),
  );
  const [isDismissed, setIsDismissed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const run = (write: () => Promise<unknown>) => {
    if (isBusy) return;
    setIsBusy(true);
    void write()
      .catch((error: unknown) => {
        console.error('Helm away clock was not saved', error);
        addToast({ title: HELM_COPY.fieldSaveFailed, type: 'error' });
      })
      .finally(() => setIsBusy(false));
  };

  if (isUsed) {
    return (
      <div className='ml-[30px] flex items-baseline justify-between gap-3'>
        <p className='text-muted-foreground min-w-0 text-[13px] text-pretty'>
          {HELM_COPY.zoneOfferOn(
            offer.cityName,
            formatSpanDays(offer.from, offer.to),
          )}
        </p>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          disabled={isBusy}
          onClick={() =>
            user && run(() => removeZoneSpan(user.uid, offer.awayId))
          }
        >
          {HELM_COPY.zoneOfferUndo}
        </Button>
      </div>
    );
  }
  if (isDismissed) {
    return <p className={quietClass}>{HELM_COPY.zoneOfferLater}</p>;
  }

  return (
    <div className='helm-card ml-[30px] w-[calc(100%-30px)] space-y-2 p-3.5'>
      <p className='text-[15px] font-medium'>{offer.label}</p>
      <p className='text-muted-foreground text-[13px] text-pretty'>
        {HELM_COPY.zoneOfferLine(offer.cityName)}
      </p>
      <div className='flex justify-end gap-2'>
        <Button
          type='button'
          variant='tertiary'
          size='sm'
          onClick={() => setIsDismissed(true)}
        >
          {HELM_COPY.zoneOfferNotNow}
        </Button>
        <Button
          type='button'
          size='sm'
          loading={isBusy}
          onClick={() =>
            user &&
            run(() =>
              addZoneSpan(
                user.uid,
                {
                  zone: offer.zone,
                  from: offer.from,
                  to: offer.to,
                  awayId: offer.awayId,
                },
                todayKey,
              ),
            )
          }
        >
          {HELM_COPY.zoneOfferUse}
        </Button>
      </div>
    </div>
  );
}

export default AwayZoneOfferRow;
