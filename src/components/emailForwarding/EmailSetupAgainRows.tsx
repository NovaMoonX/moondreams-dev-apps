import { useState } from 'react';

import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { KeyRound, RotateCcw } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import { EMAIL_FORWARDING_WORDS } from '@/components/emailForwarding/emailForwardingWords';
import { getErrorMessage } from '@/utils/errorUtils';

interface EmailSetupAgainRowsProps {
  /** Opens the walkthrough again; the app starts a new walk (`startedAt` now) so only what arrives after it ticks. */
  onSetUpAgain: () => void;
  /** Rotates the address; runs only after the person confirms that the old one stops working. */
  onGetNewAddress: () => Promise<void>;
  /** Told the sentence to show when the new address could not be made. */
  onFailed: (message: string) => void;
}

/** The two quiet rows under a working setup: walk the steps again, or get a new address (which asks first). */
function EmailSetupAgainRows({
  onSetUpAgain,
  onGetNewAddress,
  onFailed,
}: EmailSetupAgainRowsProps) {
  const { confirm } = useActionModal();
  const [isBusy, setIsBusy] = useState(false);

  const getNewAddress = async () => {
    const isConfirmed = await confirm({
      title: EMAIL_FORWARDING_WORDS.newAddressTitle,
      message: EMAIL_FORWARDING_WORDS.newAddressMessage,
      confirmText: EMAIL_FORWARDING_WORDS.newAddress,
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsBusy(true);
    try {
      await onGetNewAddress();
    } catch (error) {
      onFailed(getErrorMessage(error, EMAIL_FORWARDING_WORDS.addressFailed));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <ActionGroup>
      <ActionRow
        isGrouped
        icon={<RotateCcw />}
        label={EMAIL_FORWARDING_WORDS.setUpAgain}
        subtitle={EMAIL_FORWARDING_WORDS.setUpAgainSub}
        onClick={onSetUpAgain}
      />
      <ActionRow
        isGrouped
        icon={<KeyRound />}
        label={EMAIL_FORWARDING_WORDS.newAddress}
        subtitle={EMAIL_FORWARDING_WORDS.newAddressSub}
        isDisabled={isBusy}
        onClick={() => void getNewAddress()}
      />
    </ActionGroup>
  );
}

export default EmailSetupAgainRows;
