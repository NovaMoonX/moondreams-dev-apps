import AccountSheet from '@apps/runway/components/AccountSheet';
import AccountForm from '@apps/runway/forms/AccountForm';
import type { OpenAccount } from '@apps/runway/types';

export type OpenedAccount = {
  accountId: string;
  view: 'menu' | 'change' | 'balance';
};

interface AccountSheetsProps {
  accounts: readonly OpenAccount[];
  open: OpenedAccount | null;
  onChange: (open: OpenedAccount | null) => void;
}

/** The sheet an account opens and the form it leads to (Change the account), swapped in place; Cancel returns to the sheet. */
function AccountSheets({ accounts, open, onChange }: AccountSheetsProps) {
  const opened = accounts.find((account) => account.id === open?.accountId);
  if (!opened || !open) return null;

  if (open.view === 'change') {
    return (
      <AccountForm
        isOpen
        editing={opened}
        onClose={() => onChange(null)}
        onCancel={() => onChange({ accountId: opened.id, view: 'menu' })}
      />
    );
  }
  return (
    <AccountSheet
      account={opened}
      startView={open.view === 'balance' ? 'balance' : 'menu'}
      onClose={() => onChange(null)}
      onChange={() => onChange({ accountId: opened.id, view: 'change' })}
    />
  );
}

export default AccountSheets;
