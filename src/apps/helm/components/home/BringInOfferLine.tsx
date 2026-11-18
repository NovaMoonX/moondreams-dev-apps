import { useEffect, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import AssistantLine from '@apps/helm/components/activity/AssistantLine';
import BringInSheet from '@apps/helm/components/connections/BringInSheet';
import { HELM_COPY } from '@apps/helm/constants';
import {
  useBringInOffers,
  type BringInOffer,
} from '@apps/helm/hooks/useBringInOffers';
import { markBringInTold } from '@apps/helm/store/actions/settingsActions';

/** `uid|appId` of each offer this session has already shown, so the line stays until the person leaves even after it is marked told. */
const shownThisSession = new Set<string>();
const toSessionKey = (uid: string, appId: string) => `${uid}|${appId}`;

function OfferLine({ offer }: { offer: BringInOffer }) {
  const [isOpen, setIsOpen] = useState(false);
  // The sheet keeps the offer it opened for, so its Undo stays after the circle fills.
  const [held, setHeld] = useState<BringInOffer | null>(null);
  return (
    <div className='flex flex-col gap-2'>
      <AssistantLine>{offer.line}</AssistantLine>
      <div className='ml-[30px] flex'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          className='relative after:absolute after:inset-x-0 after:-inset-y-1.5'
          onClick={() => {
            setHeld(offer);
            setIsOpen(true);
          }}
        >
          {HELM_COPY.bringInOfferAction}
        </Button>
      </div>
      {held && (
        <BringInSheet
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          offer={held}
        />
      )}
    </div>
  );
}

/** What a connected app holds that the circle doesn't, said once in the conversation as the assistant's own line, with the review one tap away; the connection's page keeps the offer after. */
function BringInOfferLine() {
  const { user } = useAuth();
  const offers = useBringInOffers();
  const toldAt = useAppSelector(
    (state) => state.helm.profile?.bringInToldAt ?? null,
  );
  const isProfileLoaded = useAppSelector(
    (state) => state.helm.profile !== null,
  );
  const shown = offers.filter(
    (offer) =>
      isProfileLoaded &&
      (shownThisSession.has(toSessionKey(user?.uid ?? '', offer.appId)) ||
        toldAt?.[offer.appId] === undefined),
  );

  const shownKey = shown.map((offer) => offer.appId).join('|');
  useEffect(() => {
    if (!user) return;
    shownKey
      .split('|')
      .filter(Boolean)
      .forEach((appId) => {
        const key = toSessionKey(user.uid, appId);
        if (shownThisSession.has(key)) return;
        shownThisSession.add(key);
        markBringInTold(user.uid, appId, Date.now()).catch((error: unknown) =>
          console.error('Helm bring-in offer was not marked told', error),
        );
      });
  }, [user, shownKey]);

  return (
    <>
      {shown.map((offer) => (
        <OfferLine key={offer.grantId} offer={offer} />
      ))}
    </>
  );
}

export default BringInOfferLine;
