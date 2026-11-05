import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import HelpTip from '@/components/HelpTip';
import InlineNotice from '@/components/InlineNotice';
import SensitiveValue from '@/components/SensitiveValue';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { CASH_POSITION_WORDS, NEEDS_LOOK_WORDS } from '@apps/runway/constants';
import { selectCashPosition } from '@apps/runway/store/selectors/balanceSelectors';
import {
  selectIsAccountsLoaded,
  selectIsMovesLoaded,
  selectIsRecordsReady,
} from '@apps/runway/store/selectors/runwaySelectors';

interface CashRow {
  key: string;
  sign: string;
  name: string;
  subtext?: string;
  help?: string;
  /** Null for an account with no balance: it has no figure to show. */
  value: string | null;
  isEmphasised?: boolean;
}

/** Where the cash in the accounts that count goes: what each holds, what is already spoken for, what sits in envelopes and what is free. Nothing is changed here. */
export function WhereYourCashIsBody() {
  const position = useAppSelector(selectCashPosition);
  const isReady = useAppSelector(
    (state) =>
      selectIsMovesLoaded(state) &&
      selectIsRecordsReady(state) &&
      selectIsAccountsLoaded(state),
  );
  const { isHidden, toggle } = useValuesHidden();

  if (!isReady) {
    return <p className='text-muted-foreground text-sm'>Getting your plan.</p>;
  }

  const getAccountSubtext = (account: (typeof position.accounts)[number]) => {
    if (account.cents === null) return CASH_POSITION_WORDS.noBalance;
    if (account.isBank) return CASH_POSITION_WORDS.fromBank;
    return account.balanceOn === null
      ? CASH_POSITION_WORDS.typed
      : CASH_POSITION_WORDS.typedOn(formatDateOrdinalUTC(account.balanceOn));
  };
  const take = (
    key: string,
    name: string,
    cents: number,
    help?: string,
  ): CashRow => ({
    key,
    sign: '−',
    name,
    value: formatCents(cents),
    help,
  });
  const rows: CashRow[] = [
    ...position.accounts.map((account): CashRow => ({
      key: account.id,
      sign: '+',
      name: account.name,
      subtext: getAccountSubtext(account),
      value: account.cents === null ? null : formatCents(account.cents),
    })),
    take('bills', CASH_POSITION_WORDS.bills, position.billsCents),
    take('goals', CASH_POSITION_WORDS.goals, position.goalsCents),
    ...(position.horizonCents !== 0
      ? [take('horizon', CASH_POSITION_WORDS.horizon, position.horizonCents)]
      : []),
    take('cards', CASH_POSITION_WORDS.cards, position.cardsCents),
    ...(position.pendingCents !== 0
      ? [
          take(
            'pending',
            CASH_POSITION_WORDS.pending,
            position.pendingCents,
            CASH_POSITION_WORDS.pendingHelp,
          ),
        ]
      : []),
    take('envelopes', CASH_POSITION_WORDS.envelopes, position.envelopesCents),
    {
      key: 'free',
      sign: '=',
      name: CASH_POSITION_WORDS.free,
      value: formatCents(position.freeCents),
      isEmphasised: true,
    },
  ];
  const names = position.accounts.map((account) => account.name).join(', ');
  const getWarning = (): ReactNode => {
    if (position.overAssignedCents <= 0) return null;
    if (isHidden) {
      return (
        <InlineNotice tone='warning' title={NEEDS_LOOK_WORDS.title}>
          <button
            type='button'
            className='text-left underline'
            onClick={toggle}
          >
            {NEEDS_LOOK_WORDS.door}
          </button>
        </InlineNotice>
      );
    }
    return (
      <InlineNotice tone='warning'>
        {CASH_POSITION_WORDS.over(formatCents(position.overAssignedCents))}
        <span className='relative z-10 ml-1 inline-block align-middle'>
          <HelpTip title={CASH_POSITION_WORDS.over('')}>
            {CASH_POSITION_WORDS.overHelp}
          </HelpTip>
        </span>
      </InlineNotice>
    );
  };

  return (
    <div className='space-y-4'>
      <div className='border-border bg-accent rounded-2xl border p-4'>
        <p className='text-muted-foreground text-sm font-medium'>
          {CASH_POSITION_WORDS.cash}
          <span className='relative z-10 ml-1 inline-block align-middle'>
            <HelpTip title={CASH_POSITION_WORDS.cash}>
              {CASH_POSITION_WORDS.cashHelp(names)}
            </HelpTip>
          </span>
        </p>
        <p className='text-4xl font-semibold tracking-tight tabular-nums'>
          <SensitiveValue>{formatCents(position.cashCents)}</SensitiveValue>
        </p>
      </div>
      {position.accounts.length === 0 ? (
        <p className='text-muted-foreground text-sm'>
          {CASH_POSITION_WORDS.noAccounts}
        </p>
      ) : (
        <div className='border-border bg-card divide-border divide-y rounded-2xl border text-sm'>
          {rows.map((row) => (
            <div
              key={row.key}
              className='grid min-h-12 grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-x-2 px-3 py-2'
            >
              <span
                className='text-muted-foreground text-center'
                aria-hidden='true'
              >
                {row.sign}
              </span>
              <span
                className={join(
                  'min-w-0 text-left',
                  row.isEmphasised && 'font-medium',
                )}
              >
                {row.name}
                {row.help && (
                  <span className='relative z-10 ml-1 inline-block align-middle'>
                    <HelpTip title={row.name}>{row.help}</HelpTip>
                  </span>
                )}
                {row.subtext && (
                  <span className='text-muted-foreground block text-xs'>
                    {row.subtext}
                  </span>
                )}
              </span>
              <span
                className={join(
                  'text-right whitespace-nowrap tabular-nums',
                  row.isEmphasised ? 'text-base font-semibold' : 'font-medium',
                )}
              >
                {row.value !== null && (
                  <SensitiveValue>{row.value}</SensitiveValue>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {getWarning()}
    </div>
  );
}
