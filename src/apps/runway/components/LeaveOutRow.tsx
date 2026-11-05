import { useState } from 'react';
import { Ban } from 'lucide-react';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import ActionRow from '@/components/ActionRow';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/utils/errorUtils';
import { NEEDS_HOME_WORDS } from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { assignPurchase } from '@apps/runway/store/actions/purchaseActions';
import type { OpenPurchase } from '@apps/runway/types';
import { describePurchaseAssigned } from '@apps/runway/utils/purchaseText';

interface LeaveOutRowProps {
  purchase: OpenPurchase;
  onDone: () => void;
}

/** Takes a waiting purchase out of spending, whether it is money in or a charge; a failure reads in the row's own subtitle. */
function LeaveOutRow({ purchase, onDone }: LeaveOutRowProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const leaveOut = async () => {
    if (!user || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      await assignPurchase(
        user.uid,
        await getRunwayEncryption(user.uid),
        purchase,
        [],
        describePurchaseAssigned(purchase, [], () => ''),
      );
      addToast({ title: NEEDS_HOME_WORDS.leftOut, type: 'success' });
      onDone();
    } catch (leaveError) {
      setError(getErrorMessage(leaveError, NEEDS_HOME_WORDS.failed));
      setIsBusy(false);
    }
  };

  return (
    <ActionRow
      isGrouped
      isRoomy
      icon={<Ban />}
      label={NEEDS_HOME_WORDS.leaveOut}
      subtitle={error ?? NEEDS_HOME_WORDS.leaveOutSub}
      isDisabled={isBusy}
      onClick={() => void leaveOut()}
    />
  );
}

export default LeaveOutRow;
