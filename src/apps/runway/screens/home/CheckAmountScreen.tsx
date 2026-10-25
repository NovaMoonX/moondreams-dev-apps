import { useState } from 'react';

import Subview from '@/components/Subview';
import MoneyInput from '@/components/MoneyInput';
import { PillGroup } from '@/components/PillGroup';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { parseMoneyToCents } from '@/utils/moneyUtils';
import { CHECK_WORDS, MAX_PURCHASE_CENTS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { checkAmount } from '@apps/runway/engine/checkAmount';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectEnvelopes,
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';
import { describeAmountCheck } from '@apps/runway/utils/checkText';

interface CheckAmountScreenProps {
  /** The envelope it opened from; it starts chosen. */
  presetEnvelopeId: string | null;
  onClose: () => void;
}

/** Whether an amount fits an envelope, worked out from the same balances as Home. Nothing is spent or moved. */
function CheckAmountScreen({
  presetEnvelopeId,
  onClose,
}: CheckAmountScreenProps) {
  const today = todayAsUtcDate(useNow(60_000));
  const envelopes = useAppSelector((state) => selectEnvelopes(state, today));
  const balances = useAppSelector(selectBalances);
  const isLedgerReady = useAppSelector(
    (state) => selectIsMovesLoaded(state) && selectIsRecordsReady(state),
  );
  const [amountText, setAmountText] = useState('');
  const [picked, setPicked] = useState<string | null>(presetEnvelopeId);

  const entries = envelopes.map(({ item, version }) => ({
    id: item.id,
    name: version.payload.name,
    emoji: version.payload.emoji,
    priority: version.payload.priority,
    leftCents: balances.assignedByItem[item.id] ?? 0,
  }));
  const envelopeId =
    picked !== null && entries.some((entry) => entry.id === picked)
      ? picked
      : null;
  const parsed = parseMoneyToCents(amountText);
  const cents =
    parsed !== null && parsed > 0 && parsed <= MAX_PURCHASE_CENTS
      ? parsed
      : null;
  const nameOf = (id: string) =>
    entries.find((entry) => entry.id === id)?.name ?? 'An envelope';
  const answer =
    envelopeId !== null && cents !== null
      ? describeAmountCheck(
          checkAmount(envelopeId, cents, entries),
          nameOf(envelopeId),
          nameOf,
        )
      : null;

  return (
    <Subview title={CHECK_WORDS.title} onClose={onClose}>
      {!isLedgerReady ? (
        <p className='text-muted-foreground text-sm'>Getting your plan.</p>
      ) : entries.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {CHECK_WORDS.noEnvelopes}
        </p>
      ) : (
        <div className='space-y-4'>
          <p className='text-muted-foreground text-sm'>{CHECK_WORDS.prompt}</p>
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs'>
              {CHECK_WORDS.amount}
            </p>
            <MoneyInput
              variant='outline'
              ariaLabel={CHECK_WORDS.amount}
              value={amountText}
              onChange={setAmountText}
            />
          </div>
          <div className='space-y-2'>
            <p className='text-muted-foreground text-xs'>
              {CHECK_WORDS.envelope}
            </p>
            <PillGroup
              label={CHECK_WORDS.envelope}
              options={entries.map((entry) => ({
                value: entry.id,
                label: entry.name,
                emoji: entry.emoji ?? undefined,
              }))}
              value={envelopeId}
              onChange={setPicked}
            />
          </div>
          {answer && (
            <div
              className='border-border bg-accent space-y-2 rounded-2xl border p-4'
              role='status'
            >
              <p className='font-medium break-words'>{answer.headline}</p>
              {answer.lead && (
                <p className='text-muted-foreground text-sm'>{answer.lead}</p>
              )}
              {answer.sources.length > 0 && (
                <ul className='text-muted-foreground space-y-1 text-sm'>
                  {answer.sources.map((line) => (
                    <li key={line} className='break-words'>
                      {line}
                    </li>
                  ))}
                </ul>
              )}
              {answer.rest && (
                <p className='text-muted-foreground text-sm'>{answer.rest}</p>
              )}
            </div>
          )}
        </div>
      )}
    </Subview>
  );
}

export default CheckAmountScreen;
