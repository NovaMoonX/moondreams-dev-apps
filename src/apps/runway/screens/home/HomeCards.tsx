import { useState } from 'react';

import SectionHeader from '@/components/SectionHeader';
import ShowMoreButton from '@/components/ShowMoreButton';
import { useAppSelector } from '@/store';
import CardRow from '@apps/runway/components/CardRow';
import CardSheets, {
  type OpenedCard,
} from '@apps/runway/components/CardSheets';
import { CARD_WORDS, HOME_TILE_COUNT } from '@apps/runway/constants';
import { getNextDueOn } from '@apps/runway/engine/cards';
import { selectBalances } from '@apps/runway/store/selectors/balanceSelectors';
import { selectAllCards } from '@apps/runway/store/selectors/runwaySelectors';
import type { DateOnly } from '@apps/runway/types';
import { useRunwayUrlState } from '@apps/runway/useRunwayUrlState';
import { getListedCards } from '@apps/runway/utils/cardText';

interface HomeCardsProps {
  today: DateOnly;
}

/** The cards on Home, a few to a screen: those due soonest with money waiting first, then the largest balance; "See all" opens the full list. */
function HomeCards({ today }: HomeCardsProps) {
  const allCards = useAppSelector(selectAllCards);
  const { reserveByCard } = useAppSelector(selectBalances);
  const { showPlanSection, showTab } = useRunwayUrlState();
  const [open, setOpen] = useState<OpenedCard | null>(null);
  const cards = getListedCards(allCards, reserveByCard);
  const waiting = (id: string) => reserveByCard[id] ?? 0;
  const dueOf = (card: (typeof cards)[number]) =>
    waiting(card.id) > 0 ? getNextDueOn(card.dueDay, today) : null;
  const ranked = [...cards].sort((a, b) => {
    const dueA = dueOf(a);
    const dueB = dueOf(b);
    if (dueA !== null && dueB !== null)
      return dueA - dueB || waiting(b.id) - waiting(a.id);
    if (dueA !== null || dueB !== null) return dueA !== null ? -1 : 1;
    return waiting(b.id) - waiting(a.id);
  });
  const shown = ranked.slice(0, HOME_TILE_COUNT);

  if (cards.length === 0) return null;
  return (
    <div className='space-y-2'>
      <SectionHeader
        title={CARD_WORDS.homeTitle}
        action={
          cards.length > shown.length && (
            <ShowMoreButton
              isHeaderAction
              onClick={() => {
                showPlanSection('cards');
                showTab('plan');
              }}
            >
              {CARD_WORDS.homeSeeAll}
            </ShowMoreButton>
          )
        }
      />
      <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
        {shown.map((card) => (
          <CardRow
            key={card.id}
            card={card}
            allCards={allCards}
            reserveCents={waiting(card.id)}
            today={today}
            onOpen={() => setOpen({ cardId: card.id, view: 'menu' })}
          />
        ))}
      </ul>
      <CardSheets cards={cards} open={open} onChange={setOpen} />
    </div>
  );
}

export default HomeCards;
