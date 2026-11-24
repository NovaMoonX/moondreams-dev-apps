import { useState } from 'react';
import { X } from 'lucide-react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { EMAIL_WORDS } from '@apps/runway/components/emailWords';
import ItemRow from '@apps/runway/components/ItemRow';
import { NEEDS_HOME_WORDS } from '@apps/runway/constants';
import { getEmailOffers } from '@apps/runway/engine/emailTwins';
import { useMergeWithUndo } from '@apps/runway/hooks/useBankMatch';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { markNotSamePurchase } from '@apps/runway/store/actions/purchaseActions';
import { selectEmailTwins } from '@apps/runway/store/selectors/emailSelectors';
import type { OpenPurchase } from '@apps/runway/types';
import { getPurchaseTitle } from '@apps/runway/utils/purchaseText';

interface SameAsEmailOfferProps {
  purchase: OpenPurchase;
  onDone: () => void;
}

/** The emailed purchases a bank charge may be when none is clearly it: tapping one makes them one purchase, carrying what was chosen for the email, and "None of these" stops offering them. */
function SameAsEmailOffer({ purchase, onDone }: SameAsEmailOfferProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const twins = useAppSelector(selectEmailTwins);
  const needsHome = useAppSelector((state) => state.runway.needsHome);
  const recent = useAppSelector((state) => state.runway.purchases);
  const merge = useMergeWithUndo();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byId = new Map(
    [...needsHome, ...recent].map((entry) => [entry.id, entry]),
  );
  const offered = getEmailOffers(twins, purchase.id)
    .flatMap((id) => byId.get(id) ?? [])
    .sort(
      (a, b) =>
        Math.abs(a.date - purchase.date) - Math.abs(b.date - purchase.date) ||
        a.id.localeCompare(b.id),
    );

  const pick = async (email: OpenPurchase) => {
    if (!user || busyId !== null) return;
    setBusyId(email.id);
    setError(null);
    try {
      await merge(user.uid, [{ bank: purchase, typed: email }], true);
      onDone();
    } catch (pickError) {
      setError(getErrorMessage(pickError, NEEDS_HOME_WORDS.failed));
      setBusyId(null);
    }
  };

  const decline = async () => {
    if (!user || busyId !== null) return;
    setBusyId('none');
    setError(null);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await Promise.all(
        offered.map((email) =>
          markNotSamePurchase(user.uid, encryption, email, [purchase.id]),
        ),
      );
      addToast({ title: NEEDS_HOME_WORDS.notSameDone, type: 'success' });
    } catch (declineError) {
      setError(getErrorMessage(declineError, NEEDS_HOME_WORDS.failed));
    }
    setBusyId(null);
  };

  if (offered.length === 0) return null;
  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>{EMAIL_WORDS.sameTitle}</p>
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {offered.map((email) => {
          const name = getPurchaseTitle(email, () => '');
          const detail = EMAIL_WORDS.sameRow(formatDateOrdinalUTC(email.date));
          return (
            <ItemRow
              key={email.id}
              name={name}
              detail={detail}
              figure={formatCents(email.amountCents)}
              ariaLabel={`${name}, ${detail}`}
              isAction
              onOpen={() => void pick(email)}
            />
          );
        })}
        <ItemRow
          leading={
            <span
              className='border-border bg-accent text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl border'
              aria-hidden='true'
            >
              <X className='h-5 w-5' />
            </span>
          }
          name={NEEDS_HOME_WORDS.notSame}
          detail={NEEDS_HOME_WORDS.notSameSub}
          isPrivate={false}
          ariaLabel={`${NEEDS_HOME_WORDS.notSame}, ${NEEDS_HOME_WORDS.notSameSub}`}
          isAction
          onOpen={() => void decline()}
        />
      </ul>
      {error && (
        <p className='text-destructive text-sm' role='alert'>
          {error}
        </p>
      )}
    </div>
  );
}

export default SameAsEmailOffer;
