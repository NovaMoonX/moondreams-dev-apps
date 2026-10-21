import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface TrendPoint {
  x: number;
  y: number;
  /** A second line to compare against; drawn only when `secondaryLabel` is set. */
  y2?: number;
}

interface TrendLineChartProps {
  data: TrendPoint[];
  yLabel?: string;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  emptyLabel?: string;
  /** Names the `y2` line, dashed and muted beside the main one. */
  secondaryLabel?: string;
  /** A horizontal guide, such as break even at 0. */
  referenceY?: { value: number; label: string };
  /** Names the main line in the tooltip when the axis carries no title. */
  seriesLabel?: string;
  /** `linear` for a series that steps, where a smoothed curve would overshoot. */
  curve?: 'monotone' | 'linear';
  /** A quiet, rounded look: no grid or axis lines, a soft fill under the line, few ticks and an end dot. */
  isSoft?: boolean;
  /** Sizes the chart box. */
  className?: string;
  /** Dots on every point; off for a dense series. */
  hasDots?: boolean;
}

function TrendLineChart({
  data,
  yLabel,
  formatX = (value) =>
    new Date(value).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }),
  formatY = (value) => String(value),
  emptyLabel = 'Not enough data yet to chart a trend.',
  secondaryLabel,
  referenceY,
  hasDots = true,
  seriesLabel,
  curve = 'monotone',
  className = 'h-64',
  isSoft = false,
}: TrendLineChartProps) {
  if (data.length < 2) {
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        {emptyLabel}
      </p>
    );
  }

  const sorted = [...data].sort((left, right) => left.x - right.x);
  const last = sorted[sorted.length - 1];
  const tickStyle = {
    fill: 'var(--color-muted-foreground)',
    fontSize: isSoft ? 11 : 12,
  };

  return (
    <div className={join('w-full', className)}>
      <ResponsiveContainer width='100%' height='100%'>
        <ComposedChart
          data={sorted}
          margin={{ top: 8, right: isSoft ? 12 : 16, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id='trend-soft-fill' x1='0' y1='0' x2='0' y2='1'>
              <stop
                offset='0%'
                stopColor='var(--color-primary)'
                stopOpacity={0.28}
              />
              <stop
                offset='100%'
                stopColor='var(--color-primary)'
                stopOpacity={0}
              />
            </linearGradient>
          </defs>
          {!isSoft && (
            <CartesianGrid strokeDasharray='3 3' stroke='var(--color-border)' />
          )}
          <XAxis
            dataKey='x'
            type='number'
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatX}
            stroke='var(--color-muted-foreground)'
            tick={tickStyle}
            axisLine={!isSoft}
            tickLine={!isSoft}
            tickCount={isSoft ? 3 : undefined}
            tickMargin={isSoft ? 6 : undefined}
          />
          <YAxis
            tickFormatter={formatY}
            stroke='var(--color-muted-foreground)'
            tick={tickStyle}
            width={isSoft ? 40 : 48}
            axisLine={!isSoft}
            tickLine={!isSoft}
            tickCount={isSoft ? 3 : undefined}
            label={
              yLabel
                ? {
                    value: yLabel,
                    angle: -90,
                    position: 'insideLeft',
                    fill: 'var(--color-muted-foreground)',
                  }
                : undefined
            }
          />
          <Tooltip
            labelFormatter={(value) => formatX(Number(value))}
            formatter={(value, name) => [
              formatY(Number(value)),
              name === 'y2' ? secondaryLabel : (seriesLabel ?? yLabel ?? ''),
            ]}
            contentStyle={{
              background: 'var(--color-popover)',
              color: 'var(--color-popover-foreground)',
              border: '1px solid var(--color-border)',
              borderRadius: isSoft ? 16 : 8,
            }}
          />
          {referenceY && (
            <ReferenceLine
              y={referenceY.value}
              stroke='var(--color-muted-foreground)'
              strokeOpacity={isSoft ? 0.5 : 1}
              strokeDasharray='4 4'
              ifOverflow='extendDomain'
              label={
                isSoft
                  ? undefined
                  : {
                      value: referenceY.label,
                      position: 'insideTopRight',
                      fill: 'var(--color-muted-foreground)',
                      fontSize: 11,
                    }
              }
            />
          )}
          {secondaryLabel && (
            <Line
              type={curve}
              dataKey='y2'
              stroke='var(--color-muted-foreground)'
              strokeOpacity={isSoft ? 0.6 : 1}
              strokeWidth={2}
              strokeDasharray='2 6'
              isAnimationActive={!isSoft}
              strokeLinecap='round'
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}
          {isSoft ? (
            <Area
              type={curve}
              dataKey='y'
              stroke='var(--color-primary)'
              strokeWidth={3}
              strokeLinecap='round'
              strokeLinejoin='round'
              fill='url(#trend-soft-fill)'
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 5 }}
            />
          ) : (
            <Line
              type={curve}
              dataKey='y'
              stroke='var(--color-primary)'
              strokeWidth={2}
              dot={hasDots ? { r: 3, fill: 'var(--color-primary)' } : false}
              activeDot={{ r: 5 }}
            />
          )}
          {isSoft && (
            <ReferenceDot
              x={last.x}
              y={last.y}
              r={6}
              fill='var(--color-primary)'
              stroke='var(--color-card)'
              strokeWidth={3}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default TrendLineChart;
