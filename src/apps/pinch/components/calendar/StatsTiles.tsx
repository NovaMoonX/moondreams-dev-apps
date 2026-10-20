import { join } from '@moondreamsdev/dreamer-ui/utils';

import MacroStats from '@/components/MacroStats';
import StatTile from '@/components/StatTile';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useAppSelector } from '@/store';
import PeriodLeftOutHelp from '@apps/pinch/components/calendar/PeriodLeftOutHelp';
import { selectShowNutrition } from '@apps/pinch/store/selectors';
import type { NutritionValues } from '@apps/pinch/types';
import { hasShownValue } from '@apps/pinch/utils/nutritionMath';
import {
  getCostAverages,
  getPeriodCostTile,
  getPeriodTotal,
  withWholeCalories,
  type PeriodStats,
} from '@apps/pinch/utils/stats';

interface StatsTilesProps {
  stats: PeriodStats;
  todayKey: string;
  /** What a tap on a cost tile opens (the period's price summary) and on a nutrition tile (its nutrition summary); omitted where the tiles already sit in a view of their own. */
  onOpen?: { cost: () => void; nutrition: () => void };
  /** The tiles are one day's: the total is always there, in the line's words with nothing priced (no summary line says it here), and the nutrition reads "That day". */
  day?: { isPast: boolean };
  /** The nutrition is already on screen elsewhere (a day drawer's front), so this view holds the cost tiles alone. */
  isNutritionHidden?: boolean;
}

interface NutritionTilesProps {
  values: NutritionValues;
  caption: string;
  /** Makes each tile a button that opens the nutrition summary. */
  onOpen?: () => void;
}

/** The nutrition switched on in Settings, as the tiles every Calendar view shows, under a caption that says what they average or total; nothing when none of them is known. */
export function NutritionTiles({
  values,
  caption,
  onOpen,
}: NutritionTilesProps) {
  const show = useAppSelector(selectShowNutrition);
  const isPhone = useMediaQuery().isBelow('sm');
  const whole = withWholeCalories(values);

  if (!hasShownValue(whole, show)) {
    return null;
  }

  return (
    <div className='space-y-1.5'>
      <p className='text-muted-foreground text-xs font-medium'>{caption}</p>
      <MacroStats
        variant='tiles'
        isCompact={!isPhone}
        values={whole}
        show={show}
        onOpen={
          onOpen && { label: 'Open the nutrition summary', onClick: onOpen }
        }
      />
    </div>
  );
}

const COLUMNS = ['grid-cols-2', 'grid-cols-2', 'grid-cols-3'];

// One size for every number in a row, set by the longest and never under the caption's 12px, so a long total never runs under its warning icon. A row of two or one is wide enough for two more characters at full size, and a phrase ("No price yet") has no icon beside it.
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

// At 12px, 8 characters ("$12,345+") don't fit a three-across tile under 360px (7 in a day's drawer, 16px narrower than the Calendar): the total takes the whole row there and the other two share the next.
const NARROW_FULL_ROW_LENGTH = 8;

const getFigureLength = (tile: { value: string }) =>
  tile.value.startsWith('$') ? tile.value.length : 0;

const keepSoFarTogether = (label: string) =>
  label.replace(' so far', '\u00a0so\u00a0far');

function StatsTiles({
  stats,
  todayKey,
  onOpen,
  day,
  isNutritionHidden = false,
}: StatsTilesProps) {
  const show = useAppSelector(selectShowNutrition);
  const total = day
    ? getPeriodTotal(stats, day.isPast)
    : getPeriodCostTile(stats);
  const isPartial = stats.mealsPriced > 0 && stats.leftOut.length > 0;
  const hasDaily =
    !isNutritionHidden &&
    hasShownValue(withWholeCalories(stats.dailyNutrition), show);
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

  const longest =
    Math.max(...tiles.map(getFigureLength)) - (tiles.length === 3 ? 0 : 2);
  const isTotalFullRowOnNarrow =
    tiles.length === 3 &&
    tiles[0].key === 'total' &&
    tiles[0].value.length >= NARROW_FULL_ROW_LENGTH - (day ? 1 : 0);
  const narrowLongest = isTotalFullRowOnNarrow
    ? Math.max(...tiles.slice(1).map(getFigureLength))
    : longest;

  return (
    <div className='space-y-3'>
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
                onOpen={
                  onOpen && {
                    label: `${tile.label}, ${tile.value}. Open the price summary`,
                    onClick: onOpen.cost,
                  }
                }
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
        <NutritionTiles
          values={stats.dailyNutrition}
          caption={day ? 'That day' : 'Daily average'}
          onOpen={onOpen?.nutrition}
        />
      )}
    </div>
  );
}

export default StatsTiles;
