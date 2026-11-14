import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { HELM_COPY } from '@apps/helm/constants';
import {
  ABILITY_OFFER_WAIT_MS,
  LEVEL_RANK,
} from '@apps/helm/engine/whereabouts';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  declineAbilityOffer,
  setPhoneLocation,
} from '@apps/helm/store/actions/settingsActions';
import type { AbilityOffer } from '@apps/helm/types';
import {
  readPosition,
  type PositionFailure,
} from '@apps/helm/utils/phoneLocation';

interface AbilityOfferRowProps {
  offer: AbilityOffer;
}

const rowClass = 'helm-card ml-[30px] w-[calc(100%-30px)] space-y-2 p-3.5';
const quietClass = 'text-muted-foreground ml-[30px] text-[13px] text-pretty';

/** Under an answer that a finer phone location would improve: what it keeps, Not now and Turn on. Turn on asks the phone inside the tap; it folds to one line once either is chosen, and a phone that said no shows how to allow it. */
function AbilityOfferRow({ offer }: AbilityOfferRowProps) {
  const { user } = useAuth();
  const now = useNow(60_000);
  const setting = useAppSelector(
    (state) => state.helm.profile?.phoneLocation ?? 'off',
  );
  const declines = useAppSelector((state) => state.helm.profile?.abilityOffers);
  const [problem, setProblem] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  if (offer.mode === 'settingsLine') {
    return <p className={quietClass}>{HELM_COPY.abilityOfferSettingsLine}</p>;
  }
  if (LEVEL_RANK[setting] >= LEVEL_RANK[offer.level]) {
    return (
      <p className={quietClass}>{HELM_COPY.abilityOfferOn(offer.level)}</p>
    );
  }
  if (declines?.some(
      (entry) =>
        entry.level === offer.level &&
        now - entry.declinedAt < ABILITY_OFFER_WAIT_MS,
    )) {
    return <p className={quietClass}>{HELM_COPY.abilityOfferLater}</p>;
  }

  const turnOn = () => {
    if (!user || isBusy) return;
    setProblem(null);
    setIsBusy(true);
    void readPosition(offer.level)
      .then(
        async () => {
          const result = await setPhoneLocation(
            user.uid,
            await getHelmEncryption(user.uid),
            offer.level,
          );
          if (result !== 'saved') {
            setProblem(
              result === 'offline'
                ? HELM_COPY.editNeedsConnection
                : HELM_COPY.phoneLocationSaveFailed,
            );
          }
        },
        (failure: PositionFailure) => {
          setProblem(
            {
              denied: HELM_COPY.abilityOfferSettingsLine,
              unsupported: HELM_COPY.phoneLocationUnsupported,
              failed: HELM_COPY.phoneLocationFailed,
            }[failure],
          );
        },
      )
      .catch((error: unknown) => {
        console.error('Helm phone location was not turned on', error);
        setProblem(HELM_COPY.phoneLocationSaveFailed);
      })
      .finally(() => setIsBusy(false));
  };

  const notNow = () => {
    if (!user) return;
    void declineAbilityOffer(user.uid, {
      ability: offer.ability,
      level: offer.level,
    }).catch((error: unknown) => {
      console.error('Helm location offer was not put off', error);
      setProblem(HELM_COPY.phoneLocationSaveFailed);
    });
  };

  return (
    <div className={rowClass}>
      <p className='text-[15px] font-medium'>
        {HELM_COPY.abilityOfferLabel(offer.level)}
      </p>
      <p className='text-muted-foreground text-[13px] text-pretty'>
        {HELM_COPY.phoneLocationKeeps[offer.level]}
      </p>
      {problem && (
        <p className='text-[13px] text-pretty' role='status'>
          {problem}
        </p>
      )}
      <div className='flex justify-end gap-2'>
        <Button type='button' variant='tertiary' size='sm' onClick={notNow}>
          {HELM_COPY.abilityOfferNotNow}
        </Button>
        <Button type='button' size='sm' loading={isBusy} onClick={turnOn}>
          {HELM_COPY.abilityOfferTurnOn}
        </Button>
      </div>
    </div>
  );
}

export default AbilityOfferRow;
