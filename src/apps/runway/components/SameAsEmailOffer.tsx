import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { EMAIL_WORDS } from '@apps/runway/components/emailWords';
import { SameAsChoices } from '@apps/runway/components/SameAsOffer';
import { getEmailOffers } from '@apps/runway/engine/emailTwins';
import { selectEmailTwins } from '@apps/runway/store/selectors/emailSelectors';
import type { OpenPurchase } from '@apps/runway/types';
import { getPurchaseTitle } from '@apps/runway/utils/purchaseText';

interface SameAsEmailOfferProps {
  purchase: OpenPurchase;
  onDone: () => void;
}

/** The emailed purchases a bank charge may be when none is clearly it, nearest day first; a pick carries what was chosen for the email. */
function SameAsEmailOffer({ purchase, onDone }: SameAsEmailOfferProps) {
  const twins = useAppSelector(selectEmailTwins);
  const needsHome = useAppSelector((state) => state.runway.needsHome);
  const recent = useAppSelector((state) => state.runway.purchases);

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

  return (
    <SameAsChoices
      purchase={purchase}
      offered={offered}
      title={EMAIL_WORDS.sameTitle}
      toRow={(email) => ({
        name: getPurchaseTitle(email, () => ''),
        detail: EMAIL_WORDS.sameRow(formatDateOrdinalUTC(email.date)),
      })}
      onDone={onDone}
    />
  );
}

export default SameAsEmailOffer;
