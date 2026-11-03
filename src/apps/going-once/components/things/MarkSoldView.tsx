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
import { formatCentsShort, parseMoneyToCents } from '@/utils/moneyUtils';
import StatusViewFooter from '@apps/going-once/components/things/StatusViewFooter';
import { PAYMENT_METHOD_OPTIONS } from '@apps/going-once/constants';
import { useStatusWrite } from '@apps/going-once/hooks/useStatusWrite';
import { changeStatus } from '@apps/going-once/store/actions/statusActions';
import type { Item } from '@apps/going-once/types';
import { formatAskingPrice, getItemName } from '@apps/going-once/utils/listing';
import { describeMovedOn } from '@apps/going-once/utils/status';
import type { SoldDraft } from '@apps/going-once/utils/statusDrafts';

interface MarkSoldViewProps {
  item: Item;
  uid: string;
  now: number;
  draft: SoldDraft;
  onDraft: (next: SoldDraft) => void;
  footerNode: HTMLElement | null;
  /** Back, asking first when something was typed. */
  onBack: () => void;
  /** Leaves at once, for Done after a refusal. */
  onLeave: () => void;
  onSold: () => void;
  /** For a thing given away: the same act as More's Take off the list. */
  onTakeOff: () => void;
}

/** What they paid, prefilled with the asking price; under the floor it warns and still saves, and a refusal stays here with its reason. */
function MarkSoldView({
  item,
  uid,
  now,
  draft,
  onDraft,
  footerNode,
  onBack,
  onLeave,
  onSold,
  onTakeOff,
}: MarkSoldViewProps) {
  const today = toLocalDateInputValue(now);
  const { isBusy, refusal, write } = useStatusWrite();
  const priceCents = parseMoneyToCents(draft.amount);
  const { floorPriceCents } = item;
  const isUnderFloor =
    item.askingPriceCents !== 0 &&
    priceCents !== null &&
    floorPriceCents !== null &&
    priceCents < floorPriceCents;
  const lockedNote =
    refusal ??
    (isBusy ? null : describeMovedOn(item, ['AVAILABLE', 'PENDING']));
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
    const soldOnDate = fromDateInputValue(draft.soldOn);
    if (priceCents === null || soldOnDate === undefined) return;
    const isSold = await write(() =>
      changeStatus(item.saleId, item.id, uid, {
        kind: 'MARK_SOLD',
        priceCents,
        method: draft.method,
        soldOn: soldOnDate,
      }),
    );
    if (isSold) onSold();
  };

  return (
    <div className='space-y-5 [@media(max-height:499px)]:space-y-3'>
      <div className='space-y-2'>
        <BackLink onBack={onBack} label={getItemName(item)} />
        <p className='text-lg font-semibold'>What did they pay?</p>
      </div>
      <div className='space-y-2'>
        <AmountHero
          label='Paid'
          value={draft.amount}
          onChange={(amount) => onDraft({ ...draft, amount })}
          autoFocus
          disabled={lockedNote !== null}
        />
        {askingLine !== '' && (
          <p className='text-muted-foreground text-center text-sm'>
            {askingLine}
          </p>
        )}
      </div>
      {isUnderFloor && lockedNote === null && floorPriceCents !== null && (
        <InlineNotice tone='warning'>
          That&apos;s under your floor price of{' '}
          {formatCentsShort(floorPriceCents)}. It still saves.
        </InlineNotice>
      )}
      {priceCents === 0 && lockedNote === null && (
        <div className='flex flex-wrap items-center gap-x-2'>
          <p className='text-muted-foreground text-sm'>Gave it away?</p>
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className='h-10 px-2'
            onClick={onTakeOff}
          >
            Take it off the list instead
          </Button>
        </div>
      )}
      <div className='space-y-2'>
        <p className='text-muted-foreground text-sm'>
          How they paid (optional)
        </p>
        <PillGroup
          label='How they paid'
          options={PAYMENT_METHOD_OPTIONS}
          value={draft.method}
          onChange={(next) =>
            onDraft({ ...draft, method: next === draft.method ? null : next })
          }
        />
      </div>
      <FoldedDateField
        label='Sold on'
        value={draft.soldOn}
        onChange={(soldOn) => onDraft({ ...draft, soldOn })}
        todayValue={today}
        max={today}
      />
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
          disabled={priceCents === null || isBusy}
          onClick={() => void markSold()}
        >
          Mark sold
        </Button>
      </StatusViewFooter>
    </div>
  );
}

export default MarkSoldView;
