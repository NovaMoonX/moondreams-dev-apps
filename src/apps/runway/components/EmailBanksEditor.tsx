import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { ArrowLeftRight, Plus, X } from 'lucide-react';

import ClearOfFooter from '@/components/ClearOfFooter';
import ExternalLinkText from '@/components/ExternalLinkText';
import CopyTextButton from '@/components/CopyTextButton';
import MethodPicker from '@/components/MethodPicker';
import {
  EMAIL_SETUP_WORDS,
  GMAIL_FILTERS_URL,
  ICLOUD_MAIL_URL,
  OUTLOOK_RULES_URL,
  PROTON_MAIL_URL,
  buildGmailFilterText,
} from '@apps/runway/components/emailWords';
import ItemBadge from '@apps/runway/components/ItemBadge';
import type { KnownBank } from '@apps/runway/store/selectors/emailSelectors';
import type { EmailBank, EmailProvider } from '@apps/runway/types';
import {
  checkAddress,
  findBankLogo,
  splitAddress,
  type BankDraft,
} from '@apps/runway/utils/emailBanks';

const WORDS = EMAIL_SETUP_WORDS;

export function BankMark({
  name,
  logo,
}: {
  name: string;
  logo: string | null;
}) {
  if (logo === null) return <ItemBadge name={name} emoji={null} />;
  return (
    // Bank logos are drawn for a white ground, so the tile stays white in dark mode as a bank app's would.
    <img
      src={logo}
      alt=''
      aria-hidden='true'
      className='border-border size-10 shrink-0 rounded-xl border bg-white object-contain p-1'
    />
  );
}

/** Several alert addresses to type into a rule, one per line with its own copy; one address stays in the sentence. */
function AddressText({ address }: { address: string }) {
  return splitAddress(address).map((part, index) => (
    <span key={index}>
      {part}
      <wbr />
    </span>
  ));
}

export function RuleAddresses({
  addresses,
  isShownForOne = false,
}: {
  addresses: string[];
  /** One address usually sits in the sentence; an update names it on its own line to copy. */
  isShownForOne?: boolean;
}) {
  if (addresses.length < (isShownForOne ? 1 : 2)) return null;
  return (
    <ul className='border-border divide-border divide-y rounded-xl border'>
      {addresses.map((address) => (
        <li
          key={address}
          className='flex min-h-11 items-center gap-2 py-1 pr-2 pl-3'
        >
          <span className='min-w-0 flex-1 font-mono text-xs [overflow-wrap:anywhere]'>
            <AddressText address={address} />
          </span>
          <CopyTextButton
            text={address}
            label={WORDS.copyAddress(address)}
            variant='tertiary'
            isIconOnly
            isCompact
            className='shrink-0'
          />
        </li>
      ))}
    </ul>
  );
}

const RULE_LINKS: Partial<
  Record<EmailProvider, { href: string; label: string }>
> = {
  outlook: { href: OUTLOOK_RULES_URL, label: WORDS.outlookRuleLink },
  icloud: { href: ICLOUD_MAIL_URL, label: WORDS.icloudRuleLink },
  proton: { href: PROTON_MAIL_URL, label: WORDS.protonRuleLink },
};

/** What to change in a filter or rule the person already made, so it covers every bank's addresses; never a second one. A rule editor takes senders one by one, so it is shown only what was added or removed. */
export function ForwardingUpdate({
  provider,
  addresses,
  added,
  removed,
}: {
  provider: EmailProvider;
  addresses: string[];
  added: string[];
  removed: string[];
}) {
  if (provider === 'gmail') {
    const filterText = buildGmailFilterText(addresses);
    return (
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
        <ExternalLinkText href={GMAIL_FILTERS_URL} label={WORDS.filterLink} />
      </div>
    );
  }
  const ruleLink = RULE_LINKS[provider];
  const link = ruleLink && (
    <ExternalLinkText href={ruleLink.href} label={ruleLink.label} />
  );
  if (added.length > 0 || removed.length > 0) {
    return (
      <div className='space-y-4'>
        {added.length > 0 && (
          <div className='space-y-2'>
            <p className='text-sm break-words'>
              {WORDS.updateRuleAdd(provider, added)}
            </p>
            <RuleAddresses addresses={added} isShownForOne />
          </div>
        )}
        {removed.length > 0 && (
          <div className='space-y-2'>
            <p className='text-sm break-words'>
              {WORDS.updateRuleRemove(removed)}
            </p>
            <ul className='space-y-1'>
              {removed.map((address) => (
                <li
                  key={address}
                  className='font-mono text-xs [overflow-wrap:anywhere]'
                >
                  <AddressText address={address} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {link}
      </div>
    );
  }
  return (
    <div className='space-y-2'>
      <p className='text-sm break-words'>
        {provider === 'proton'
          ? WORDS.protonRuleCondition(addresses)
          : WORDS.updateRule(addresses)}
      </p>
      <RuleAddresses addresses={addresses} />
      {link}
    </div>
  );
}

interface AddressFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
}

function AddressField({ id, value, onChange, error }: AddressFieldProps) {
  return (
    <div className='space-y-1.5'>
      <label htmlFor={id} className='block text-sm font-medium'>
        {WORDS.addressLabel}
      </label>
      <ClearOfFooter>
        <Input
          id={id}
          variant='outline'
          type='email'
          inputMode='email'
          autoCapitalize='none'
          autoCorrect='off'
          spellCheck={false}
          placeholder={WORDS.addressPlaceholder}
          value={value}
          aria-describedby={`${id}-hint`}
          aria-invalid={error !== null}
          onChange={(event) => onChange(event.target.value)}
        />
      </ClearOfFooter>
      <p
        id={`${id}-hint`}
        className={
          error === null
            ? 'text-muted-foreground text-xs'
            : 'text-destructive text-xs'
        }
        role={error === null ? undefined : 'alert'}
      >
        {error ?? WORDS.addressHint}
      </p>
    </div>
  );
}

export type SaveBanks = (
  change: (banks: EmailBank[]) => EmailBank[],
) => Promise<boolean>;

interface BankAddressesProps {
  bank: EmailBank;
  allAddresses: string[];
  onSave: SaveBanks;
}

/** A bank's alert addresses: each with a way to remove it while another remains, and one more added in place. */
export function BankAddresses({
  bank,
  allAddresses,
  onSave,
}: BankAddressesProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const save = async (change: (banks: EmailBank[]) => EmailBank[]) => {
    setIsBusy(true);
    setError(null);
    try {
      await onSave(change);
      return true;
    } catch {
      setError(WORDS.banksSaveFailed);
      return false;
    } finally {
      setIsBusy(false);
    }
  };

  const add = async () => {
    const checked = checkAddress(text, allAddresses);
    if (checked.address === null) {
      setError(checked.error);
      return;
    }
    const address = checked.address;
    const isSaved = await save((banks) =>
      banks.some((entry) => entry.addresses.includes(address))
        ? banks
        : banks.map((entry) =>
            entry.id === bank.id
              ? { ...entry, addresses: [...entry.addresses, address] }
              : entry,
          ),
    );
    if (!isSaved) return;
    setText('');
    setIsAdding(false);
  };

  const remove = (address: string) =>
    void save((banks) =>
      banks.map((entry) =>
        entry.id === bank.id && entry.addresses.length > 1
          ? {
              ...entry,
              addresses: entry.addresses.filter((kept) => kept !== address),
            }
          : entry,
      ),
    );

  return (
    <div className='space-y-2'>
      <ul className='border-border divide-border divide-y rounded-xl border'>
        {bank.addresses.map((address) => (
          <li
            key={address}
            className='flex min-h-12 items-center gap-2 py-1 pr-1 pl-3'
          >
            <span className='min-w-0 flex-1 text-sm [overflow-wrap:anywhere]'>
              <AddressText address={address} />
            </span>
            {bank.addresses.length > 1 && (
              <Button
                variant='tertiary'
                size='sm'
                className='size-10 shrink-0 p-0'
                aria-label={WORDS.removeAddress(address)}
                disabled={isBusy}
                onClick={() => remove(address)}
              >
                <X className='size-4' aria-hidden='true' />
              </Button>
            )}
          </li>
        ))}
      </ul>
      {isAdding ? (
        <div className='space-y-2'>
          <AddressField
            id={`bank-address-${bank.id}`}
            value={text}
            onChange={(value) => {
              setText(value);
              setError(null);
            }}
            error={error}
          />
          <div className='flex gap-2'>
            <Button
              size='sm'
              disabled={isBusy || text.trim() === ''}
              onClick={() => void add()}
            >
              {WORDS.addAddress}
            </Button>
            <Button
              variant='secondary'
              size='sm'
              onClick={() => {
                setIsAdding(false);
                setText('');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Button
            variant='tertiary'
            size='sm'
            className='text-primary! -ml-2 gap-1.5'
            onClick={() => setIsAdding(true)}
          >
            <Plus className='size-4' aria-hidden='true' />
            {WORDS.addAnotherAddress}
          </Button>
          {error !== null && (
            <p className='text-destructive text-xs' role='alert'>
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

interface BankPickerProps {
  known: KnownBank[];
  banks: EmailBank[];
  onPick: (draft: BankDraft) => void;
}

/** "Which bank's alerts?": the banks Runway knows that aren't added yet, then Another bank. */
export function BankPicker({ known, banks, onPick }: BankPickerProps) {
  const added = new Set(banks.map((bank) => bank.name.toLowerCase()));
  const offered = known.filter((bank) => !added.has(bank.name.toLowerCase()));
  return (
    <MethodPicker
      methods={[
        ...offered.map((bank) => ({
          id: bank.name,
          emoji: <BankMark name={bank.name} logo={bank.logo} />,
          title: bank.name,
          description: WORDS.knownBankSub,
          onPick: () =>
            onPick({
              name: bank.name,
              isTyped: false,
              address: '',
              error: null,
            }),
        })),
        {
          id: 'another',
          emoji: <Plus className='size-5' aria-hidden='true' />,
          title: WORDS.anotherBank,
          description: WORDS.anotherBankSub,
          isQuiet: offered.length > 0,
          onPick: () =>
            onPick({ name: '', isTyped: true, address: '', error: null }),
        },
      ]}
    />
  );
}

interface BankDraftFormProps {
  draft: BankDraft;
  known: KnownBank[];
  onChange: (draft: BankDraft | null) => void;
}

/** The bank being added: its name (typed for Another bank) and its alert address. */
export function BankDraftForm({ draft, known, onChange }: BankDraftFormProps) {
  return (
    <div className='border-border bg-card space-y-4 rounded-2xl border p-3'>
      {draft.isTyped ? (
        <div className='space-y-1.5'>
          <label htmlFor='bank-name' className='block text-sm font-medium'>
            {WORDS.bankNameLabel}
          </label>
          <Input
            id='bank-name'
            variant='outline'
            autoComplete='off'
            placeholder={WORDS.bankNamePlaceholder}
            value={draft.name}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value, error: null })
            }
          />
        </div>
      ) : (
        <div className='flex items-center gap-3'>
          <BankMark name={draft.name} logo={findBankLogo(known, draft.name)} />
          <p className='min-w-0 flex-1 font-semibold break-words'>
            {draft.name}
          </p>
        </div>
      )}
      <AddressField
        id='bank-address-new'
        value={draft.address}
        onChange={(address) => onChange({ ...draft, address, error: null })}
        error={draft.error}
      />
      <Button
        variant='tertiary'
        size='sm'
        className='text-primary! -ml-2 gap-1.5'
        onClick={() => onChange(null)}
      >
        <ArrowLeftRight className='size-4' aria-hidden='true' />
        {WORDS.chooseOtherBank}
      </Button>
    </div>
  );
}
