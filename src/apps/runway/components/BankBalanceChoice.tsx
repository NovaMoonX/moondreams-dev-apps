import { Button } from '@moondreamsdev/dreamer-ui/components';

import SensitiveValue from '@/components/SensitiveValue';
import { formatCents } from '@/utils/moneyUtils';
import { LINK_WORDS } from '@apps/runway/constants';

interface BankBalanceChoiceProps {
  /** Shown above the figures when the choice is one of several. */
  name?: string;
  yoursCents: number | null;
  bankCents: number;
  isBusy?: boolean;
  onUseBanks: () => void;
  onKeepMine: () => void;
}

/** The bank's figure against the plan's, with two equal choices and neither preselected. */
function BankBalanceChoice({
  name,
  yoursCents,
  bankCents,
  isBusy = false,
  onUseBanks,
  onKeepMine,
}: BankBalanceChoiceProps) {
  return (
    <div className='space-y-2'>
      {name && <p className='font-medium break-words'>{name}</p>}
      <p className='text-muted-foreground text-sm'>
        {LINK_WORDS.yours}:{' '}
        {yoursCents === null ? (
          LINK_WORDS.noneTyped
        ) : (
          <SensitiveValue>{formatCents(yoursCents)}</SensitiveValue>
        )}
        {' · '}
        {LINK_WORDS.bank}:{' '}
        <SensitiveValue>{formatCents(bankCents)}</SensitiveValue>
      </p>
      <div className='grid grid-cols-2 gap-2'>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          className="relative before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
          disabled={isBusy}
          onClick={onUseBanks}
        >
          {LINK_WORDS.useBanks}
        </Button>
        <Button
          type='button'
          size='sm'
          variant='secondary'
          className="relative before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
          disabled={isBusy}
          onClick={onKeepMine}
        >
          {LINK_WORDS.keepMine}
        </Button>
      </div>
    </div>
  );
}

export default BankBalanceChoice;
