import { useState } from 'react';
import { Landmark, Plus } from 'lucide-react';

import EmptyCard from '@/components/EmptyCard';
import FloatingAction from '@/components/FloatingAction';
import SearchInput from '@/components/SearchInput';
import Subview from '@/components/Subview';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useNow } from '@/hooks/useNow';
import { useAppSelector } from '@/store';
import AccountRow from '@apps/runway/components/AccountRow';
import AccountSheets, {
  type OpenedAccount,
} from '@apps/runway/components/AccountSheets';
import { ACCOUNT_WORDS, RUNWAY_SEARCH_THRESHOLD } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import AddMethodSheet from '@apps/runway/components/AddMethodSheet';
import { useCanLinkBank } from '@apps/runway/hooks/useCanLinkBank';
import LinkBankScreen from '@apps/runway/screens/link/LinkBankScreen';
import AccountForm from '@apps/runway/forms/AccountForm';
import {
  selectAccountHoldings,
  selectAccounts,
  selectIsAccountsLoaded,
} from '@apps/runway/store/selectors/runwaySelectors';

interface AccountsScreenProps {
  onClose: () => void;
}

/** Every open account, what it holds and which goals and envelopes sit in it; opened from More at every level. */
function AccountsScreen({ onClose }: AccountsScreenProps) {
  const accounts = useAppSelector(selectAccounts);
  const today = todayAsUtcDate(useNow(60_000));
  const holdings = useAppSelector((state) =>
    selectAccountHoldings(state, today),
  );
  const isLoaded = useAppSelector(selectIsAccountsLoaded);
  const [query, setQuery] = useState('');
  const [formKey, setFormKey] = useState<number | null>(null);
  const [open, setOpen] = useState<OpenedAccount | null>(null);
  const canLink = useCanLinkBank();
  const [addStep, setAddStep] = useState<'pick' | 'link' | null>(null);

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
                unassignedCents={holdings[account.id]?.unassignedCents ?? null}
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
          <FloatingAction
            isInSubview
            label={ACCOUNT_WORDS.add}
            icon={<Plus className='h-5 w-5' aria-hidden='true' />}
            onClick={() =>
              canLink
                ? setAddStep('pick')
                : setFormKey((current) => (current ?? 0) + 1)
            }
          />
        )}
        {addStep === 'pick' && (
          <AddMethodSheet
            onClose={() => setAddStep(null)}
            onLink={() => setAddStep('link')}
            onManual={() => {
              setAddStep(null);
              setFormKey((current) => (current ?? 0) + 1);
            }}
          />
        )}
        {addStep === 'link' && (
          <LinkBankScreen onClose={() => setAddStep(null)} />
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
