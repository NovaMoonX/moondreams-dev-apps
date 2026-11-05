import { useState } from 'react';
import { Wallet } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import SensitiveValue from '@/components/SensitiveValue';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { formatDateOrdinalUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import AccountSheets, {
  type OpenedAccount,
} from '@apps/runway/components/AccountSheets';
import ItemRow from '@apps/runway/components/ItemRow';
import { MaskedText } from '@apps/runway/components/MaskedText';
import { ACCOUNT_MOVE_WORDS } from '@apps/runway/constants';
import type { AccountMove } from '@apps/runway/engine/moves';
import type { OpenAccount } from '@apps/runway/types';
import { describeMoveBy, getMoveNames } from '@apps/runway/utils/moveText';

interface MoveRowProps {
  move: AccountMove;
  accounts: readonly OpenAccount[];
  isDone: boolean;
  onDone: (isDone: boolean) => void;
}

/** Money to move into a pull account: ticking it says it is done (Runway moves nothing), and its chevron lists what pulls from the account and opens the account's balance. */
function MoveRow({ move, accounts, isDone, onDone }: MoveRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [account, setAccount] = useState<OpenedAccount | null>(null);
  const { to, from } = getMoveNames(move, accounts);
  const title = ACCOUNT_MOVE_WORDS.sheetTitle(to);
  const amount = formatCents(move.moveCents);
  const by = describeMoveBy(move);
  const target = accounts.find((entry) => entry.id === move.accountId);
  const balanceDate = target?.balanceOn ?? null;

  return (
    <>
      <ItemRow
        name={to}
        detail={by}
        figure={amount}
        ariaLabel={`${title}, ${amount}. ${by}`}
        tick={{ checked: isDone, onChange: onDone }}
        onOpen={() => setIsOpen(true)}
      />
      <DetailSheet
        isOpen={isOpen && account === null}
        onClose={() => setIsOpen(false)}
        title={title}
        actions={<ValuesEyeButton />}
      >
        <div className='space-y-4'>
          <p className='text-sm'>
            <MaskedText>
              {ACCOUNT_MOVE_WORDS.lead(
                amount,
                from,
                formatDateOrdinalUTC(move.byOn),
              )}
            </MaskedText>
          </p>
          <div className='space-y-2'>
            <h3 className='text-muted-foreground text-sm font-medium'>
              {ACCOUNT_MOVE_WORDS.pullsHeading(to)}
            </h3>
            <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
              {move.items.map((item) => (
                <li
                  key={`${item.kind}:${item.id}:${item.dueOn}`}
                  className='flex items-start justify-between gap-3 p-3'
                >
                  <span className='min-w-0'>
                    <span className='block font-medium break-words'>
                      {item.name}
                    </span>
                    <span className='text-muted-foreground block text-sm'>
                      {formatDateOrdinalUTC(item.dueOn)}
                    </span>
                  </span>
                  <span className='shrink-0 font-semibold tabular-nums'>
                    <SensitiveValue>{formatCents(item.cents)}</SensitiveValue>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className='text-muted-foreground text-sm'>
            {move.balanceCents !== null && balanceDate !== null ? (
              <MaskedText>
                {ACCOUNT_MOVE_WORDS.freshBalance(
                  to,
                  formatCents(move.balanceCents),
                  formatDateOrdinalUTC(balanceDate),
                  amount,
                  formatCents(move.pullsCents),
                )}
              </MaskedText>
            ) : (target?.balanceCents ?? null) === null ||
              balanceDate === null ? (
              ACCOUNT_MOVE_WORDS.noBalance(to)
            ) : (
              ACCOUNT_MOVE_WORDS.staleBalance(
                to,
                formatDateOrdinalUTC(balanceDate),
              )
            )}
          </p>
          <ActionGroup>
            <ActionRow
              isGrouped
              hasChevron
              icon={<Wallet />}
              label={ACCOUNT_MOVE_WORDS.updateBalance(to)}
              subtitle={ACCOUNT_MOVE_WORDS.updateBalanceSub}
              onClick={() =>
                setAccount({ accountId: move.accountId, view: 'balance' })
              }
            />
          </ActionGroup>
        </div>
      </DetailSheet>
      <AccountSheets
        accounts={accounts}
        open={account}
        onChange={(next) => {
          setAccount(next);
          if (next === null) setIsOpen(false);
        }}
      />
    </>
  );
}

export default MoveRow;
