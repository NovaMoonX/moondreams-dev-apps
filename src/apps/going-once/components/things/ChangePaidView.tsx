import { Button } from '@moondreamsdev/dreamer-ui/components';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import InlineNotice from '@/components/InlineNotice';
import { formatCentsShort, parseMoneyToCents } from '@/utils/moneyUtils';
import StatusViewFooter from '@apps/going-once/components/things/StatusViewFooter';
import { useStatusWrite } from '@apps/going-once/hooks/useStatusWrite';
import { changeStatus } from '@apps/going-once/store/actions/statusActions';
import type { Item } from '@apps/going-once/types';
import {
  describeMovedOn,
  formatCollectedChange,
} from '@apps/going-once/utils/status';

interface ChangePaidViewProps {
  item: Item;
  uid: string;
  /** What the sale has collected so far, every sold thing counted. */
  collectedCents: number;
  amount: string;
  onAmount: (amount: string) => void;
  footerNode: HTMLElement | null;
  /** Back, asking first when something was typed. */
  onBack: () => void;
  /** Leaves at once, for Done after a refusal. */
  onLeave: () => void;
  onSaved: () => void;
}

/** Fixes what a sold thing was paid, and says what that does to Collected before it saves. */
function ChangePaidView({
  item,
  uid,
  collectedCents,
  amount,
  onAmount,
  footerNode,
  onBack,
  onLeave,
  onSaved,
}: ChangePaidViewProps) {
  const paidCents = item.sale?.priceCents ?? 0;
  const { isBusy, refusal, write } = useStatusWrite();
  const priceCents = parseMoneyToCents(amount);
  const isChanged = priceCents !== null && priceCents !== paidCents;
  const { floorPriceCents } = item;
  const lockedNote =
    refusal ?? (isBusy ? null : describeMovedOn(item, ['SOLD']));

  const save = async () => {
    if (priceCents === null) return;
    const isSaved = await write(() =>
      changeStatus(item.saleId, item.id, uid, {
        kind: 'CHANGE_PAID',
        priceCents,
      }),
    );
    if (isSaved) onSaved();
  };

  return (
    <div className='space-y-5'>
      <div className='space-y-2'>
        <BackLink onBack={onBack} label='Change what was paid' />
        <p className='text-lg font-semibold'>What did they pay?</p>
      </div>
      <AmountHero
        label='Paid'
        value={amount}
        onChange={onAmount}
        autoFocus
        disabled={lockedNote !== null}
      />
      {isChanged && (
        <p className='text-muted-foreground text-center text-sm'>
          {formatCollectedChange(
            collectedCents,
            collectedCents - paidCents + priceCents,
          )}
        </p>
      )}
      {priceCents !== null &&
        floorPriceCents !== null &&
        priceCents < floorPriceCents &&
        lockedNote === null && (
          <InlineNotice tone='warning'>
            That&apos;s under your floor price of{' '}
            {formatCentsShort(floorPriceCents)}. It still saves.
          </InlineNotice>
        )}
      <StatusViewFooter
        footerNode={footerNode}
        note={priceCents === null ? 'Enter what they paid' : null}
        lockedNote={lockedNote}
        onDone={onLeave}
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
