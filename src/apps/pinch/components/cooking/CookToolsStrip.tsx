import MeasuringToolIcon from '@apps/pinch/components/cooking/MeasuringToolIcons';
import type { CookRow } from '@apps/pinch/components/cooking/CookIngredientsView';
import { getMeasuringTools } from '@apps/pinch/utils/measuringTools';

const lowerName = (name: string) =>
  /^[A-Z][a-z]/.test(name) ? name[0].toLowerCase() + name.slice(1) : name;

const joinWords = (words: string[]) =>
  words.length < 2
    ? (words[0] ?? '')
    : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

const sayNames = (names: string[]) => {
  const words = names.map(lowerName);
  return words.length > 4
    ? `${words.slice(0, 3).join(', ')} and ${words.length - 3} more`
    : joinWords(words);
};

/** The measuring tools the rows call for, one tile each with the sizes to reach for first; nothing when no row is measured. */
function CookToolsStrip({ rows }: { rows: CookRow[] }) {
  const tools = getMeasuringTools(
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
  if (tools.length === 0) return null;
  const swaps = tools.find((tool) => tool.key === 'SCALE')?.swaps ?? [];

  return (
    <section aria-labelledby='cook-tools-heading' className='space-y-2'>
      <h3
        id='cook-tools-heading'
        className='text-base font-medium [@media(max-height:640px)]:sr-only'
      >
        What you'll measure with
      </h3>
      <ul data-no-swipe className='flex snap-x gap-2 overflow-x-auto pb-1'>
        {tools.map((tool) => (
          <li
            key={tool.key}
            className='bg-accent w-44 shrink-0 snap-start rounded-xl p-3'
          >
            <p className='text-muted-foreground flex items-center gap-1.5 text-xs'>
              <MeasuringToolIcon
                tool={tool.key}
                className='text-foreground size-5 shrink-0'
              />
              {tool.name}
            </p>
            <p className='mt-2 flex flex-wrap gap-x-2 text-lg leading-snug font-semibold'>
              {tool.sizes.map((size) => (
                <span key={size} className='whitespace-nowrap'>
                  {size}
                </span>
              ))}
            </p>
            <p className='text-muted-foreground mt-1 text-xs wrap-break-word [@media(max-height:640px)]:hidden'>
              For {sayNames(tool.names)}
            </p>
          </li>
        ))}
      </ul>
      {swaps.length > 0 && (
        <p className='text-muted-foreground text-sm'>
          No scale?{' '}
          {joinWords(
            swaps.map(
              (swap, index) =>
                `${index === 0 ? swap.name : lowerName(swap.name)} is about ${swap.text}`,
            ),
          )}
          .
        </p>
      )}
    </section>
  );
}

export default CookToolsStrip;
