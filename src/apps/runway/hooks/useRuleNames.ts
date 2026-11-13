import { useAppSelector } from '@/store';
import { RULE_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import { needsNewHome, RULE_VARIES } from '@apps/runway/engine/rules';
import {
  selectAllCards,
  selectEnvelopes,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getCardName } from '@apps/runway/utils/cardText';
import type { RuleSealed } from '@apps/runway/types';
import { describeRule } from '@apps/runway/utils/ruleText';

/** A rule as a sentence, and whether its envelope has ended (then it is not applied). */
export function useRuleNames() {
  const looks = useAppSelector(selectItemLooks);
  const cards = useAppSelector(selectAllCards);
  const envelopes = useAppSelector((state) =>
    selectEnvelopes(state, todayAsUtcDate()),
  );
  const liveIds = new Set(envelopes.map(({ item }) => item.id));

  const getCardLabel = (cardId: string | null) => {
    const card = cards.find((entry) => entry.id === cardId);
    return card ? getCardName(card, cards) : null;
  };
  const getEnvelopeName = (target: string) =>
    looks.get(target)?.name ?? RULE_WORDS.noEnvelope;

  return {
    describe: (rule: RuleSealed, isCardLeftOut = false) =>
      describeRule(rule, {
        isCardLeftOut,
        envelope:
          rule.target === RULE_VARIES ? '' : getEnvelopeName(rule.target),
        card: getCardLabel(rule.cardId),
      }),
    isEnded: (rule: RuleSealed) => needsNewHome(rule, liveIds),
    getEnvelopeName,
    findEnvelopeName: (target: string) => looks.get(target)?.name ?? null,
    getCardLabel,
  };
}
