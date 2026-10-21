import {
  CartesianGrid,
  Line,
  LineChart,
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
}: TrendLineChartProps) {
  if (data.length < 2) {
    return (
      <p className='text-muted-foreground py-8 text-center text-sm'>
        {emptyLabel}
      </p>
    );
  }

  const sorted = [...data].sort((left, right) => left.x - right.x);

  return (
    <div className='h-64 w-full'>
      <ResponsiveContainer width='100%' height='100%'>
        <LineChart
          data={sorted}
          margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
        >
          <CartesianGrid strokeDasharray='3 3' stroke='var(--color-border)' />
          <XAxis
            dataKey='x'
            type='number'
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatX}
            stroke='var(--color-muted-foreground)'
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
          />
          <YAxis
            dataKey='y'
            tickFormatter={formatY}
            stroke='var(--color-muted-foreground)'
            tick={{ fill: 'var(--color-muted-foreground)', fontSize: 12 }}
            width={48}
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
              borderRadius: 8,
            }}
          />
          {referenceY && (
            <ReferenceLine
              y={referenceY.value}
              stroke='var(--color-muted-foreground)'
              strokeDasharray='4 4'
              label={{
                value: referenceY.label,
                position: 'insideTopLeft',
                fill: 'var(--color-muted-foreground)',
                fontSize: 11,
              }}
            />
          )}
          {secondaryLabel && (
            <Line
              type={curve}
              dataKey='y2'
              stroke='var(--color-muted-foreground)'
              strokeWidth={2}
              strokeDasharray='5 4'
              dot={false}
              activeDot={{ r: 4 }}
            />
          )}
          <Line
            type={curve}
            dataKey='y'
            stroke='var(--color-primary)'
            strokeWidth={2}
            dot={hasDots ? { r: 3, fill: 'var(--color-primary)' } : false}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default TrendLineChart;
