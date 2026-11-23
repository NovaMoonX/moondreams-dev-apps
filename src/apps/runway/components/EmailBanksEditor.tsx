import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { Plus, X } from 'lucide-react';

import ClearOfFooter from '@/components/ClearOfFooter';
import CopyTextButton from '@/components/CopyTextButton';
import MethodPicker from '@/components/MethodPicker';
import { EMAIL_SETUP_WORDS } from '@apps/runway/components/emailWords';
import ItemBadge from '@apps/runway/components/ItemBadge';
import type { KnownBank } from '@apps/runway/store/selectors/emailSelectors';
import type { EmailBank } from '@apps/runway/types';
import {
  checkAddress,
  findBankLogo,
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
export function RuleAddresses({ addresses }: { addresses: string[] }) {
  if (addresses.length < 2) return null;
  return (
    <ul className='border-border divide-border divide-y rounded-xl border'>
      {addresses.map((address) => (
        <li
          key={address}
          className='flex min-h-11 items-center gap-2 py-1 pr-2 pl-3'
        >
          <span className='min-w-0 flex-1 font-mono text-xs break-all'>
            {address}
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
) => Promise<void>;

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
      banks.map((entry) =>
        entry.id === bank.id && !entry.addresses.includes(address)
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
            <span className='min-w-0 flex-1 text-sm break-all'>{address}</span>
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
              variant='secondary'
              size='sm'
              disabled={isBusy || text.trim() === ''}
              onClick={() => void add()}
            >
              {WORDS.addAddress}
            </Button>
            <Button
              variant='tertiary'
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
            className='text-primary -ml-2 gap-1.5'
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
        className='-ml-2'
        onClick={() => onChange(null)}
      >
        {WORDS.chooseOtherBank}
      </Button>
    </div>
  );
}
