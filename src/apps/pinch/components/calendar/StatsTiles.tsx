import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import MacroStats from '@/components/MacroStats';
import StatTile from '@/components/StatTile';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import PeriodLeftOutHelp from '@apps/pinch/components/calendar/PeriodLeftOutHelp';
import { selectShowNutrition } from '@apps/pinch/store/selectors';
import { hasShownValue } from '@apps/pinch/utils/nutritionMath';
import {
  getCostAverages,
  getPeriodCostTile,
  withWholeCalories,
  type PeriodStats,
} from '@apps/pinch/utils/stats';

interface StatsTilesProps {
  stats: PeriodStats;
  todayKey: string;
  onOpen: () => void;
}

const COLUMNS = ['grid-cols-2', 'grid-cols-2', 'grid-cols-3'];

// One size for every number in a row, set by the longest and never under the caption's 12px, so a long total never runs under its warning icon.
const getSizeTier = (length: number) => {
  if (length <= 5) return 0;
  if (length === 6) return 1;
  if (length === 7) return 2;
  return 3;
};
const NARROW_SIZES = [
  '',
  'max-[360px]:text-sm',
  'max-[360px]:text-xs',
  'max-[360px]:text-xs',
];
const MID_SIZES = [
  '',
  '',
  'min-[360px]:max-sm:text-sm',
  'min-[360px]:max-sm:text-xs',
];
const getValueSizeClass = (longest: number, narrowLongest = longest) =>
  join(
    MID_SIZES[getSizeTier(longest)],
    NARROW_SIZES[getSizeTier(narrowLongest)],
  );

// At 12px, 8 characters ("$12,345+") don't fit a three-across tile under 360px: the total takes the whole row there and the other two share the next.
const NARROW_FULL_ROW_LENGTH = 8;

const keepSoFarTogether = (label: string) =>
  label.replace(' so far', '\u00a0so\u00a0far');

function StatsTiles({ stats, todayKey, onOpen }: StatsTilesProps) {
  const show = useAppSelector(selectShowNutrition);
  const isPhone = useMediaQuery().isBelow('sm');
  const total = getPeriodCostTile(stats);
  const isPartial = stats.mealsPriced > 0 && stats.leftOut.length > 0;
  const daily = withWholeCalories(stats.dailyNutrition);
  const hasDaily = hasShownValue(daily, show);
  const tiles = [
    ...(total
      ? [
          {
            key: 'total',
            ...total,
            help: isPartial ? (
              <PeriodLeftOutHelp stats={stats} todayKey={todayKey} />
            ) : undefined,
          },
        ]
      : []),
    ...getCostAverages(stats, show.protein).map((average) => ({
      ...average,
      help: undefined,
    })),
  ];

  if (tiles.length === 0 && !hasDaily) {
    return null;
  }

  const longest = Math.max(...tiles.map((tile) => tile.value.length));
  const isTotalFullRowOnNarrow =
    tiles.length === 3 &&
    tiles[0].key === 'total' &&
    tiles[0].value.length >= NARROW_FULL_ROW_LENGTH;
  const narrowLongest = isTotalFullRowOnNarrow
    ? Math.max(...tiles.slice(1).map((tile) => tile.value.length))
    : longest;

  return (
    <div className='relative'>
      {/* Behind the tiles, not around them, which would nest their help buttons; a keyboard reaches the summary through the line above. */}
      <Button
        type='button'
        variant='tertiary'
        tabIndex={-1}
        aria-hidden='true'
        onClick={onOpen}
        className='absolute inset-0 h-full w-full rounded-2xl'
      />
      <div className='pointer-events-none relative space-y-3 [&_button]:pointer-events-auto'>
        {tiles.length > 0 && (
          <div
            className={join(
              'grid gap-2',
              COLUMNS[tiles.length - 1],
              isTotalFullRowOnNarrow && 'max-[360px]:grid-cols-2',
            )}
          >
            {tiles.map((tile) => {
              const isFullRow = isTotalFullRowOnNarrow && tile.key === 'total';
              return (
                <StatTile
                  key={tile.key}
                  label={keepSoFarTogether(tile.label)}
                  value={
                    <span
                      className={
                        isFullRow
                          ? getValueSizeClass(longest, 0)
                          : getValueSizeClass(longest, narrowLongest)
                      }
                    >
                      {tile.value}
                    </span>
                  }
                  help={tile.help}
                  isLabelWrapped
                  className={join(
                    'items-start! max-sm:px-2',
                    isFullRow && 'max-[360px]:col-span-2',
                  )}
                />
              );
            })}
          </div>
        )}
        {hasDaily && (
          <div className='space-y-1.5'>
            <p className='text-muted-foreground text-xs font-medium'>
              Daily average
            </p>
            <MacroStats
              variant='tiles'
              isCompact={!isPhone}
              values={daily}
              show={show}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default StatsTiles;
