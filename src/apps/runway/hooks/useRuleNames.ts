import { useAppSelector } from '@/store';
import { RULE_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  needsNewHome,
  RULE_VARIES,
  type RuleTakeover,
} from '@apps/runway/engine/rules';
import {
  selectAllCards,
  selectBecameKinds,
  selectEnvelopes,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getCardName } from '@apps/runway/utils/cardText';
import type { RuleSealed } from '@apps/runway/types';
import { describeRule, getCategoryLabel } from '@apps/runway/utils/ruleText';

/** A rule as a sentence, and whether its envelope has ended (then it is not applied). */
export function useRuleNames() {
  const looks = useAppSelector(selectItemLooks);
  const cards = useAppSelector(selectAllCards);
  const envelopes = useAppSelector((state) =>
    selectEnvelopes(state, todayAsUtcDate()),
  );
  const becameKinds = useAppSelector(selectBecameKinds);
  const liveIds = new Set(envelopes.map(({ item }) => item.id));

  const getCardLabel = (cardId: string | null) => {
    const card = cards.find((entry) => entry.id === cardId);
    return card ? getCardName(card, cards) : null;
  };
  const getEnvelopeName = (target: string) =>
    looks.get(target)?.name ?? RULE_WORDS.noEnvelope;

  const isEnded = (rule: RuleSealed) => needsNewHome(rule, liveIds);

  return {
    describe: (rule: RuleSealed, isCardLeftOut = false) =>
      describeRule(rule, {
        isCardLeftOut,
        envelope:
          rule.target === RULE_VARIES ? '' : getEnvelopeName(rule.target),
        card: getCardLabel(rule.cardId),
      }),
    isEnded,
    liveIds,
    describeHome: (rule: RuleSealed) => {
      if (!isEnded(rule)) return undefined;
      const name = looks.get(rule.target)?.name ?? null;
      return becameKinds.get(rule.target) === 'goal' && name !== null
        ? RULE_WORDS.goalNow(name)
        : RULE_WORDS.endedEnvelope(name);
    },
    describeTakeover: ({ removed, by }: RuleTakeover) => {
      const onYourCard = (cardId: string | null) => {
        const label = getCardLabel(cardId);
        if (label === null) return 'a card';
        return /\bcard$/i.test(label) ? `your ${label}` : `your ${label} card`;
      };
      const subject =
        removed.merchantName ??
        (removed.category !== null
          ? getCategoryLabel(removed.category)
          : `everything on ${onYourCard(removed.cardId)}`);
      const scopeCardId =
        removed.merchantKey === null && removed.category === null
          ? null
          : (removed.cardId ?? by.cardId);
      const onCard =
        scopeCardId === null ? '' : ` on ${onYourCard(scopeCardId)}`;
      const what = `${subject}${onCard}`;
      return RULE_WORDS.takeover(what, getEnvelopeName(by.target));
    },
    getEnvelopeName,
    getCardLabel,
  };
}
