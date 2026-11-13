import { ACCOUNT_WORDS, CARD_WORDS } from '@apps/runway/constants';
import type { ChargedPlace } from '@apps/runway/engine/chargedTo';
import type { OpenAccount, OpenCard } from '@apps/runway/types';
import { getCardName } from '@apps/runway/utils/cardText';

/** Names a card or account the way a person knows it: its name, then its last 4 digits when it has them. */
export const getPlaceNamer =
  (cards: readonly OpenCard[], accounts: readonly OpenAccount[]) =>
  (place: ChargedPlace): string => {
    if (place.kind === 'card') {
      const card = cards.find((found) => found.id === place.id);
      if (!card) return CARD_WORDS.cashOrDebit;
      const name = getCardName(card, cards);
      return card.lastFour
        ? CARD_WORDS.withLastFour(name, card.lastFour)
        : name;
    }
    const account = accounts.find((found) => found.id === place.id);
    if (!account) return ACCOUNT_WORDS.payFromNone;
    return account.lastFour
      ? ACCOUNT_WORDS.withLastFour(account.name, account.lastFour)
      : account.name;
  };
