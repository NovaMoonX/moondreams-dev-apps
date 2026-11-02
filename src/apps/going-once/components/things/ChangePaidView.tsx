import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import { centsToInputValue, parseMoneyToCents } from '@/utils/moneyUtils';
import StatusViewFooter from '@apps/going-once/components/things/StatusViewFooter';
import { changeStatus } from '@apps/going-once/store/actions/statusActions';
import type { Item } from '@apps/going-once/types';
import { formatCollectedChange } from '@apps/going-once/utils/status';

interface ChangePaidViewProps {
  item: Item;
  uid: string;
  /** What the sale has collected so far, every sold thing counted. */
  collectedCents: number;
  footerNode: HTMLElement | null;
  onBack: () => void;
  onSaved: () => void;
}

/** Fixes what a sold thing was paid, and says what that does to Collected before it saves. */
function ChangePaidView({
  item,
  uid,
  collectedCents,
  footerNode,
  onBack,
  onSaved,
}: ChangePaidViewProps) {
  const paidCents = item.sale?.priceCents ?? 0;
  const [amount, setAmount] = useState(centsToInputValue(paidCents));
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const priceCents = parseMoneyToCents(amount);
  const isChanged = priceCents !== null && priceCents !== paidCents;

  const save = async () => {
    if (priceCents === null) return;
    setIsBusy(true);
    setError(null);
    const result = await changeStatus(item.saleId, item.id, uid, {
      kind: 'CHANGE_PAID',
      priceCents,
    });
    setIsBusy(false);
    if (result.ok) onSaved();
    else setError(result.message);
  };

  return (
    <div className='space-y-5'>
      <div className='space-y-2'>
        <BackLink onBack={onBack} label='Change what was paid' />
        <p className='text-lg font-semibold'>What did they pay?</p>
      </div>
      <AmountHero label='Paid' value={amount} onChange={setAmount} autoFocus />
      {isChanged && (
        <p className='text-muted-foreground text-center text-sm'>
          {formatCollectedChange(
            collectedCents,
            collectedCents - paidCents + priceCents,
          )}
        </p>
      )}
      <StatusViewFooter
        footerNode={footerNode}
        note={error}
        isRefusal={error !== null}
      >
        <Button
          type='button'
          size='lg'
          rounded='full'
          className='w-full'
          disabled={!isChanged || isBusy}
          onClick={() => void save()}
        >
          Save
        </Button>
      </StatusViewFooter>
    </div>
  );
}

export default ChangePaidView;
