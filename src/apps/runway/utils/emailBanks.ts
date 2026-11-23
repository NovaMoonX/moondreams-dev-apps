import { generateUuid } from '@/utils/idUtils';
import { EMAIL_SETUP_WORDS } from '@apps/runway/components/emailWords';
import type { KnownBank } from '@apps/runway/store/selectors/emailSelectors';
import type { EmailBank } from '@apps/runway/types';

const WORDS = EMAIL_SETUP_WORDS;

/** The address in what was pasted ("Chase <alerts@chase.com>" reads alerts@chase.com), lowercase; null when there is none. */
export const readAlertAddress = (text: string) => {
  const found = /[^\s<>,;"'()]+@[^\s<>,;"'()]+\.[^\s<>,;"'()]+/.exec(text)?.[0];
  return found ? found.toLowerCase() : null;
};

/** Every bank's alert addresses, each once, in the order they were added. */
export const listBankAddresses = (banks: EmailBank[]) => [
  ...new Set(banks.flatMap((bank) => bank.addresses)),
];

export const findBankLogo = (known: KnownBank[], name: string) =>
  known.find((bank) => bank.name.toLowerCase() === name.trim().toLowerCase())
    ?.logo ?? null;

export const checkAddress = (text: string, taken: string[]) => {
  const address = readAlertAddress(text);
  if (address === null) return { address: null, error: WORDS.addressInvalid };
  if (taken.includes(address))
    return { address: null, error: WORDS.addressTaken };
  return { address, error: null };
};

/** A bank being added: picked from the ones Runway knows, or typed, with its first alert address. */
export interface BankDraft {
  name: string;
  isTyped: boolean;
  address: string;
  error: string | null;
}

/** Checks a draft against what is already added; the bank to save, or the draft with the reason it can't be. */
export function readBankDraft(
  draft: BankDraft,
  banks: EmailBank[],
): { bank: EmailBank; error: null } | { bank: null; error: string } {
  const name = draft.name.trim();
  if (name === '') return { bank: null, error: WORDS.bankNameNeeded };
  const checked = checkAddress(
    draft.address,
    banks.flatMap((bank) => bank.addresses),
  );
  if (checked.address === null) return { bank: null, error: checked.error };
  return {
    bank: {
      id: generateUuid(),
      name,
      addresses: [checked.address],
      addedAt: Date.now(),
    },
    error: null,
  };
}

/** Adds a drafted bank, or its address to a bank of the same name already on the list. */
export const addDraftedBank =
  (bank: EmailBank) =>
  (banks: EmailBank[]): EmailBank[] => {
    const same = banks.find(
      (entry) => entry.name.toLowerCase() === bank.name.toLowerCase(),
    );
    const taken = new Set(
      banks
        .filter((entry) => entry.id !== same?.id)
        .flatMap((entry) => entry.addresses),
    );
    const addresses = bank.addresses.filter((address) => !taken.has(address));
    if (addresses.length === 0) return banks;
    if (same === undefined) return [...banks, { ...bank, addresses }];
    return banks.map((entry) =>
      entry.id === same.id
        ? {
            ...entry,
            addresses: [...new Set([...entry.addresses, ...addresses])],
          }
        : entry,
    );
  };
