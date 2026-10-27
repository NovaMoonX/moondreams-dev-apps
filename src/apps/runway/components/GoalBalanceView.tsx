import { ChartLine } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import TrendLineChart from '@/components/TrendLineChart';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { getNiceMoneyAxis } from '@/utils/chartUtils';
import { formatDateShortUTC } from '@/utils/formatUtils';
import { formatCents, formatCentsShort } from '@/utils/moneyUtils';
import { GOAL_CHART_WORDS } from '@apps/runway/constants';
import {
  useGoalSeries,
  type GoalSeriesTarget,
} from '@apps/runway/hooks/useGoalSeries';

type GoalBalanceViewProps = GoalSeriesTarget;

/** The sheet's row that opens the chart; a goal with fewer than two points has none. */
export function GoalBalanceDoor({
  onOpen,
  ...props
}: GoalBalanceViewProps & { onOpen: () => void }) {
  const series = useGoalSeries(props);
  if (!series.hasChart) return null;
  return (
    <ActionRow
      isGrouped
      hasChevron
      icon={<ChartLine />}
      label={GOAL_CHART_WORDS.door}
      onClick={onOpen}
    />
  );
}

function GoalBalanceView(props: GoalBalanceViewProps) {
  const { goal, today } = props;
  const { isHidden } = useValuesHidden();
  const series = useGoalSeries(props);
  const values = series.points.flatMap((point) =>
    [point.y, point.y2].filter((value): value is number => value != null),
  );
  const axis = getNiceMoneyAxis(
    Math.min(0, ...values),
    Math.max(goal.targetCents, ...values),
  );

  if (isHidden) {
    return (
      <p className='text-muted-foreground text-sm' data-sensitive=''>
        {GOAL_CHART_WORDS.hidden}
      </p>
    );
  }
  return (
    <div className='space-y-2' data-sensitive=''>
      <div
        role='img'
        aria-label={`${goal.name}: ${GOAL_CHART_WORDS.key} Target ${formatCents(goal.targetCents)}${goal.targetDate === null ? '' : ` by ${formatDateShortUTC(goal.targetDate)}`}.`}
      >
        <TrendLineChart
          isSoft
          isReadoutAbove
          referenceLabelSoft
          className='h-[clamp(14rem,calc(100dvh-27rem),26rem)]'
          data={series.points}
          seriesLabel='Held'
          secondaryLabel='Plan'
          readoutLabels={{ main: 'Held', secondary: 'Plan' }}
          curve='linear'
          hasDots={false}
          formatX={formatDateShortUTC}
          formatY={formatCentsShort}
          formatValue={formatCents}
          referenceY={{ value: goal.targetCents, label: 'Target' }}
          yDomain={axis.domain}
          yTicks={axis.ticks}
          dividers={[{ x: today, label: 'Today', labelAt: 'bottom' }]}
          markers={
            series.reachedOn === null
              ? []
              : [
                  {
                    x: series.reachedOn,
                    y: goal.targetCents,
                    label: `${GOAL_CHART_WORDS.reaches} ${formatDateShortUTC(series.reachedOn)}`,
                    side: 'left',
                  },
                ]
          }
        />
      </div>
      <p className='text-muted-foreground text-xs'>{GOAL_CHART_WORDS.key}</p>
    </div>
  );
}

export default GoalBalanceView;
