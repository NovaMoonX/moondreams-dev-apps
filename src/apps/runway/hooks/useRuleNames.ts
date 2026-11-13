import { useAppSelector } from '@/store';
import type { OpenRule } from '@apps/runway/types';
import { joinNames, RULE_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  findNextHomes,
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
      const nextHomes = findNextHomes(targets, rules, liveIds);
      const goingIds = new Set(targets.map((rule) => rule.id));
      const homes = targets.flatMap((removed) => {
        if (removed.merchantKey === null && removed.category === null)
          return nextHomes
            .filter((home) => home.removed.id === removed.id)
            .map(({ by }) => ({
              target: by?.target ?? null,
              subject: rules.some(
                (rule) =>
                  !goingIds.has(rule.id) &&
                  (rule.merchantKey !== null || rule.category !== null) &&
                  (rule.cardId === null || rule.cardId === removed.cardId),
              )
                ? RULE_WORDS.everythingElseOn(onYourCard(removed.cardId))
                : `everything on ${onYourCard(removed.cardId)}`,
              scope: '',
            }));
        const subject =
          removed.merchantName ?? getCategoryLabel(removed.category ?? '');
        const own = nextHomes.filter((home) => home.removed.id === removed.id);
        const rest = own.find(({ cardId }) => cardId === null);
        const named = own.filter(
          ({ cardId, by }) =>
            cardId !== null && (rest === undefined || by?.id !== rest.by?.id),
        );
        return [
          ...named.map(({ cardId, by }) => ({
            target: by?.target ?? null,
            subject,
            scope: `on ${onYourCard(cardId)}`,
          })),
          ...(rest === undefined
            ? []
            : [
                {
                  target: rest.by?.target ?? null,
                  subject,
                  scope: named.length > 0 ? RULE_WORDS.onOtherCards : '',
                },
              ]),
        ];
      });
      const byTarget = [
        ...homes.reduce<Map<string | null, typeof homes>>(
          (groups, home) =>
            groups.set(home.target, [...(groups.get(home.target) ?? []), home]),
          new Map(),
        ),
      ].sort(([a], [b]) => Number(a === null) - Number(b === null));
      const listAll = (names: readonly string[]) =>
        names.length > 1 && names.length <= 6
          ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
          : joinNames(names);
      const describeWhat = (entries: typeof homes) => {
        const scopes = entries.reduce<Map<string, string[]>>(
          (groups, { scope, subject }) =>
            groups.set(scope, [...(groups.get(scope) ?? []), subject]),
          new Map(),
        );
        const scoped = [...scopes]
          .filter(([scope]) => scope !== '')
          .map(([scope, subjects]) => `${listAll(subjects)} ${scope}`);
        return listAll([...scoped, ...(scopes.get('') ?? [])]);
      };
      const lines = byTarget.map(([target, entries]) =>
        target === null
          ? RULE_WORDS.takeoverWait(describeWhat(entries))
          : RULE_WORDS.takeover(describeWhat(entries), getEnvelopeName(target)),
      );
      const waitLine = byTarget.some(([target]) => target === null)
        ? lines.slice(-1)
        : [];
      const envelopeLines = lines.slice(0, lines.length - waitLine.length);
      const shown = [
        ...envelopeLines.slice(0, 3 - waitLine.length),
        ...waitLine,
      ];
      const hidden = lines.length - shown.length;
      const isAsk = (rule: OpenRule) => rule.target === RULE_VARIES;
      const sentences = (keep: (rule: OpenRule) => boolean) =>
        targets.filter(keep).map((rule) => ({
          sentence: describeOne(rule),
          short:
            rule.merchantName ??
            (rule.category === null
              ? `everything on ${getCardLabel(rule.cardId) ?? 'a card'}`
              : [
                  getCategoryLabel(rule.category),
                  rule.cardId === null ? '' : `on ${getCardLabel(rule.cardId)}`,
                ]
                  .filter(Boolean)
                  .join(' ')),
        }));
      const kindLines = [
        ...new Map(
          nextHomes
            .flatMap(({ byKind }) => byKind)
            .map((rule) => [rule.id, rule] as const),
        ).values(),
      ]
        .slice(0, 2)
        .map((rule) => {
          const kind = [
            getCategoryLabel(rule.category ?? ''),
            rule.cardId === null ? '' : `on ${onYourCard(rule.cardId)}`,
          ]
            .filter(Boolean)
            .join(' ');
          if (isAsk(rule)) return RULE_WORDS.kindAsks(kind);
          if (isEnded(rule)) return RULE_WORDS.kindWaits(kind);
          return RULE_WORDS.kindFirst(kind, getEnvelopeName(rule.target));
        });
      const capitalise = (line: string) =>
        `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
      return {
        stops: RULE_WORDS.deleteConfirmBody({
          live: sentences((rule) => !isEnded(rule) && !isAsk(rule)),
          ask: sentences(isAsk),
          paused: sentences(isEnded),
        }),
        next: [
          ...(shown.length === 0
            ? [RULE_WORDS.nothingMoves]
            : shown.map((line, index) =>
                index === 0 ? RULE_WORDS.afterThis(line) : capitalise(line),
              )),
          ...(hidden > 0 ? [RULE_WORDS.takeoverMore(hidden)] : []),
          ...kindLines,
        ].join(' '),
      };
    },
    getEnvelopeName,
    getCardLabel,
  };
}
