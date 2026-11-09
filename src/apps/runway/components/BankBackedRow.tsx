import { useState } from 'react';
import { ChevronRight, Landmark } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import DetailSheet from '@/components/DetailSheet';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import SensitiveValue from '@/components/SensitiveValue';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatCents } from '@/utils/moneyUtils';
import { BANK_BACKED_WORDS } from '@apps/runway/constants';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import { setBankBackedSeen } from '@apps/runway/store/actions/planActions';
import {
  selectBalances,
  selectBankBacking,
} from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectIsAccountsLoaded,
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';

/** Home's one-time note once Free to Spend comes from the account balances: what it was, what it is, and why they differ. Gone for good after Got it. */
function BankBackedRow() {
  const { user } = useAuth();
  const { isHidden } = useValuesHidden();
  const backing = useAppSelector(selectBankBacking);
  const balances = useAppSelector(selectBalances);
  const isReady = useAppSelector(
    (state) =>
      selectIsAccountsLoaded(state) &&
      selectIsMovesLoaded(state) &&
      selectIsRecordsReady(state),
  );
  const isUnseen = useAppSelector(
    (state) =>
      state.runway.plan !== null && state.runway.plan.bankBackedSeenAt === null,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOnHome = isReady && isUnseen && backing.isBacked;
  if (!isOnHome && !(isOpen && backing.isBacked)) return null;

  const afterCents = balances.freeToSpendCents;
  const beforeCents = afterCents - backing.cents;
  const gap = formatCents(Math.abs(backing.cents));
  const getGapLine = () => {
    if (isHidden) return BANK_BACKED_WORDS.hidden;
    if (backing.cents > 0) return BANK_BACKED_WORDS.more(gap);
    if (backing.cents < 0) return BANK_BACKED_WORDS.less(gap);
    return BANK_BACKED_WORDS.same;
  };

  const confirm = async () => {
    if (!user || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await setBankBackedSeen(user.uid, await getRunwayEncryption(user.uid));
      setIsOpen(false);
    } catch (saveError) {
      setError(getErrorMessage(saveError, BANK_BACKED_WORDS.failed));
    } finally {
      setIsSaving(false);
    }
  };

  const figure = (label: string, cents: number) => (
    <div className='flex items-baseline justify-between gap-3 px-4 py-3'>
      <span className='text-muted-foreground'>{label}</span>
      <span className='font-medium tabular-nums'>
        <SensitiveValue>{formatCents(cents)}</SensitiveValue>
      </span>
    </div>
  );

  return (
    <>
      {isOnHome && (
        <Button
          type='button'
          variant='tertiary'
          className='bg-card border-border hover:bg-muted/60 h-auto min-h-11 w-full items-center justify-start gap-3 rounded-2xl border px-3! py-1.5 text-left font-normal whitespace-normal'
          onClick={() => setIsOpen(true)}
        >
          <Landmark
            className='text-muted-foreground h-5 w-5 shrink-0'
            aria-hidden='true'
          />
          <span className='min-w-0 flex-1'>
            <span className='text-foreground block text-sm font-medium'>
              {BANK_BACKED_WORDS.title}
            </span>
            <span className='text-muted-foreground block text-[13px]'>
              {BANK_BACKED_WORDS.subtitle}
            </span>
          </span>
          <ChevronRight
            className='text-muted-foreground h-4 w-4 shrink-0'
            aria-hidden='true'
          />
        </Button>
      )}
      <DetailSheet
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={BANK_BACKED_WORDS.title}
        actions={<ValuesEyeButton />}
        footer={
          <div className='p-4'>
            <Button
              type='button'
              className='w-full'
              disabled={isSaving}
              onClick={() => void confirm()}
            >
              {BANK_BACKED_WORDS.gotIt}
            </Button>
          </div>
        }
      >
        <div className='space-y-4 text-sm'>
          <p>{BANK_BACKED_WORDS.intro}</p>
          <div className='border-border bg-card divide-border divide-y rounded-2xl border'>
            {figure(BANK_BACKED_WORDS.before, beforeCents)}
            {figure(BANK_BACKED_WORDS.after, afterCents)}
          </div>
          <p>{getGapLine()}</p>
          {backing.hasTyped && (
            <p className='text-muted-foreground'>
              {BANK_BACKED_WORDS.typedNote}
            </p>
          )}
          {error !== null && (
            <p className='text-destructive' role='alert'>
              {error}
            </p>
          )}
        </div>
      </DetailSheet>
    </>
  );
}

export default BankBackedRow;
