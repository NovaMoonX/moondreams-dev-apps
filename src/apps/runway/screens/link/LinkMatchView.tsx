import { useState } from 'react';

import FormSheet from '@/components/FormSheet';
import { PillGroup } from '@/components/PillGroup';
import SummaryRow from '@/components/SummaryRow';
import { useAppSelector } from '@/store';
import { LINK_WORDS } from '@apps/runway/constants';
import {
  getTargetKind,
  isLinkable,
  type LinkChoice,
  type MatchTargetKind,
} from '@apps/runway/engine/linkMatch';
import {
  selectAllAccounts,
  selectAllCards,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { NormalizedAccount } from '@apps/runway/types';
import { getCardName } from '@apps/runway/utils/cardText';

const NEW_VALUE = 'new';
const SKIP_VALUE = 'skip';

const toChoiceValue = (choice: LinkChoice) =>
  choice.kind === 'existing' ? `${choice.target}:${choice.id}` : choice.kind;

const fromChoiceValue = (value: string): LinkChoice => {
  if (value === NEW_VALUE) return { kind: 'new' };
  if (value === SKIP_VALUE) return { kind: 'skip' };
  const [target, id] = value.split(':');
  return {
    kind: 'existing',
    target: target === 'card' ? 'card' : 'account',
    id,
  };
};

const toBankAndDigits = (bank: string, lastFour: string | null | undefined) =>
  [bank, lastFour ? `••${lastFour}` : null].filter(Boolean).join(' ');

interface LinkMatchViewProps {
  rows: readonly NormalizedAccount[];
  choices: readonly LinkChoice[];
  /** The card or account the person started from; offered first. */
  startedFrom: { target: MatchTargetKind; id: string } | null;
  onChange: (index: number, choice: LinkChoice) => void;
}

/** One summary row per account the bank sent, with the one of the person's it is as its line; a row opens a small sheet to change it. */
function LinkMatchView({
  rows,
  choices,
  startedFrom,
  onChange,
}: LinkMatchViewProps) {
  const cards = useAppSelector(selectAllCards);
  const accounts = useAppSelector(selectAllAccounts);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const getPickWords = (choice: LinkChoice) => {
    if (choice.kind === 'new') return LINK_WORDS.pickedNew;
    if (choice.kind === 'skip') return LINK_WORDS.pickedSkip;
    const name =
      choice.target === 'card'
        ? cards.find((card) => card.id === choice.id)
        : accounts.find((account) => account.id === choice.id);
    if (!name) return LINK_WORDS.pickedSkip;
    return LINK_WORDS.pickedExisting(
      'issuer' in name ? getCardName(name, cards) : name.name,
    );
  };

  const getOptions = (row: NormalizedAccount, index: number) => {
    const takenElsewhere = new Set(
      choices.flatMap((other, otherIndex) =>
        other.kind === 'existing' && otherIndex !== index
          ? [`${other.target}:${other.id}`]
          : [],
      ),
    );
    const kind = getTargetKind(row.kind);
    const existing = [
      ...(kind === 'card' ? [] : accounts)
        .filter(
          (account) =>
            isLinkable({ ...account, bank: account.institution }) &&
            !takenElsewhere.has(`account:${account.id}`),
        )
        .map((account) => ({
          value: `account:${account.id}`,
          label: account.name,
          detail: toBankAndDigits(account.institution, account.lastFour),
        })),
      ...(kind === 'account' || kind === null ? [] : cards)
        .filter(
          (card) =>
            isLinkable({ ...card, bank: card.issuer }) &&
            !takenElsewhere.has(`card:${card.id}`),
        )
        .map((card) => ({
          value: `card:${card.id}`,
          label: getCardName(card, cards),
          detail: toBankAndDigits(card.issuer, card.lastFour),
        })),
    ];
    const first = startedFrom
      ? existing.filter(
          (option) =>
            option.value === `${startedFrom.target}:${startedFrom.id}`,
        )
      : [];
    return [
      ...first,
      ...existing.filter((option) => !first.includes(option)),
      { value: NEW_VALUE, label: LINK_WORDS.addAsNew },
      { value: SKIP_VALUE, label: LINK_WORDS.skip },
    ];
  };

  const openRow = openIndex === null ? null : (rows[openIndex] ?? null);

  return (
    <>
      <ul className='space-y-2'>
        {rows.map((row, index) => (
          <li key={row.providerAccountId}>
            <SummaryRow
              label={`${row.name}${row.mask ? ` ••${row.mask}` : ''}`}
              ariaLabel={`${row.name}: ${LINK_WORDS.matchTitle}`}
              onClick={() => setOpenIndex(index)}
            >
              {getPickWords(choices[index] ?? { kind: 'skip' })}
            </SummaryRow>
          </li>
        ))}
      </ul>
      {openRow !== null && openIndex !== null && (
        <FormSheet
          isOpen
          onClose={() => setOpenIndex(null)}
          title={LINK_WORDS.pickTitle(openRow.name)}
          actions={<></>}
        >
          <PillGroup
            label={LINK_WORDS.pickTitle(openRow.name)}
            options={getOptions(openRow, openIndex)}
            value={toChoiceValue(choices[openIndex] ?? { kind: 'skip' })}
            onChange={(value) => {
              onChange(openIndex, fromChoiceValue(value));
              setOpenIndex(null);
            }}
          />
        </FormSheet>
      )}
    </>
  );
}

export default LinkMatchView;
