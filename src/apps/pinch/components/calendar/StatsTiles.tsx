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

/** The tiles' numbers step down together on a phone as the longest grows, so none runs under the Total tile's warning icon. */
const getValueSizeClass = (longest: number) => {
  if (longest <= 5) return undefined;
  if (longest === 6) return 'max-[360px]:text-sm';
  if (longest === 7) return 'min-[360px]:max-sm:text-base max-[360px]:text-xs';
  return 'min-[360px]:max-sm:text-sm max-[360px]:text-[0.6875rem]';
};

/** The period's total, averages and daily nutrition as tiles, for the Calendar's "Show stats" option; a tap anywhere on them opens the summary the line above opens. */
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

  const valueSizeClass = getValueSizeClass(
    Math.max(...tiles.map((tile) => tile.value.length)),
  );

  return (
    <div className='relative'>
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
          <div className={join('grid gap-2', COLUMNS[tiles.length - 1])}>
            {tiles.map((tile) => (
              <StatTile
                key={tile.key}
                label={tile.label.replace(' so far', '\u00a0so\u00a0far')}
                value={<span className={valueSizeClass}>{tile.value}</span>}
                help={tile.help}
                isLabelWrapped
                className='items-start! max-sm:px-2'
              />
            ))}
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
