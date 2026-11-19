import { Button } from '@moondreamsdev/dreamer-ui/components';

import AmountHero from '@/components/AmountHero';
import BackLink from '@/components/BackLink';
import FoldedDateField from '@/components/FoldedDateField';
import { PillGroup } from '@/components/PillGroup';
import {
  fromDateInputValue,
  toLocalDateInputValue,
} from '@/utils/dateInputUtils';
import { parseMoneyToCents } from '@/utils/moneyUtils';
import StatusViewFooter from '@apps/going-once/components/things/StatusViewFooter';
import { PAYMENT_METHOD_OPTIONS } from '@apps/going-once/constants';
import { useStatusWrite } from '@apps/going-once/hooks/useStatusWrite';
import { changeBundleStatus } from '@apps/going-once/store/actions/bundleActions';
import type { Bundle, Item } from '@apps/going-once/types';
import { formatSplitLine } from '@apps/going-once/utils/bundleWords';
import type { SoldDraft } from '@apps/going-once/utils/statusDrafts';

interface BundlePaidViewProps {
  bundle: Bundle;
  /** The things the sale covers, for the split. */
  deal: Item[];
  /** Marking the bundle sold, or fixing what a sold one was paid. */
  mode: 'SELL' | 'CHANGE';
  uid: string;
  now: number;
  draft: SoldDraft;
  onDraft: (next: SoldDraft) => void;
  footerNode: HTMLElement | null;
  onBack: () => void;
  onLeave: () => void;
  onDone: () => void;
}

/** What they paid for the whole bundle, prefilled with its price, with the split across its things shown before it saves. */
function BundlePaidView({
  bundle,
  deal,
  mode,
  uid,
  now,
  draft,
  onDraft,
  footerNode,
  onBack,
  onLeave,
  onDone,
}: BundlePaidViewProps) {
  const { isBusy, refusal, write } = useStatusWrite();
  const today = toLocalDateInputValue(now);
  const isChange = mode === 'CHANGE';
  const priceCents = parseMoneyToCents(draft.amount);
  const isUnchanged =
    isChange && priceCents === (bundle.sale?.priceCents ?? null);

  const save = async () => {
    const soldOn = fromDateInputValue(draft.soldOn);
    if (priceCents === null || soldOn === undefined) return;
    const isSaved = await write(() =>
      changeBundleStatus(
        bundle.saleId,
        bundle.id,
        uid,
        isChange
          ? { kind: 'CHANGE_PAID', priceCents }
          : { kind: 'MARK_SOLD', priceCents, method: draft.method, soldOn },
      ),
    );
    if (isSaved) onDone();
  };

  const getNote = () => {
    if (priceCents === null) return 'Enter what they paid';
    return isUnchanged ? 'Change the amount first' : null;
  };

  return (
    <div className='space-y-5 [@media(max-height:499px)]:space-y-3'>
      <div className='space-y-2'>
        <BackLink
          onBack={onBack}
          label={isChange ? 'Change what was paid' : bundle.name}
        />
        <p className='text-lg font-semibold'>What did they pay?</p>
      </div>
      <div className='space-y-2'>
        <AmountHero
          label='Paid'
          value={draft.amount}
          onChange={(amount) => onDraft({ ...draft, amount })}
          autoFocus
          disabled={refusal !== null}
        />
        {priceCents !== null && deal.length > 0 && (
          <p className='text-muted-foreground text-center text-sm text-pretty'>
            {formatSplitLine(priceCents, deal)}
          </p>
        )}
      </div>
      {!isChange && (
        <>
          <div className='space-y-2'>
            <p className='text-muted-foreground text-sm'>
              How they paid (optional)
            </p>
            <PillGroup
              label='How they paid'
              options={PAYMENT_METHOD_OPTIONS}
              value={draft.method}
              onChange={(next) =>
                onDraft({
                  ...draft,
                  method: next === draft.method ? null : next,
                })
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
        </>
      )}
      <StatusViewFooter
        footerNode={footerNode}
        note={getNote()}
        lockedNote={refusal}
        onDone={onLeave}
      >
        <Button
          type='button'
          size='lg'
          rounded='full'
          className='w-full'
          disabled={priceCents === null || isUnchanged || isBusy}
          onClick={() => void save()}
        >
          {isChange ? 'Save' : 'Mark sold'}
        </Button>
      </StatusViewFooter>
    </div>
  );
}

export default BundlePaidView;
