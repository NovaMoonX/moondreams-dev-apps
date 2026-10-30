import { useState } from 'react';

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
import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
import {
  BALANCE_CHECK_WORDS,
  MAX_PURCHASE_CENTS,
} from '@apps/runway/constants';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';

/** Whether what the bank holds matches the money Runway counts on hand. Nothing is saved or changed. */
export function CheckBalanceBody() {
  const balances = useAppSelector(selectBalances);
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const [amountText, setAmountText] = useState('');
  const { isHidden } = useValuesHidden();

  const parsed = parseMoneyToCents(amountText);
  const typedCents =
    parsed !== null && parsed >= 0 && parsed <= MAX_PURCHASE_CENTS
      ? parsed
      : null;
  const differenceCents =
    typedCents === null ? 0 : typedCents - balances.moneyOnHandCents;

  if (!isLedgerReady) {
    return (
      <p className='text-muted-foreground text-sm'>
        {BALANCE_CHECK_WORDS.loading}
      </p>
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
            {balances.assignedToCardsCents > 0 && (
              <p className='text-muted-foreground text-sm'>
                <SensitiveValue>
                  {BALANCE_CHECK_WORDS.onCards(
                    formatCents(balances.assignedToCardsCents),
                  )}
                </SensitiveValue>
              </p>
            )}
          </div>
          {differenceCents === 0 ? (
            <InlineNotice tone='success'>
              {BALANCE_CHECK_WORDS.match}
            </InlineNotice>
          ) : isHidden ? (
            <NeedsALookRow />
          ) : (
            <>
              <InlineNotice tone='warning'>
                {differenceCents < 0
                  ? BALANCE_CHECK_WORDS.less(formatCents(-differenceCents))
                  : BALANCE_CHECK_WORDS.more(formatCents(differenceCents))}
              </InlineNotice>
              <ActionSection caption={BALANCE_CHECK_WORDS.causesCaption}>
                <ul className='text-muted-foreground space-y-1 text-sm'>
                  {BALANCE_CHECK_WORDS.causes.map((cause) => (
                    <li key={cause}>{cause}</li>
                  ))}
                </ul>
              </ActionSection>
            </>
          )}
        </div>
      )}
    </div>
  );
}
