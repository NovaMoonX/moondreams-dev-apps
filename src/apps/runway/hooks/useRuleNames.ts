import { useAppSelector } from '@/store';
import type { OpenRule } from '@apps/runway/types';
import { joinNames, RULE_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  findTakeovers,
  needsNewHome,
  RULE_VARIES,
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

const OTHER_CARDS = '\u0000other-cards';

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
  const describeOne = (rule: RuleSealed, isCardLeftOut = false) =>
    describeRule(rule, {
      isCardLeftOut,
      envelope: rule.target === RULE_VARIES ? '' : getEnvelopeName(rule.target),
      card: getCardLabel(rule.cardId),
    });

  return {
    describe: describeOne,
    isEnded,
    liveIds,
    describeHome: (rule: RuleSealed) => {
      if (!isEnded(rule)) return undefined;
      const name = looks.get(rule.target)?.name ?? null;
      return becameKinds.get(rule.target) === 'goal' && name !== null
        ? RULE_WORDS.goalNow(name)
        : RULE_WORDS.endedEnvelope(name);
    },
    describeRemoval: (
      targets: readonly OpenRule[],
      rules: readonly OpenRule[],
    ) => {
      const onYourCard = (cardId: string | null) => {
        const label = getCardLabel(cardId);
        if (label === null) return 'a card';
        return /\bcard$/i.test(label) ? `your ${label}` : `your ${label} card`;
      };
      const subjectOf = (removed: OpenRule) =>
        removed.merchantName ??
        (removed.category !== null
          ? getCategoryLabel(removed.category)
          : `everything on ${onYourCard(removed.cardId)}`);
      const goingIds = new Set(targets.map((rule) => rule.id));
      const left = rules.filter((rule) => !goingIds.has(rule.id));
      const takers = new Map(
        findTakeovers(targets, rules, liveIds).map(({ removed, by }) => [
          removed.id,
          by,
        ]),
      );
      const homes = targets.flatMap((removed) => {
        const by = takers.get(removed.id) ?? null;
        const subject = subjectOf(removed);
        const isNarrowed =
          removed.cardId === null && by !== null && by.cardId !== null;
        if (!isNarrowed) {
          const isOnCard =
            removed.cardId !== null &&
            (removed.merchantKey !== null || removed.category !== null);
          return [
            {
              target: by?.target ?? null,
              subject,
              scope: isOnCard ? `on ${onYourCard(removed.cardId)}` : '',
            },
          ];
        }
        const otherCards = { ...removed, cardId: OTHER_CARDS };
        const [rest] = findTakeovers([otherCards], left, liveIds);
        return [
          { target: by.target, subject, scope: `on ${onYourCard(by.cardId)}` },
          {
            target: rest?.by.target ?? null,
            subject,
            scope: RULE_WORDS.onOtherCards,
          },
        ];
      });
      const groupBy = <T, K>(items: readonly T[], keyOf: (item: T) => K) =>
        items.reduce<Map<K, T[]>>(
          (groups, item) =>
            groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]),
          new Map(),
        );
      const byTarget = [...groupBy(homes, (home) => home.target)];
      const lines = byTarget.map(([target, entries]) => {
        const what =
          entries.length > 3
            ? byTarget.length === 1
              ? RULE_WORDS.whatTheyCaught
              : RULE_WORDS.whatTheRestCaught
            : joinNames(
                [...groupBy(entries, (entry) => entry.scope)].map(
                  ([scope, scoped]) =>
                    [joinNames(scoped.map((entry) => entry.subject)), scope]
                      .filter(Boolean)
                      .join(' '),
                ),
              );
        return target === null
          ? RULE_WORDS.takeoverWait(what)
          : RULE_WORDS.takeover(what, getEnvelopeName(target));
      });
      const kindOf = (rule: OpenRule) => {
        if (isEnded(rule)) return 'paused';
        return rule.target === RULE_VARIES ? 'ask' : 'live';
      };
      const sentencesOf = (kind: string) =>
        targets
          .filter((rule) => kindOf(rule) === kind)
          .map((rule) => describeOne(rule));
      return [
        RULE_WORDS.deleteConfirmBody({
          live: sentencesOf('live'),
          ask: sentencesOf('ask'),
          paused: sentencesOf('paused'),
        }),
        ...lines
          .slice(0, 3)
          .map((line, index) =>
            index === 0 ? RULE_WORDS.afterThis(line) : line,
          ),
        ...(lines.length > 3
          ? [RULE_WORDS.takeoverMore(lines.length - 3)]
          : []),
      ].join(' ');
    },
    getEnvelopeName,
    getCardLabel,
  };
}
