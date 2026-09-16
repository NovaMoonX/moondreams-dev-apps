import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface TrendPoint {
  x: number;
  y: number;
}

interface TrendLineChartProps {
  data: TrendPoint[];
  yLabel?: string;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  emptyLabel?: string;
}

function TrendLineChart({
  data,
  yLabel,
  formatX = (value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  formatY = (value) => String(value),
  emptyLabel = 'Not enough data yet to chart a trend.',
}: TrendLineChartProps) {
  if (data.length < 2) {
    return <p className='text-muted-foreground py-8 text-center text-sm'>{emptyLabel}</p>;
  }

  const sorted = [...data].sort((left, right) => left.x - right.x);

  return (
    <div className='h-64 w-full'>
      <ResponsiveContainer width='100%' height='100%'>
        <LineChart data={sorted} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
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
                ? { value: yLabel, angle: -90, position: 'insideLeft', fill: 'var(--color-muted-foreground)' }
                : undefined
            }
          />
          <Tooltip
            labelFormatter={(value) => formatX(Number(value))}
            formatter={(value) => [formatY(Number(value)), yLabel ?? '']}
            contentStyle={{
              background: 'var(--color-popover)',
              color: 'var(--color-popover-foreground)',
              border: '1px solid var(--color-border)',
              borderRadius: 8,
            }}
          />
          <Line
            type='monotone'
            dataKey='y'
            stroke='var(--color-primary)'
            strokeWidth={2}
            dot={{ r: 3, fill: 'var(--color-primary)' }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default TrendLineChart;
