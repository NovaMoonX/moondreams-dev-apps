import { useAppSelector } from '@/store';
import type { OpenRule } from '@apps/runway/types';
import { joinNames, RULE_WORDS } from '@apps/runway/constants';
import { todayAsUtcDate } from '@apps/runway/engine/dates';
import {
  findNextHomes,
  needsNewHome,
  RULE_VARIES,
  type NextPlace,
} from '@apps/runway/engine/rules';
import {
  selectAllCards,
  selectBecameKinds,
  selectEnvelopes,
  selectItemLooks,
} from '@apps/runway/store/selectors/runwaySelectors';
import { getCardName } from '@apps/runway/utils/cardText';
import { toDisplayCase } from '@/utils/optionMatchUtils';
import type { RuleSealed } from '@apps/runway/types';
import { describeRule, getCategoryLabel } from '@apps/runway/utils/ruleText';

const ASKS = '~asks';
const kindLabel = (category: string) => {
  const label = getCategoryLabel(category);
  return /^[A-Z][a-z]/.test(label)
    ? `${label.charAt(0).toLowerCase()}${label.slice(1)}`
    : label;
};
const WAITS = '~waits';

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
      const isAsk = (rule: OpenRule) => rule.target === RULE_VARIES;
      const toKey = ({ by, isAsk }: NextPlace) =>
        by?.target ?? (isAsk ? ASKS : WAITS);
      const nameOf = (rule: OpenRule) => {
        const store =
          rule.merchantName ??
          (rule.merchantKey === null ? null : toDisplayCase(rule.merchantKey));
        const kind = rule.category === null ? null : kindLabel(rule.category);
        return store !== null && kind !== null
          ? `${store} ${kind}`
          : (store ?? kind);
      };
      const placesOf = (removed: OpenRule) => {
        const own = nextHomes.filter((home) => home.removed.id === removed.id);
        if (removed.merchantKey === null && removed.category === null)
          return own.map((home) => ({
            key: toKey(home),
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
        const subject = nameOf(removed) ?? '';
        const rest = own.find(({ cardId }) => cardId === null);
        const named = own.filter(
          (home) =>
            home.cardId !== null &&
            (rest === undefined || toKey(home) !== toKey(rest)),
        );
        return [
          ...named.map((home) => ({
            key: toKey(home),
            subject,
            scope: `on ${onYourCard(home.cardId)}`,
          })),
          ...(rest === undefined
            ? []
            : [
                {
                  key: toKey(rest),
                  subject,
                  scope: named.length > 0 ? RULE_WORDS.onOtherCards : '',
                },
              ]),
        ];
      };
      const homes = targets.flatMap((removed) =>
        placesOf(removed).filter(
          ({ key }) => key !== WAITS || (!isEnded(removed) && !isAsk(removed)),
        ),
      );
      const order = (key: string) => (key === WAITS ? 2 : key === ASKS ? 1 : 0);
      const byKey = [
        ...homes.reduce<Map<string, typeof homes>>(
          (groups, home) =>
            groups.set(home.key, [...(groups.get(home.key) ?? []), home]),
          new Map(),
        ),
      ].sort(([a], [b]) => order(a) - order(b));
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
      const toLine = (key: string, what: string) =>
        key === WAITS
          ? RULE_WORDS.takeoverWait(what)
          : key === ASKS
            ? RULE_WORDS.takeoverAsk(what)
            : RULE_WORDS.takeover(what, getEnvelopeName(key));
      const lines = byKey.map(([key, entries]) =>
        toLine(key, describeWhat(entries)),
      );
      const kindLines = [
        ...[
          ...targets
            .flatMap((removed) => {
              const own = nextHomes.filter(
                (home) => home.removed.id === removed.id,
              );
              return own.flatMap((home) =>
                home.byKind
                  .filter((kind) => !(kind.isAsk && isAsk(removed)))
                  .map((kind) => ({
                    id: `${removed.id}|${kind.category}|${toKey(kind)}`,
                    removed,
                    kind,
                    cardId: home.cardId,
                    count: own.length,
                  })),
              );
            })
            .reduce<
              Map<
                string,
                {
                  removed: OpenRule;
                  kind: NextPlace & { category: string };
                  cards: (string | null)[];
                  count: number;
                }
              >
            >(
              (groups, { id, removed, kind, cardId, count }) =>
                groups.set(id, {
                  removed,
                  kind,
                  count,
                  cards: [...(groups.get(id)?.cards ?? []), cardId],
                }),
              new Map(),
            )
            .values(),
        ]
          .map(({ removed, kind, cards, count }) => ({
            kind,
            store: nameOf(removed) ?? '',
            scope:
              removed.cardId === null && cards.length === count
                ? null
                : joinNames([
                    ...cards.flatMap((cardId) =>
                      cardId === null ? [] : [onYourCard(cardId)],
                    ),
                    ...(cards.includes(null) ? [RULE_WORDS.otherCards] : []),
                  ]),
          }))
          .reduce<
            Map<
              string,
              {
                kind: NextPlace & { category: string };
                scope: string | null;
                stores: string[];
              }
            >
          >((groups, { kind, store, scope }) => {
            const id = `${kind.category}|${toKey(kind)}|${scope ?? ''}`;
            return groups.set(id, {
              kind,
              scope,
              stores: [...(groups.get(id)?.stores ?? []), store],
            });
          }, new Map())
          .values(),
      ].map(({ kind, scope, stores }) =>
        toLine(
          toKey(kind),
          RULE_WORDS.kindOf(
            listAll([...new Set(stores)]),
            kindLabel(kind.category),
            scope,
          ),
        ),
      );
      const waitLine = byKey.some(([key]) => key === WAITS)
        ? lines.slice(-1)
        : [];
      const firstLines = lines.slice(0, lines.length - waitLine.length);
      const total = lines.length + kindLines.length;
      const room = Math.max(0, (total === 4 ? 4 : 3) - waitLine.length);
      const shownFirst = firstLines.slice(0, room);
      const shown = [
        ...shownFirst,
        ...waitLine,
        ...kindLines.slice(0, Math.max(0, room - shownFirst.length)),
      ];
      const hidden = total - shown.length;
      const shortNames = (keep: (rule: OpenRule) => boolean) => [
        ...new Set(
          targets.filter(keep).map((rule) => {
            const name = nameOf(rule);
            if (name === null)
              return `everything on ${onYourCard(rule.cardId)}`;
            return rule.cardId === null
              ? name
              : `${name} on ${onYourCard(rule.cardId)}`;
          }),
        ),
      ];
      const capitalise = (line: string) =>
        `${line.charAt(0).toUpperCase()}${line.slice(1)}`;
      return {
        stops: RULE_WORDS.deleteConfirmBody({
          all: targets.length > 1 ? shortNames(() => true) : [],
          ask: shortNames(isAsk),
          paused: shortNames(isEnded),
        }),
        next: [
          ...(shown.length === 0
            ? [
                targets.some((rule) => isEnded(rule) || isAsk(rule))
                  ? RULE_WORDS.staysSame
                  : RULE_WORDS.nothingMoves,
              ]
            : shown.map((line, index) =>
                index === 0 ? RULE_WORDS.afterThis(line) : capitalise(line),
              )),
          ...(hidden > 0 ? [RULE_WORDS.takeoverMore(hidden)] : []),
          RULE_WORDS.placedStay,
        ],
      };
    },
    getEnvelopeName,
    getCardLabel,
  };
}
