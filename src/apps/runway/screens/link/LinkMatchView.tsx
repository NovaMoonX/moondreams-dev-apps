import { Select } from '@moondreamsdev/dreamer-ui/components';

import SensitiveValue from '@/components/SensitiveValue';
import { useAppSelector } from '@/store';
import { formatCents } from '@/utils/moneyUtils';
import { LINK_WORDS } from '@apps/runway/constants';
import {
  getTargetKind,
  isLinkable,
  type LinkChoice,
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

const KIND_WORDS = {
  depository: LINK_WORDS.kindDepository,
  credit: LINK_WORDS.kindCredit,
  other: LINK_WORDS.kindOther,
} as const;

interface LinkMatchViewProps {
  rows: readonly NormalizedAccount[];
  choices: readonly LinkChoice[];
  isBusy: boolean;
  onChange: (index: number, choice: LinkChoice) => void;
}

/** One row per account the bank sent: its name, kind, last digits and balance, and the picker that says which of the person's it is. */
function LinkMatchView({
  rows,
  choices,
  isBusy,
  onChange,
}: LinkMatchViewProps) {
  const cards = useAppSelector(selectAllCards);
  const accounts = useAppSelector(selectAllAccounts);

  return (
    <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
      {rows.map((row, index) => {
        const choice = choices[index] ?? { kind: 'skip' };
        const takenElsewhere = new Set(
          choices.flatMap((other, otherIndex) =>
            other.kind === 'existing' && otherIndex !== index
              ? [`${other.target}:${other.id}`]
              : [],
          ),
        );
        const kind = getTargetKind(row.kind);
        const options = [
          ...(kind === 'card' ? [] : accounts)
            .filter(
              (account) =>
                isLinkable({ ...account, bank: account.institution }) &&
                !takenElsewhere.has(`account:${account.id}`),
            )
            .map((account) => ({
              value: `account:${account.id}`,
              text: account.name,
              description: [
                account.institution,
                account.lastFour ? `••${account.lastFour}` : null,
              ]
                .filter(Boolean)
                .join(' '),
            })),
          ...(kind === 'account' || kind === null ? [] : cards)
            .filter(
              (card) =>
                isLinkable({ ...card, bank: card.issuer }) &&
                !takenElsewhere.has(`card:${card.id}`),
            )
            .map((card) => ({
              value: `card:${card.id}`,
              text: getCardName(card, cards),
              description: card.lastFour ? `••${card.lastFour}` : '',
            })),
          { value: NEW_VALUE, text: LINK_WORDS.addAsNew },
          { value: SKIP_VALUE, text: LINK_WORDS.skip },
        ];
        return (
          <li key={row.providerAccountId} className='space-y-2 p-3'>
            <div className='flex items-start justify-between gap-3'>
              <div className='min-w-0'>
                <p className='font-medium break-words'>{row.name}</p>
                <p className='text-muted-foreground text-sm'>
                  {KIND_WORDS[row.kind]}
                  {row.mask ? ` · ••${row.mask}` : ''}
                </p>
              </div>
              <p className='shrink-0 font-medium whitespace-nowrap tabular-nums'>
                {row.balanceCents === null ? (
                  <span className='text-muted-foreground text-sm font-normal'>
                    {LINK_WORDS.noBalance}
                  </span>
                ) : (
                  <SensitiveValue>
                    {formatCents(row.balanceCents)}
                  </SensitiveValue>
                )}
              </p>
            </div>
            <Select
              aria-label={`${row.name}: ${LINK_WORDS.matchTitle}`}
              options={options}
              value={toChoiceValue(choice)}
              disabled={isBusy}
              onChange={(value) => onChange(index, fromChoiceValue(value))}
            />
          </li>
        );
      })}
    </ul>
  );
}

export default LinkMatchView;
