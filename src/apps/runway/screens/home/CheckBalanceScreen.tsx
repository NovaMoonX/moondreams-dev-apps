import { useState } from 'react';
import { CalendarDays, Eye, ReceiptText } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import AmountHero from '@/components/AmountHero';
import InlineNotice from '@/components/InlineNotice';
import SensitiveValue from '@/components/SensitiveValue';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import {
  ActionSection,
  ActionTitle,
} from '@apps/runway/components/ActionSection';
import { BALANCE_CHECK_WORDS } from '@apps/runway/constants';
import PurchaseForm from '@apps/runway/forms/PurchaseForm';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';

const MAX_BALANCE_CENTS = 100_000_000_000;

interface CheckBalanceBodyProps {
  /** Leaves for the Days tab, where income days are confirmed. */
  onOpenDays: () => void;
}

/** Whether what the bank holds matches the money Runway counts on hand. Nothing is saved or changed. */
export function CheckBalanceBody({ onOpenDays }: CheckBalanceBodyProps) {
  const balances = useAppSelector(selectBalances);
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const [amountText, setAmountText] = useState('');
  const { isHidden, toggle } = useValuesHidden();
  const [purchaseKey, setPurchaseKey] = useState<number | null>(null);

  const parsed = parseMoneyToCents(amountText);
  const typedCents =
    parsed !== null && parsed >= 0 && parsed <= MAX_BALANCE_CENTS
      ? parsed
      : null;
  const isOutOfRange = amountText.trim() !== '' && typedCents === null;
  const differenceCents =
    typedCents === null ? 0 : typedCents - balances.moneyOnHandCents;

  if (!isLedgerReady) {
    return (
      <p className='text-muted-foreground text-sm'>
        {BALANCE_CHECK_WORDS.loading}
      </p>
    );
  }

  if (!balances.hasMoney) {
    return (
      <div className='space-y-4'>
        <ActionTitle>{BALANCE_CHECK_WORDS.question}</ActionTitle>
        <p className='text-muted-foreground text-sm'>
          {BALANCE_CHECK_WORDS.notSet}
        </p>
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <ActionTitle>{BALANCE_CHECK_WORDS.question}</ActionTitle>
      <AmountHero
        label={BALANCE_CHECK_WORDS.amount}
        value={amountText}
        onChange={setAmountText}
        autoFocus
        hint={BALANCE_CHECK_WORDS.hint}
      />
      {isOutOfRange && (
        <p className='text-muted-foreground text-sm'>
          {BALANCE_CHECK_WORDS.tooLarge}
        </p>
      )}
      {typedCents !== null && (
        <div className='space-y-3' role='status'>
          <div className='border-border bg-accent space-y-1 rounded-2xl border p-4'>
            <p className='text-muted-foreground text-sm font-medium'>
              {BALANCE_CHECK_WORDS.counts}
            </p>
            <p className='text-4xl font-semibold tracking-tight tabular-nums'>
              <SensitiveValue>
                {formatCents(balances.moneyOnHandCents)}
              </SensitiveValue>
              <span className='text-muted-foreground ml-2 text-base font-normal'>
                {BALANCE_CHECK_WORDS.onHand}
              </span>
            </p>
            {!isHidden && balances.assignedToCardsCents > 0 && (
              <p className='text-muted-foreground text-sm'>
                <SensitiveValue>
                  {BALANCE_CHECK_WORDS.onCards(
                    formatCents(balances.assignedToCardsCents),
                  )}
                </SensitiveValue>
              </p>
            )}
          </div>
          {isHidden ? (
            <ActionGroup>
              <ActionRow
                isGrouped
                hasChevron
                icon={<Eye />}
                label={BALANCE_CHECK_WORDS.showToCompare}
                onClick={toggle}
              />
            </ActionGroup>
          ) : differenceCents === 0 ? (
            <InlineNotice tone='success'>
              {BALANCE_CHECK_WORDS.match}
            </InlineNotice>
          ) : (
            <>
              <InlineNotice tone={differenceCents < 0 ? 'warning' : 'info'}>
                {differenceCents < 0
                  ? BALANCE_CHECK_WORDS.less(formatCents(-differenceCents))
                  : BALANCE_CHECK_WORDS.more(formatCents(differenceCents))}
              </InlineNotice>
              <ActionSection caption={BALANCE_CHECK_WORDS.causesCaption}>
                <ul className='text-muted-foreground space-y-1 text-sm'>
                  {(differenceCents < 0
                    ? BALANCE_CHECK_WORDS.lessCauses
                    : BALANCE_CHECK_WORDS.moreCauses
                  ).map((cause) => (
                    <li key={cause}>{cause}</li>
                  ))}
                </ul>
              </ActionSection>
              <ActionGroup>
                {differenceCents < 0 ? (
                  <ActionRow
                    isGrouped
                    hasChevron
                    icon={<ReceiptText />}
                    label={BALANCE_CHECK_WORDS.addPurchase}
                    onClick={() =>
                      setPurchaseKey((current) => (current ?? 0) + 1)
                    }
                  />
                ) : (
                  <ActionRow
                    isGrouped
                    hasChevron
                    icon={<CalendarDays />}
                    label={BALANCE_CHECK_WORDS.openDays}
                    onClick={onOpenDays}
                  />
                )}
              </ActionGroup>
              <p className='text-muted-foreground text-sm'>
                {BALANCE_CHECK_WORDS.laterFix}
              </p>
            </>
          )}
        </div>
      )}
      {purchaseKey !== null && (
        <PurchaseForm
          key={purchaseKey}
          isOpen
          onClose={() => setPurchaseKey(null)}
        />
      )}
    </div>
  );
}
