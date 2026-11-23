import { useState } from 'react';

import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Trash2 } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import CopyTextButton from '@/components/CopyTextButton';
import ExternalLinkText from '@/components/ExternalLinkText';
import FormSheet from '@/components/FormSheet';
import { ActionSection } from '@apps/runway/components/ActionSection';
import {
  BankAddresses,
  BankMark,
  RuleAddresses,
  type SaveBanks,
} from '@apps/runway/components/EmailBanksEditor';
import { findBankLogo } from '@apps/runway/utils/emailBanks';
import {
  EMAIL_SETUP_WORDS,
  GMAIL_FILTERS_URL,
  ICLOUD_MAIL_URL,
  OUTLOOK_RULES_URL,
  PROTON_MAIL_URL,
  buildGmailFilterText,
} from '@apps/runway/components/emailWords';
import type { BankArrival } from '@apps/runway/hooks/useEmailPurchases';
import type { KnownBank } from '@apps/runway/store/selectors/emailSelectors';
import type { EmailBank, EmailProvider } from '@apps/runway/types';

const WORDS = EMAIL_SETUP_WORDS;

const RULE_LINKS: Partial<
  Record<EmailProvider, { href: string; label: string }>
> = {
  outlook: { href: OUTLOOK_RULES_URL, label: WORDS.outlookRuleLink },
  icloud: { href: ICLOUD_MAIL_URL, label: WORDS.icloudRuleLink },
  proton: { href: PROTON_MAIL_URL, label: WORDS.protonRuleLink },
};

interface EmailBankSheetProps {
  bank: EmailBank;
  banks: EmailBank[];
  provider: EmailProvider | null;
  knownBanks: KnownBank[];
  arrival: BankArrival;
  onSaveBanks: SaveBanks;
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
  onClose,
}: EmailBankSheetProps) {
  const { confirm } = useActionModal();
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const allAddresses = banks.flatMap((entry) => entry.addresses);
  const ruleLink = provider === null ? undefined : RULE_LINKS[provider];
  const filterText = buildGmailFilterText(allAddresses);

  const removeBank = async () => {
    const isConfirmed = await confirm({
      title: WORDS.removeBankTitle(bank.name),
      message: WORDS.removeBankMessage,
      confirmText: WORDS.removeBank,
      destructive: true,
    });
    if (!isConfirmed) return;
    setIsBusy(true);
    setError(null);
    try {
      await onSaveBanks((current) =>
        current.filter((entry) => entry.id !== bank.id),
      );
      onClose();
    } catch {
      setError(WORDS.banksSaveFailed);
    } finally {
      setIsBusy(false);
    }
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
            onSave={onSaveBanks}
          />
        </ActionSection>
        {provider !== null && provider !== 'yahoo' && (
          <ActionSection caption={WORDS.updateCaption}>
            {provider === 'gmail' ? (
              <div className='space-y-2'>
                <p className='text-sm'>{WORDS.updateGmailCopy}</p>
                <code className='bg-muted block rounded-lg px-2 py-1.5 font-mono text-xs break-words whitespace-pre-wrap'>
                  {filterText}
                </code>
                <CopyTextButton
                  text={filterText}
                  label={WORDS.filterLabel}
                  variant='secondary'
                  isCompact
                />
                <p className='text-sm'>{WORDS.updateGmailPaste}</p>
                <ExternalLinkText
                  href={GMAIL_FILTERS_URL}
                  label={WORDS.filterLink}
                />
              </div>
            ) : (
              <div className='space-y-2'>
                <p className='text-sm break-words'>
                  {provider === 'proton'
                    ? WORDS.protonRuleCondition(allAddresses)
                    : WORDS.updateRule(allAddresses)}
                </p>
                <RuleAddresses addresses={allAddresses} />
                {ruleLink && (
                  <ExternalLinkText
                    href={ruleLink.href}
                    label={ruleLink.label}
                  />
                )}
              </div>
            )}
          </ActionSection>
        )}
        {error && (
          <p className='text-destructive text-sm' role='alert'>
            {error}
          </p>
        )}
        <ActionRow
          isDestructive
          icon={<Trash2 />}
          label={WORDS.removeBank}
          subtitle={WORDS.removeBankSub}
          isDisabled={isBusy}
          onClick={() => void removeBank()}
        />
      </div>
    </FormSheet>
  );
}

export default EmailBankSheet;
