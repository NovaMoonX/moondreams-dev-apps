import { Check, CircleOff } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import BankBadge from '@apps/runway/components/BankBadge';
import type { OpenAccount } from '@apps/runway/types';
import { describeAccountLine } from '@apps/runway/utils/accountText';

interface AccountPickerProps {
  label: string;
  accounts: readonly OpenAccount[];
  /** The first row, choosing no account. */
  none: { value: string; label: string };
  value: string;
  onChange: (value: string) => void;
}

/** One row per account to choose from: its bank's logo, its name, and the bank with the last four digits under it. */
function AccountPicker({
  label,
  accounts,
  none,
  value,
  onChange,
}: AccountPickerProps) {
  const rows = [
    { id: none.value, name: none.label, line: null, account: null },
    ...accounts.map((account) => ({
      id: account.id,
      name: account.name,
      line: describeAccountLine(account),
      account,
    })),
  ];
  return (
    <div role='group' aria-label={label} className='space-y-2'>
      {rows.map((row) => {
        const isChosen = value === row.id;
        return (
          <Button
            key={row.id}
            type='button'
            variant='tertiary'
            aria-pressed={isChosen}
            className={join(
              'text-foreground! border-border h-auto min-h-14 w-full items-center justify-start gap-3 rounded-2xl border px-3! py-2! text-left font-normal whitespace-normal transition-none',
              isChosen &&
                'bg-accent! shadow-[inset_0_0_0_1.5px_var(--color-primary)]',
            )}
            onClick={() => onChange(row.id)}
          >
            {row.account === null ? (
              <span
                className='bg-muted text-muted-foreground grid size-10 shrink-0 place-items-center rounded-xl'
                aria-hidden='true'
              >
                <CircleOff className='size-4' />
              </span>
            ) : (
              <BankBadge
                name={row.account.institution}
                linkId={row.account.linkId}
              />
            )}
            <span className='min-w-0 flex-1'>
              <span className='block truncate text-[15px] leading-5 font-medium'>
                {row.name}
              </span>
              {row.line !== null && (
                <span className='text-muted-foreground block truncate text-[13px] leading-[1.125rem]'>
                  {row.line}
                </span>
              )}
            </span>
            <span
              aria-hidden='true'
              className={join(
                'grid size-5 shrink-0 place-items-center rounded-full border',
                isChosen
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border',
              )}
            >
              {isChosen && <Check className='size-3.5' />}
            </span>
          </Button>
        );
      })}
    </div>
  );
}

export default AccountPicker;
