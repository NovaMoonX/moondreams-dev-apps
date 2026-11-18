import { toSpokenText } from '@/lib/speech/spokenText';
import { createOptionMatcher } from '@/utils/optionMatchUtils';
import {
  combineCookLines,
  type CombinedLine,
} from '@apps/pinch/utils/combineCookLines';
import type { PinchUnitSettings } from '@apps/pinch/types';
import type { CookMeasure } from '@apps/pinch/utils/cookConversions';
import { matchByName } from '@apps/pinch/utils/cookVoice';
import {
  getMeasuringTools,
  type MeasuringTool,
} from '@apps/pinch/utils/measuringTools';

export type GatherLayout = 'PARTS' | 'ALL';

export const parseGatherLayout = (stored: unknown): GatherLayout | null =>
  stored === 'PARTS' || stored === 'ALL' ? stored : null;

export interface GatherRow {
  id: string;
  name: string;
  note: string | null;
  amountText: string;
  isMeasured: boolean;
  group: string | null;
  measure: CookMeasure | null;
  ingredientKey: string;
  isLiquid: boolean;
}

export interface GatherDish {
  recipe: { id: string; title: string };
  rows: GatherRow[];
  gotOut: Record<string, boolean>;
}

export const canCombineGather = (dishes: GatherDish[]) => {
  const rows = dishes.flatMap((dish) => dish.rows);
  return (
    dishes.length > 1 ||
    new Set(rows.map((row) => row.group)).size > 1 ||
    new Set(rows.map((row) => row.ingredientKey)).size < rows.length
  );
};

export const getGatherLayout = (
  stored: GatherLayout | null,
  dishes: GatherDish[],
): GatherLayout => (canCombineGather(dishes) ? (stored ?? 'PARTS') : 'PARTS');

export const combineGatherDishes = (
  dishes: GatherDish[],
  units: PinchUnitSettings | null,
) =>
  combineCookLines(
    dishes.flatMap((dish) =>
      dish.rows.map((row) => ({
        recipeId: dish.recipe.id,
        recipeTitle: dish.recipe.title,
        lineId: row.id,
        key: row.ingredientKey,
        name: row.name,
        note: row.note,
        amountText: row.amountText,
        isMeasured: row.isMeasured,
        group: row.group,
        measure: row.measure,
      })),
    ),
    dishes.length > 1,
    units,
  );

export const isGatherLineOut = (line: CombinedLine, dishes: GatherDish[]) =>
  line.sources.every(
    ({ recipeId, lineId }) =>
      dishes.find((dish) => dish.recipe.id === recipeId)?.gotOut[lineId] ===
      true,
  );

export interface GatherItem {
  key: string;
  name: string;
  names: string[];
  sources: { recipeId: string; lineId: string }[];
  isOut: boolean;
  isAnyOut: boolean;
}

const itemMatcher = createOptionMatcher<GatherItem>({
  names: (item) => item.names,
  foldPlurals: true,
});

export const findGatherItems = (query: string, items: GatherItem[]) => {
  const byName = matchByName(
    query,
    items.map((item) => ({ ...item, id: item.key })),
  );
  if (byName.length > 0) return byName;
  const close = itemMatcher.match(query, items);
  return close === null ? [] : [close];
};

const looseItemMatcher = createOptionMatcher<GatherItem>({
  names: (item) => item.names,
  foldPlurals: true,
  typos: 'loose',
});

const lowerFirst = (text: string) =>
  /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;

const capitalize = (text: string) =>
  text === '' ? text : text[0].toUpperCase() + text.slice(1);

const LIST = new Intl.ListFormat('en-US', { type: 'conjunction' });
const OR_LIST = new Intl.ListFormat('en-US', { type: 'disjunction' });

export interface GatherAnswer {
  ok: boolean;
  show: string;
  speak: string;
  /** The lines to tick or untick; empty when nothing changes. */
  sources: { recipeId: string; lineId: string }[];
}

const say = (
  ok: boolean,
  text: string,
  sources: GatherAnswer['sources'] = [],
) => ({
  ok,
  show: text,
  speak: text,
  sources,
});

export const planGatherTick = (
  queries: string[],
  items: GatherItem[],
  isOut: boolean,
  isPlate: boolean,
): GatherAnswer => {
  const where = isPlate ? 'on this plate' : 'in this recipe';
  const results = queries.map((query) => ({
    query,
    found: findGatherItems(query, items),
  }));
  const hits = Array.from(
    new Map(
      results.flatMap(({ found }) =>
        found.length === 1 ? [[found[0].key, found[0]] as const] : [],
      ),
    ).values(),
  );
  const isTicked = (item: GatherItem) => (isOut ? item.isOut : item.isAnyOut);
  const changed = hits.filter((item) => isTicked(item) !== isOut);
  const unchanged = hits.filter((item) => isTicked(item) === isOut);
  const changedKeys = new Set(changed.map((item) => item.key));
  const names = (list: GatherItem[]) =>
    LIST.format(list.map((item) => lowerFirst(item.name)));
  const left = items.filter(
    (item) => !item.isOut && !changedKeys.has(item.key),
  ).length;
  const missing = results.filter(({ found }) => found.length === 0);
  const suggestions = missing.map(({ query }) => ({
    query,
    near: looseItemMatcher.match(query, items),
  }));
  const parts = [
    changed.length === 0
      ? []
      : !isOut
        ? [`Unticked ${names(changed)}.`]
        : left === 0
          ? ["That's everything. Say start cooking when you're ready."]
          : [`Got ${names(changed)}. ${left} left.`],
    unchanged.length === 0
      ? []
      : [
          `${capitalize(names(unchanged))} ${
            unchanged.length === 1
              ? isOut
                ? 'is already ticked'
                : "isn't ticked"
              : isOut
                ? 'are already ticked'
                : "aren't ticked"
          }.`,
        ],
    suggestions.some(({ near }) => near === null)
      ? [
          `No ${OR_LIST.format(
            suggestions
              .filter(({ near }) => near === null)
              .map(({ query }) => query),
          )} ${where}.`,
        ]
      : [],
    suggestions.flatMap(({ query, near }) =>
      near === null
        ? []
        : [`No ${query} ${where}. Did you mean ${lowerFirst(near.name)}?`],
    ),
    results.flatMap(({ found }) =>
      found.length > 1
        ? [
            `Which one: ${OR_LIST.format(found.map((item) => lowerFirst(item.name)))}?`,
          ]
        : [],
    ),
  ].flat();
  return say(
    changed.length > 0,
    parts.join(' '),
    changed.flatMap((item) => item.sources),
  );
};

const MAX_LEFT_SPOKEN = 8;

const toGroupLabel = (group: string) => {
  const text = lowerFirst(group);
  return text.startsWith('for ') ? text : `for ${text}`;
};

export const describeGatherLeft = (
  dishes: GatherDish[],
  layout: GatherLayout,
  units: PinchUnitSettings | null,
): GatherAnswer => {
  const isPlate = dishes.length > 1;
  const sections =
    layout === 'ALL'
      ? [
          {
            label: null,
            lines: combineGatherDishes(dishes, units)
              .filter((line) => !isGatherLineOut(line, dishes))
              .map((line) => ({
                name: line.name,
                amountText: line.amountText,
              })),
          },
        ]
      : dishes.flatMap((dish) => {
          const left = dish.rows.filter((row) => dish.gotOut[row.id] !== true);
          const groups = Array.from(new Set(left.map((row) => row.group)));
          return groups.map((group) => ({
            label:
              [
                isPlate ? dish.recipe.title : null,
                group === null ? null : toGroupLabel(group),
              ]
                .filter((part) => part !== null)
                .join(', ') || null,
            lines: left
              .filter((row) => row.group === group)
              .map((row) => ({ name: row.name, amountText: row.amountText })),
          }));
        });
  const filled = sections.filter((section) => section.lines.length > 0);
  const total = filled.reduce((sum, section) => sum + section.lines.length, 0);
  if (total === 0) return say(true, "You've got everything out.");
  const isLabeled = filled.length > 1;
  const budget = filled.reduce<{
    left: number;
    parts: string[];
    shown: string[];
  }>(
    (result, section) => {
      const take = section.lines.slice(0, Math.max(0, result.left));
      if (take.length === 0) return result;
      const text = take
        .map((line) =>
          line.amountText === ''
            ? line.name
            : `${line.name}, ${line.amountText}`,
        )
        .join('. ');
      const showText = take
        .map((line) =>
          line.amountText === ''
            ? line.name
            : `${line.name} · ${line.amountText}`,
        )
        .join(', ');
      return {
        left: result.left - take.length,
        parts: [
          ...result.parts,
          isLabeled && section.label !== null
            ? `${capitalize(section.label)}: ${text}.`
            : `${capitalize(text)}.`,
        ],
        shown: [
          ...result.shown,
          isLabeled && section.label !== null
            ? `${capitalize(section.label)}: ${showText}`
            : showText,
        ],
      };
    },
    { left: MAX_LEFT_SPOKEN, parts: [], shown: [] },
  );
  const more = total - (MAX_LEFT_SPOKEN - budget.left);
  const moreText = more > 0 ? ` And ${more} more.` : '';
  return {
    ok: true,
    show: `Still to get: ${budget.shown.join(' · ')}${more > 0 ? ` · and ${more} more` : ''}`,
    speak: toSpokenText(`Still to get: ${budget.parts.join(' ')}${moreText}`),
    sources: [],
  };
};

export const getGatherTools = (rows: GatherRow[]) =>
  getMeasuringTools(
    rows.flatMap((row) =>
      row.measure === null
        ? []
        : [
            {
              name: row.name,
              amount: row.measure.amount,
              unit: row.measure.unit,
              isLiquid: row.isLiquid,
              gramsPerMl: row.measure.gramsPerMl,
            },
          ],
    ),
  );

export const describeGatherTools = (tools: MeasuringTool[]): GatherAnswer => {
  if (tools.length === 0) {
    return say(true, "Nothing to measure with: it's all counted.");
  }
  const swapText = (tool: MeasuringTool) =>
    tool.swaps.length === 0
      ? ''
      : ` No scale? ${
          tool.swaps.length === 1 && tool.names.length === 1
            ? `About ${tool.swaps[0].text}.`
            : `${LIST.format(
                tool.swaps.map(
                  (swap, index) =>
                    `${index === 0 ? swap.name : lowerFirst(swap.name)} is about ${swap.text}`,
                ),
              )}.`
        }`;
  const lines = tools.map(
    (tool) => `${tool.name}: ${LIST.format(tool.sizes)}.${swapText(tool)}`,
  );
  return {
    ok: true,
    show: lines.join(' '),
    speak: toSpokenText(lines.join(' ')),
    sources: [],
  };
};
