import { useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import FoldedDateField from '@/components/FoldedDateField';
import InlineNotice from '@/components/InlineNotice';
import { PillGroup } from '@/components/PillGroup';
import {
  fromDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import {
  centsToInputValue,
  formatCentsShort,
  parseMoneyToCents,
} from '@/utils/moneyUtils';
import StatusViewFooter from '@apps/going-once/components/things/StatusViewFooter';
import { PAYMENT_METHOD_OPTIONS } from '@apps/going-once/constants';
import { changeStatus } from '@apps/going-once/store/actions/statusActions';
import type { Item, PaymentMethod } from '@apps/going-once/types';
import { formatAskingPrice } from '@apps/going-once/utils/listing';

interface MarkSoldViewProps {
  item: Item;
  uid: string;
  now: number;
  footerNode: HTMLElement | null;
  onBack: () => void;
  onSold: () => void;
}

/** What they paid, prefilled with the asking price; under the floor it warns and still saves, and a refusal stays here with its reason. */
function MarkSoldView({
  item,
  uid,
  now,
  footerNode,
  onBack,
  onSold,
}: MarkSoldViewProps) {
  const today = toLocalDateInputValue(now);
  const [amount, setAmount] = useState(
    centsToInputValue(item.askingPriceCents),
  );
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [soldOn, setSoldOn] = useState(today);
  const [isBusy, setIsBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const priceCents = parseMoneyToCents(amount);
  const { floorPriceCents } = item;
  const isUnderFloor =
    priceCents !== null &&
    floorPriceCents !== null &&
    priceCents < floorPriceCents;
  const asking = formatAskingPrice(item.askingPriceCents);
  const askingLine = [
    asking === null ? null : `Asking ${asking}`,
    floorPriceCents === null
      ? null
      : `🔒 floor ${formatCentsShort(floorPriceCents)}`,
  ]
    .filter((part) => part !== null)
    .join(' · ');

  const markSold = async () => {
    const soldOnDate = fromDateInputValue(soldOn);
    if (priceCents === null || soldOnDate === undefined) return;
    setIsBusy(true);
    const result = await changeStatus(item.saleId, item.id, uid, {
      kind: 'MARK_SOLD',
      priceCents,
      method,
      soldOn: soldOnDate,
    });
    setIsBusy(false);
    if (result.ok) onSold();
    else setRefusal(result.message);
  };

  const getNote = () => {
    if (refusal !== null) return refusal;
    return priceCents === null ? 'Enter what they paid' : null;
  };

  return (
    <div className='space-y-5'>
      <div className='space-y-2'>
        <BackLink onBack={onBack} label='Mark sold' />
        <p className='text-lg font-semibold'>What did they pay?</p>
      </div>
      <div className='space-y-2'>
        <AmountHero
          label='Paid'
          value={amount}
          onChange={setAmount}
          autoFocus
          disabled={refusal !== null}
        />
        {askingLine !== '' && (
          <p className='text-muted-foreground text-center text-sm'>
            {askingLine}
          </p>
        )}
      </div>
      {isUnderFloor && refusal === null && floorPriceCents !== null && (
        <InlineNotice tone='warning'>
          That&apos;s under your floor price of{' '}
          {formatCentsShort(floorPriceCents)}. It still saves.
        </InlineNotice>
      )}
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>
          How they paid (optional)
        </p>
        <PillGroup
          label='How they paid'
          options={PAYMENT_METHOD_OPTIONS}
          value={method}
          onChange={(next) => setMethod(next === method ? null : next)}
        />
      </div>
      <FoldedDateField
        label='Sold on'
        value={soldOn}
        onChange={setSoldOn}
        todayValue={today}
        max={today}
      />
      <StatusViewFooter
        footerNode={footerNode}
        note={getNote()}
        isRefusal={refusal !== null}
      >
        {refusal === null ? (
          <Button
            type='button'
            size='lg'
            rounded='full'
            className='w-full'
            disabled={priceCents === null || isBusy}
            onClick={() => void markSold()}
          >
            Mark sold
          </Button>
        ) : (
          <Button
            type='button'
            size='lg'
            rounded='full'
            className='w-full'
            onClick={onBack}
          >
            Done
          </Button>
        )}
      </StatusViewFooter>
    </div>
  );
}

export default MarkSoldView;
