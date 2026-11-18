import { toSpokenText } from '@/lib/speech/spokenText';
import { createOptionMatcher } from '@/utils/optionMatchUtils';
import {
  combineCookLines,
  type CombinedLine,
} from '@apps/pinch/utils/combineCookLines';
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

/** Whether "By part" and "All together" differ, so the choice is offered at all. */
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

/** One line per ingredient across every dish, as "All together" lists them. */
export const combineGatherDishes = (dishes: GatherDish[]) =>
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
  );

export const isGatherLineOut = (line: CombinedLine, dishes: GatherDish[]) =>
  line.sources.every(
    ({ recipeId, lineId }) =>
      dishes.find((dish) => dish.recipe.id === recipeId)?.gotOut[lineId] ===
      true,
  );

/** An ingredient as the person can say it: every name it goes by and every line a tick of it reaches. */
export interface GatherItem {
  key: string;
  name: string;
  names: string[];
  sources: { recipeId: string; lineId: string }[];
  isOut: boolean;
}

const itemMatcher = createOptionMatcher<GatherItem>({
  names: (item) => item.names,
  foldPlurals: true,
});

/** The ingredients a spoken name means: those whose name holds its words (an exact name first), else one close spelling. */
export const findGatherItems = (query: string, items: GatherItem[]) => {
  const byName = matchByName(
    query,
    items.map((item) => ({ ...item, id: item.key })),
  );
  if (byName.length > 0) return byName;
  const close = itemMatcher.match(query, items);
  return close === null ? [] : [close];
};

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

/** A tick or untick by name: what it reaches, and the answer that says what was heard and what is left. */
export const planGatherTick = (
  query: string,
  items: GatherItem[],
  isOut: boolean,
  isPlate: boolean,
): GatherAnswer => {
  const found = findGatherItems(query, items);
  if (found.length === 0) {
    return say(
      false,
      `No ${query} ${isPlate ? 'on this plate' : 'in this recipe'}.`,
    );
  }
  if (found.length > 1) {
    return say(
      false,
      `Which one: ${OR_LIST.format(found.map((item) => lowerFirst(item.name)))}?`,
    );
  }
  const [item] = found;
  const name = lowerFirst(item.name);
  if (item.isOut === isOut) {
    return say(
      false,
      isOut
        ? `${capitalize(name)} is already ticked.`
        : `${capitalize(name)} isn't ticked.`,
    );
  }
  if (!isOut) return say(true, `Unticked ${name}.`, item.sources);
  const left = items.filter(
    (other) => other.key !== item.key && !other.isOut,
  ).length;
  return say(
    true,
    left === 0
      ? "That's everything. Say start cooking when you're ready."
      : `Got ${name}. ${left} left.`,
    item.sources,
  );
};

const MAX_LEFT_SPOKEN = 8;

const toGroupLabel = (group: string) => {
  const text = lowerFirst(group);
  return text.startsWith('for ') ? text : `for ${text}`;
};

/** What is still to get out, as the layout on screen lists it: one line per ingredient with the amounts added up, or by part with the part named only when there are several. */
export const describeGatherLeft = (
  dishes: GatherDish[],
  layout: GatherLayout,
): GatherAnswer => {
  const isPlate = dishes.length > 1;
  const sections =
    layout === 'ALL'
      ? [
          {
            label: null,
            lines: combineGatherDishes(dishes)
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

const lowerName = lowerFirst;

/** The tools the rows call for, as the tiles list them. */
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

/** The measuring tools as the tiles list them: each tool with its sizes, and what to use without a scale. */
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
                    `${index === 0 ? swap.name : lowerName(swap.name)} is about ${swap.text}`,
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
