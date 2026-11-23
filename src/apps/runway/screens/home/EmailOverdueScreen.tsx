import { useState } from 'react';

import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAppSelector } from '@/store';
import { EMAIL_WORDS } from '@apps/runway/components/emailWords';
import PurchaseRow from '@apps/runway/components/PurchaseRow';
import { useEmailOverduePurchases } from '@apps/runway/hooks/useEmailPurchases';
import PurchaseScreen from '@apps/runway/screens/spend/PurchaseScreen';
import { selectItemLooks } from '@apps/runway/store/selectors/runwaySelectors';
import { getPaidWithName } from '@apps/runway/utils/purchaseText';

interface EmailOverdueScreenProps {
  onClose: () => void;
}

/** The emailed purchases whose bank charge never arrived, each opening its purchase sheet, where it can be removed or left as typed. */
function EmailOverdueScreen({ onClose }: EmailOverdueScreenProps) {
  const overdue = useEmailOverduePurchases();
  const looks = useAppSelector(selectItemLooks);
  const cards = useAppSelector((state) => state.runway.cards);
  const accounts = useAppSelector((state) => state.runway.accounts);
  const [openId, setOpenId] = useState<string | null>(null);
  const opened = overdue.find((entry) => entry.id === openId) ?? null;

  return (
    <Subview
      title={EMAIL_WORDS.overdueTitle}
      onClose={onClose}
      headerAction={<ValuesEyeButton />}
      overlay
    >
      <div className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          {EMAIL_WORDS.overdueSub}
        </p>
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {overdue.map((purchase) => (
            <PurchaseRow
              key={purchase.id}
              purchase={purchase}
              looks={looks}
              paidWith={getPaidWithName(purchase, cards, accounts)}
              isBrief
              onOpen={() => setOpenId(purchase.id)}
            />
          ))}
        </ul>
      </div>
      {openId !== null && (
        <PurchaseScreen
          purchaseId={openId}
          fallback={opened}
          hasGroupLink={false}
          onClose={() => setOpenId(null)}
        />
      )}
    </Subview>
  );
}

export default EmailOverdueScreen;
