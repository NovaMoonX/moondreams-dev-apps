import { useState } from 'react';

import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Trash2 } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';
import { ActionSection } from '@apps/runway/components/ActionSection';
import {
  BankAddresses,
  BankMark,
  ForwardingUpdate,
  type SaveBanks,
} from '@apps/runway/components/EmailBanksEditor';
import { findBankLogo, listBankAddresses } from '@apps/runway/utils/emailBanks';
import { EMAIL_SETUP_WORDS } from '@apps/runway/components/emailWords';
import type { BankArrival } from '@apps/runway/hooks/useEmailPurchases';
import type { KnownBank } from '@apps/runway/store/selectors/emailSelectors';
import type { EmailBank, EmailProvider } from '@apps/runway/types';

const WORDS = EMAIL_SETUP_WORDS;

interface EmailBankSheetProps {
  bank: EmailBank;
  banks: EmailBank[];
  provider: EmailProvider | null;
  knownBanks: KnownBank[];
  arrival: BankArrival;
  onSaveBanks: SaveBanks;
  /** Shows a failure after the sheet has closed on its own. */
  onFailed: (message: string) => void;
  onClose: () => void;
}

/** One bank whose alerts are forwarded: its addresses to add to or trim, what to paste into the filter or rule after a change, and a way to stop. */
function EmailBankSheet({
  bank,
  banks,
  provider,
  knownBanks,
  arrival,
  onSaveBanks,
  onFailed,
  onClose,
}: EmailBankSheetProps) {
  const { confirm } = useActionModal();
  const allAddresses = listBankAddresses(banks);
  const [addressesAtOpen] = useState(allAddresses);
  const [touched, setTouched] = useState<string[]>([]);
  const added = allAddresses.filter(
    (address) =>
      !addressesAtOpen.includes(address) || touched.includes(address),
  );
  const removed = [...new Set([...addressesAtOpen, ...touched])].filter(
    (address) => !allAddresses.includes(address),
  );
  const hasChanged = touched.length > 0;

  const saveAndNote: SaveBanks = async (change) => {
    const before = listBankAddresses(banks);
    const after = listBankAddresses(change(banks));
    const moved = [
      ...after.filter((address) => !before.includes(address)),
      ...before.filter((address) => !after.includes(address)),
    ];
    setTouched((current) => [...new Set([...current, ...moved])]);
    const takeBack = () =>
      setTouched((current) =>
        current.filter((address) => !moved.includes(address)),
      );
    try {
      const isSaved = await onSaveBanks(change);
      if (!isSaved) takeBack();
      return isSaved;
    } catch (error) {
      takeBack();
      throw error;
    }
  };

  const removeBank = async () => {
    const isConfirmed = await confirm({
      title: WORDS.removeBankTitle(bank.name),
      message: WORDS.removeBankMessage,
      confirmText: WORDS.removeBank,
      destructive: true,
    });
    if (!isConfirmed) return;
    onSaveBanks((current) =>
      current.filter((entry) => entry.id !== bank.id),
    ).catch(() => onFailed(WORDS.banksSaveFailed));
    onClose();
  };

  return (
    <FormSheet isOpen isDrawerWhenShort onClose={onClose} title={bank.name}>
      <div className='space-y-5 pb-4'>
        <div className='flex items-center gap-3'>
          <BankMark
            name={bank.name}
            logo={findBankLogo(knownBanks, bank.name)}
          />
          <p className='text-muted-foreground min-w-0 flex-1 text-sm'>
            {WORDS.arrival[arrival]}
          </p>
        </div>
        <ActionSection caption={WORDS.bankSheetAddresses}>
          <BankAddresses
            bank={bank}
            allAddresses={allAddresses}
            onSave={saveAndNote}
          />
        </ActionSection>
        {hasChanged && provider !== null && provider !== 'yahoo' && (
          <ActionSection caption={WORDS.updateCaption}>
            <ForwardingUpdate
              provider={provider}
              addresses={allAddresses}
              added={added}
              removed={removed}
            />
          </ActionSection>
        )}
        <ActionRow
          isDestructive
          icon={<Trash2 />}
          label={WORDS.removeBank}
          subtitle={WORDS.removeBankSub}
          onClick={() => void removeBank()}
        />
      </div>
    </FormSheet>
  );
}

export default EmailBankSheet;
