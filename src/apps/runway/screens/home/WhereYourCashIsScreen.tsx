import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import HelpTip from '@/components/HelpTip';
import InlineNotice from '@/components/InlineNotice';
import SensitiveValue from '@/components/SensitiveValue';
import NeedsALookRow from '@apps/runway/components/NeedsALookRow';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import { CASH_POSITION_WORDS } from '@apps/runway/constants';
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
      selectIsAccountsLoaded(state) &&
      state.runway.isAccountBalancesLoaded,
  );
  const { isHidden } = useValuesHidden();

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
  // While amounts are hidden every row is drawn, so a row's presence never says its figure is not zero.
  const take = (
    key: string,
    name: string,
    cents: number,
    help?: string,
  ): CashRow[] =>
    !isHidden && cents === 0
      ? []
      : [{ key, sign: '−', name, value: formatCents(cents), help }];
  const rows: CashRow[] = [
    ...position.accounts.map((account): CashRow => ({
      key: account.id,
      sign: '+',
      name: account.name,
      subtext: getAccountSubtext(account),
      value: account.cents === null ? null : formatCents(account.cents),
    })),
    ...take('bills', CASH_POSITION_WORDS.bills, position.billsCents),
    ...take('goals', CASH_POSITION_WORDS.goals, position.goalsCents),
    ...take('horizon', CASH_POSITION_WORDS.horizon, position.horizonCents),
    ...take('cards', CASH_POSITION_WORDS.cards, position.cardsCents),
    ...take(
      'pending',
      CASH_POSITION_WORDS.pending,
      position.pendingCents,
      CASH_POSITION_WORDS.pendingHelp,
    ),
    ...take(
      'envelopes',
      CASH_POSITION_WORDS.envelopes,
      position.envelopesCents,
    ),
    {
      key: 'free',
      sign: '=',
      name: CASH_POSITION_WORDS.free,
      subtext:
        position.freeCents === null
          ? CASH_POSITION_WORDS.unknownSub
          : undefined,
      help: CASH_POSITION_WORDS.freeHelp,
      value:
        position.freeCents === null
          ? CASH_POSITION_WORDS.unknown
          : formatCents(position.freeCents),
      isEmphasised: true,
    },
  ];
  const names = position.accounts.map((account) => account.name).join(', ');
  const getWarning = (): ReactNode => {
    if (position.overAssignedCents <= 0) return null;
    if (isHidden) return <NeedsALookRow />;
    return (
      <InlineNotice tone='warning' title={CASH_POSITION_WORDS.overTitle}>
        {CASH_POSITION_WORDS.over(formatCents(position.overAssignedCents))}
        <span className='relative z-10 ml-1 inline-block align-middle'>
          <HelpTip title={CASH_POSITION_WORDS.overTitle}>
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
          {position.cashCents === null ? (
            <span className='text-muted-foreground text-2xl'>
              {CASH_POSITION_WORDS.unknown}
            </span>
          ) : (
            <SensitiveValue>{formatCents(position.cashCents)}</SensitiveValue>
          )}
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
                  'min-w-0 text-left break-words',
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
                {row.value === CASH_POSITION_WORDS.unknown ? (
                  <span className='text-muted-foreground font-normal'>
                    {row.value}
                  </span>
                ) : (
                  row.value !== null && (
                    <SensitiveValue>{row.value}</SensitiveValue>
                  )
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {position.leftOut.length > 0 && (
        <p className='text-muted-foreground text-xs'>
          {CASH_POSITION_WORDS.leftOut(position.leftOut.join(', '))}
        </p>
      )}
      {getWarning()}
    </div>
  );
}
