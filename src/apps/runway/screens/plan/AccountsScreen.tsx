import { useState } from 'react';
import { Landmark } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import EmptyCard from '@/components/EmptyCard';
import SearchInput from '@/components/SearchInput';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAppSelector } from '@/store';
import AccountRow from '@apps/runway/components/AccountRow';
import AccountSheets, {
  type OpenedAccount,
} from '@apps/runway/components/AccountSheets';
import { ACCOUNT_WORDS, RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import AccountForm from '@apps/runway/forms/AccountForm';
import {
  selectAccounts,
  selectIsAccountsLoaded,
} from '@apps/runway/store/selectors/runwaySelectors';

interface AccountsScreenProps {
  onClose: () => void;
}

/** Every open account, what it holds and which goals and envelopes sit in it; opened from More at every level. */
function AccountsScreen({ onClose }: AccountsScreenProps) {
  const accounts = useAppSelector(selectAccounts);
  const isLoaded = useAppSelector(selectIsAccountsLoaded);
  const [query, setQuery] = useState('');
  const [formKey, setFormKey] = useState<number | null>(null);
  const [open, setOpen] = useState<OpenedAccount | null>(null);

  const needle = query.trim().toLowerCase();
  const visible =
    needle === ''
      ? accounts
      : accounts.filter((account) =>
          `${account.name} ${account.institution}`
            .toLowerCase()
            .includes(needle),
        );

  const getBody = () => {
    if (!isLoaded) {
      return (
        <p className='text-muted-foreground text-sm' role='status'>
          {ACCOUNT_WORDS.loading}
        </p>
      );
    }
    if (accounts.length === 0) {
      return (
        <EmptyCard icon={<Landmark className='h-5 w-5' />}>
          {ACCOUNT_WORDS.emptyTitle}
        </EmptyCard>
      );
    }
    return (
      <>
        {accounts.length >= RUNWAY_SEARCH_THRESHOLD && (
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={ACCOUNT_WORDS.searchPlaceholder}
          />
        )}
        {visible.length === 0 ? (
          <p className='text-muted-foreground text-sm'>
            {ACCOUNT_WORDS.searchEmpty}
          </p>
        ) : (
          <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
            {visible.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                onOpen={() => setOpen({ accountId: account.id, view: 'menu' })}
              />
            ))}
          </ul>
        )}
      </>
    );
  };

  return (
    <Subview
      title={ACCOUNT_WORDS.sectionTitle}
      onClose={onClose}
      headerAction={<ValuesEyeButton />}
    >
      <div className='space-y-4'>
        {getBody()}
        {isLoaded && (
          <Button
            type='button'
            variant='secondary'
            className='w-full'
            onClick={() => setFormKey((current) => (current ?? 0) + 1)}
          >
            {ACCOUNT_WORDS.add}
          </Button>
        )}
        {formKey !== null && (
          <AccountForm key={formKey} isOpen onClose={() => setFormKey(null)} />
        )}
        <AccountSheets accounts={accounts} open={open} onChange={setOpen} />
      </div>
    </Subview>
  );
}

export default AccountsScreen;
