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
  return words.length > 3
    ? `${words.slice(0, 2).join(', ')} and ${words.length - 2} more`
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

  return (
    <section aria-labelledby='cook-tools-heading' className='space-y-2'>
      <h3
        id='cook-tools-heading'
        className='text-base font-medium [@media(max-height:640px)]:sr-only'
      >
        What you'll measure with
      </h3>
      <ul
        data-no-swipe
        className='grid grid-cols-2 gap-2 [@media(max-height:640px)]:flex [@media(max-height:640px)]:snap-x [@media(max-height:640px)]:overflow-x-auto [@media(max-height:640px)]:pb-1'
      >
        {tools.map((tool) => (
          <li
            key={tool.key}
            className='bg-accent min-w-0 rounded-xl p-3 [@media(max-height:640px)]:w-36 [@media(max-height:640px)]:shrink-0 [@media(max-height:640px)]:snap-start'
          >
            <p className='text-muted-foreground flex items-center gap-1.5 text-xs leading-tight'>
              <MeasuringToolIcon
                tool={tool.key}
                className='text-foreground size-5 shrink-0'
              />
              <span className='min-w-0'>{tool.name}</span>
            </p>
            <p className='mt-2 -ml-1.5 flex flex-wrap gap-1.5 text-lg leading-snug font-semibold'>
              {tool.sizes.map((size) => (
                <span
                  key={size}
                  className='bg-background/70 rounded-md px-1.5 whitespace-nowrap'
                >
                  {size}
                </span>
              ))}
            </p>
            <p className='text-muted-foreground mt-1 line-clamp-3 text-xs wrap-break-word [@media(max-height:640px)]:hidden'>
              For {sayNames(tool.names)}
            </p>
            {tool.swaps.length > 0 && (
              <p className='mt-1 text-xs'>
                No scale?{' '}
                {tool.swaps.length === 1 && tool.names.length === 1
                  ? `About ${tool.swaps[0].text}.`
                  : `${joinWords(
                      tool.swaps.map(
                        (swap, index) =>
                          `${index === 0 ? swap.name : lowerName(swap.name)} is about ${swap.text}`,
                      ),
                    )}.`}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default CookToolsStrip;
