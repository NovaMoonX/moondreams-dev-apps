import { useState } from 'react';

import DetailSheet from '@/components/DetailSheet';
import { PillGroup } from '@/components/PillGroup';
import { MEAL_TYPE_EMOJIS, MEAL_TYPE_LABELS } from '@apps/pinch/constants';
import { formatDayTitle, formatMonthTitle } from '@apps/pinch/utils/dayKeys';
import { formatCost } from '@apps/pinch/utils/mealFormat';
import type { MonthStats, Totals } from '@apps/pinch/utils/stats';

type BreakdownView = 'day' | 'meal';

const VIEW_OPTIONS: { value: BreakdownView; label: string }[] = [
  { value: 'day', label: 'By day' },
  { value: 'meal', label: 'By meal' },
];

interface BreakdownDrawerProps {
  monthKey: string;
  stats: MonthStats;
  onClose: () => void;
}

function BreakdownDrawer({ monthKey, stats, onClose }: BreakdownDrawerProps) {
  const [view, setView] = useState<BreakdownView>('day');

  const rows: { key: string; label: string; totals: Totals }[] =
    view === 'day'
      ? stats.byDay.map((day) => ({
          key: day.dayKey,
          label: formatDayTitle(day.dayKey),
          totals: day,
        }))
      : stats.byType.map((type) => ({
          key: type.mealType,
          label: `${MEAL_TYPE_EMOJIS[type.mealType]} ${MEAL_TYPE_LABELS[type.mealType]}`,
          totals: type,
        }));

  return (
    <DetailSheet
      isOpen
      onClose={onClose}
      title={`${formatMonthTitle(monthKey)} · ${formatCost(stats.spendCents)}`}
    >
      <div className='flex max-h-[max(12rem,calc(92dvh-22rem))] flex-col gap-3'>
        <div className='shrink-0'>
          <PillGroup
            label='Breakdown'
            options={VIEW_OPTIONS}
            value={view}
            onChange={setView}
            isThin
          />
        </div>
        <ul className='divide-border min-h-0 flex-1 divide-y overflow-y-auto'>
          {rows.map((row) => (
            <li
              key={row.key}
              className='flex items-baseline justify-between gap-3 py-2.5'
            >
              <span className='min-w-0'>
                <span className='block'>{row.label}</span>
                <span className='text-muted-foreground block text-xs'>
                  {row.totals.count} {row.totals.count === 1 ? 'meal' : 'meals'}
                </span>
              </span>
              <span className='text-muted-foreground shrink-0 text-sm whitespace-nowrap'>
                {row.totals.totalCents === null
                  ? '—'
                  : formatCost(row.totals.totalCents)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </DetailSheet>
  );
}

export default BreakdownDrawer;
