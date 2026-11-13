import { useState } from 'react';

import HelpTip from '@/components/HelpTip';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import { CHARGED_TO_HINT_WORDS } from '@apps/runway/constants';
import ItemRow from '@apps/runway/components/ItemRow';
import LevelGate from '@apps/runway/components/LevelGate';
import { useLiveEmojiResolver } from '@apps/runway/hooks/useItemEmoji';
import { useChargedToHints } from '@apps/runway/hooks/useChargedTo';
import {
  selectAllAccounts,
  selectAllCards,
  selectBills,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getPlaceNamer } from '@apps/runway/utils/chargedToText';

const SHOWN_ROWS = 3;

interface BillsNoticedCardProps {
  today: number;
  onOpenBill: (billId: string) => void;
}

/** Bills whose recent bank charges were on a card or account other than the one they name: a glance row each, which opens the bill where the suggestion is answered. */
function BillsNoticedCard({ today, onOpenBill }: BillsNoticedCardProps) {
  const hints = useChargedToHints(today);
  const bills = useAppSelector((state) => selectBills(state, today));
  const cards = useAppSelector(selectAllCards);
  const accounts = useAppSelector(selectAllAccounts);
  const emojiOf = useLiveEmojiResolver();
  const [isUnfolded, setIsUnfolded] = useState(false);

  const rows = hints.flatMap((hint) => {
    const payload = bills.find(({ item }) => item.id === hint.billId)?.version
      .payload;
    return payload ? [{ hint, payload }] : [];
  });
  if (rows.length === 0) return null;

  const nameOf = getPlaceNamer(cards, accounts);
  const hidden = rows.length - SHOWN_ROWS;
  const shown = hidden > 0 && !isUnfolded ? rows.slice(0, SHOWN_ROWS) : rows;

  return (
    <LevelGate level='link'>
      <section className='space-y-2'>
        <div className='flex min-h-7 items-center justify-between gap-3'>
          <h3 className='min-w-0 text-sm font-semibold'>
            {CHARGED_TO_HINT_WORDS.heading}
            <span className='text-muted-foreground font-normal'>
              {' · '}
              {rows.length}
            </span>
          </h3>
          <HelpTip title={CHARGED_TO_HINT_WORDS.heading}>
            <p>{CHARGED_TO_HINT_WORDS.headingHelp}</p>
          </HelpTip>
        </div>
        <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
          {shown.map(({ hint, payload }) => (
            <ItemRow
              key={hint.billId}
              name={payload.name}
              emoji={emojiOf(payload.emoji, payload.groupId)}
              detail={CHARGED_TO_HINT_WORDS.rowLine(nameOf(hint.place))}
              ariaLabel={CHARGED_TO_HINT_WORDS.openAria(
                payload.name,
                nameOf(hint.place),
              )}
              isPrivate={false}
              onOpen={() => onOpenBill(hint.billId)}
            />
          ))}
        </ul>
        {hidden > 0 && (
          <ShowMoreButton
            isOpen={isUnfolded}
            onClick={() => setIsUnfolded((current) => !current)}
          >
            {isUnfolded
              ? CHARGED_TO_HINT_WORDS.fewer
              : CHARGED_TO_HINT_WORDS.more(hidden)}
          </ShowMoreButton>
        )}
      </section>
    </LevelGate>
  );
}

export default BillsNoticedCard;
