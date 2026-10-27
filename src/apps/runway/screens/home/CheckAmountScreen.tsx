import { useState } from 'react';

import InlineNotice from '@/components/InlineNotice';
import AmountHero from '@/components/AmountHero';
import Subview from '@/components/Subview';
import { PillGroup } from '@/components/PillGroup';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import { formatCents, parseMoneyToCents } from '@/utils/moneyUtils';
import { ActionSection } from '@apps/runway/components/ActionSection';
import {
  CHECK_RESULT_WORDS,
  CHECK_WORDS,
  MAX_PURCHASE_CENTS,
} from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { checkAmount } from '@apps/runway/engine/checkAmount';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectEnvelopes,
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';

interface CheckAmountBodyProps {
  /** The envelope it opened from; it starts chosen. */
  presetEnvelopeId: string | null;
}

interface CheckAmountScreenProps extends CheckAmountBodyProps {
  onClose: () => void;
}

/** Whether an amount fits an envelope, worked out from the same balances as Home. Nothing is spent or moved. */
export function CheckAmountBody({ presetEnvelopeId }: CheckAmountBodyProps) {
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
  const check =
    envelopeId !== null && cents !== null
      ? checkAmount(
          envelopeId,
          cents,
          entries,
          balances.hasMoney ? balances.freeToSpendCents : 0,
        )
      : null;
  const heldCents = entries.find((entry) => entry.id === envelopeId)?.leftCents;
  const envelopeName = envelopeId === null ? '' : nameOf(envelopeId);
  const rows =
    check === null || cents === null || heldCents === undefined
      ? []
      : [
          [`${envelopeName} now`, formatCents(heldCents)],
          ['This amount', `−${formatCents(cents)}`],
        ];

  return !isLedgerReady ? (
    <p className='text-muted-foreground text-sm'>Getting your plan.</p>
  ) : entries.length === 0 ? (
    <p className='text-muted-foreground text-sm'>{CHECK_WORDS.noEnvelopes}</p>
  ) : (
    <div className='space-y-4'>
      <AmountHero
        label={CHECK_WORDS.amount}
        value={amountText}
        onChange={setAmountText}
        autoFocus
        hint={CHECK_WORDS.prompt}
      />
      <ActionSection caption={CHECK_WORDS.envelope}>
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
      </ActionSection>
      {check && (
        <div className='space-y-3' role='status'>
          <div className='border-border bg-accent space-y-2 rounded-2xl border p-4'>
            <p className='text-muted-foreground text-sm font-medium'>
              {check.kind === 'fits'
                ? CHECK_RESULT_WORDS.fits
                : CHECK_RESULT_WORDS.over(envelopeName)}
            </p>
            <p className='text-4xl font-semibold tracking-tight tabular-nums'>
              {formatCents(
                check.kind === 'fits' ? check.leftAfterCents : check.overCents,
              )}
              <span className='text-muted-foreground ml-2 text-base font-normal whitespace-nowrap'>
                {check.kind === 'fits'
                  ? CHECK_RESULT_WORDS.left
                  : CHECK_RESULT_WORDS.overBy}
              </span>
            </p>
            <dl className='divide-border border-border divide-y border-t text-sm'>
              {rows.map(([name, value]) => (
                <div
                  key={name}
                  className='flex items-baseline justify-between gap-3 py-1.5'
                >
                  <dt className='text-muted-foreground min-w-0 break-words'>
                    {name}
                  </dt>
                  <dd className='font-medium whitespace-nowrap tabular-nums'>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          {check.kind === 'over' && check.sources.length > 0 && (
            <ActionSection
              caption={
                check.sources[0].envelopeId === null
                  ? CHECK_RESULT_WORDS.fromFree
                  : CHECK_RESULT_WORDS.fromOthers
              }
            >
              <dl className='border-border bg-card divide-border divide-y rounded-2xl border text-sm'>
                {check.sources.map((source) => (
                  <div
                    key={source.envelopeId ?? 'free'}
                    className='flex items-baseline justify-between gap-3 p-3'
                  >
                    <dt className='min-w-0 break-words'>
                      {source.envelopeId === null
                        ? CHECK_RESULT_WORDS.free
                        : nameOf(source.envelopeId)}
                    </dt>
                    <dd className='font-medium whitespace-nowrap tabular-nums'>
                      {formatCents(source.takeCents)}
                      <span className='text-muted-foreground font-normal'>
                        {' '}
                        of{' '}
                        {formatCents(source.takeCents + source.leftAfterCents)}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            </ActionSection>
          )}
          {check.kind === 'over' && check.uncoveredCents > 0 && (
            <InlineNotice tone='warning'>
              {CHECK_RESULT_WORDS.uncovered(formatCents(check.uncoveredCents))}
            </InlineNotice>
          )}
        </div>
      )}
    </div>
  );
}

function CheckAmountScreen({
  presetEnvelopeId,
  onClose,
}: CheckAmountScreenProps) {
  return (
    <Subview title={CHECK_WORDS.title} onClose={onClose}>
      <CheckAmountBody presetEnvelopeId={presetEnvelopeId} />
    </Subview>
  );
}

export default CheckAmountScreen;
