import { useState } from 'react';
import { Scale } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import InlineNotice from '@/components/InlineNotice';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateOrdinal } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import BankBalanceChoice from '@apps/runway/components/BankBalanceChoice';
import { LINK_WORDS } from '@apps/runway/constants';
import { useCanLinkBank } from '@apps/runway/hooks/useCanLinkBank';
import {
  useApplyBankBalance,
  useBankBalanceOffer,
  type BalanceTarget,
} from '@apps/runway/hooks/useBankBalance';
import { useMaskedText } from '@apps/runway/hooks/useMaskedText';

interface BankBalanceRowProps {
  target: BalanceTarget;
}

/** A linked account's door to the bank's figure while it differs from the plan's: the choice is offered again here until it is answered. */
function BankBalanceRow({ target }: BankBalanceRowProps) {
  const canLink = useCanLinkBank();
  const mask = useMaskedText();
  const offer = useBankBalanceOffer(target);
  const apply = useApplyBankBalance();
  const [isOpen, setIsOpen] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!canLink || offer === null) return null;

  const takeBanks = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      await apply(target, offer.bankCents);
      setIsOpen(false);
    } catch (applyError) {
      setError(getErrorMessage(applyError, LINK_WORDS.updateFailed));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <>
      <ActionRow
        isGrouped
        hasChevron
        icon={<Scale />}
        label={LINK_WORDS.useBankRow}
        subtitle={mask(
          LINK_WORDS.bankSays(
            formatCents(offer.bankCents),
            formatDateOrdinal(offer.asOf),
          ),
        )}
        onClick={() => {
          setError(null);
          setIsOpen(true);
        }}
      />
      <FormSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={LINK_WORDS.useBankTitle}
        actions={<ValuesEyeButton />}
      >
        <div className='space-y-3'>
          <BankBalanceChoice
            yoursCents={offer.yoursCents}
            bankCents={offer.bankCents}
            isBusy={isBusy}
            onUseBanks={() => void takeBanks()}
            onKeepMine={() => setIsOpen(false)}
          />
          {error && <InlineNotice tone='warning'>{error}</InlineNotice>}
        </div>
      </FormSheet>
    </>
  );
}

export default BankBalanceRow;
