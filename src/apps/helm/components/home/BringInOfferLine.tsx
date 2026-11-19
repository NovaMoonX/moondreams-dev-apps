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
import { readMentionedOffer } from '@apps/helm/engine/bringIn';
import { markBringInTold } from '@apps/helm/store/actions/settingsActions';

/** `uid|appId` to the turn each offer was shown under, so the line stays there until the person leaves even after it is marked told. */
const shownFor = new Map<string, string>();
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

/** Said once per app, under the person's newest turn, and only when its words name someone or a pet an app holds that the circle doesn't; the connection's page and Connected apps carry the offer the rest of the time. */
function BringInOfferLine({
  turnId,
  words,
}: {
  turnId: string;
  words: string;
}) {
  const { user } = useAuth();
  const offers = useBringInOffers();
  const toldAt = useAppSelector(
    (state) => state.helm.profile?.bringInToldAt ?? null,
  );
  const isProfileLoaded = useAppSelector(
    (state) => state.helm.profile !== null,
  );
  const uid = user?.uid ?? '';
  const stays = offers.filter(
    (offer) => shownFor.get(toSessionKey(uid, offer.appId)) === turnId,
  );
  const mentioned =
    isProfileLoaded && user
      ? readMentionedOffer(words, offers, { told: toldAt })
      : null;
  const shown = stays.length > 0 ? stays : mentioned ? [mentioned] : [];

  const shownKey = shown.map((offer) => offer.appId).join('|');
  useEffect(() => {
    if (!user) return;
    shownKey
      .split('|')
      .filter(Boolean)
      .forEach((appId) => {
        const key = toSessionKey(user.uid, appId);
        if (shownFor.has(key)) return;
        shownFor.set(key, turnId);
        markBringInTold(user.uid, appId, Date.now()).catch((error: unknown) =>
          console.error('Helm bring-in offer was not marked told', error),
        );
      });
  }, [user, shownKey, turnId]);

  return (
    <>
      {shown.map((offer) => (
        <OfferLine key={offer.grantId} offer={offer} />
      ))}
    </>
  );
}

export default BringInOfferLine;
