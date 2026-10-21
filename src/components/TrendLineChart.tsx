import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  usePlotArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface TrendPoint {
  x: number;
  y: number;
  /** A second line to compare against; drawn only when `secondaryLabel` is set. */
  y2?: number | null;
}

interface TrendLineChartProps {
  data: TrendPoint[];
  yLabel?: string;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  /** Full-precision text for the readout, when axis ticks are rounded; defaults to `formatY`. */
  formatValue?: (value: number) => string;
  emptyLabel?: string;
  /** Names the `y2` line, dashed and muted beside the main one. */
  secondaryLabel?: string;
  /** Fixes the y-axis so a changing series visibly moves instead of re-scaling to fit; `yTicks` are its labelled values. */
  yDomain?: [number, number];
  yTicks?: number[];
  /** A faint vertical guide, such as where the past ends. */
  divider?: { x: number; label: string };
  /** A small dot on the line with a callout and arrow, always visible, such as where it crosses a guide. */
  marker?: { x: number; y: number; label: string };
  /** A horizontal guide, such as break even at 0. */
  referenceY?: { value: number; label: string };
  /** Short names for the compact readout (it must fit a 320px plot); default to the full labels. */
  readoutLabels?: { main?: string; secondary?: string };
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

const CALLOUT_HEIGHT = 22;
const CALLOUT_ARROW = 6;

/** A small dot with a label above it and an arrow pointing down at the dot, kept inside the plot. */
function MarkerCallout({
  cx,
  cy,
  label,
}: {
  cx?: number;
  cy?: number;
  label: string;
}) {
  const plot = usePlotArea();
  if (cx === undefined || cy === undefined) return null;

  const width = label.length * 6 + 20;
  const minX = (plot?.x ?? 0) + 2;
  const maxX = (plot?.x ?? 0) + (plot?.width ?? width + 4) - width - 2;
  // The callout sits up and to the left of the dot, where a rising line leaves room, with the arrow near its right end.
  const boxX = Math.max(minX, Math.min(cx - width + 16, maxX));
  const boxY = cy - CALLOUT_ARROW - 4 - CALLOUT_HEIGHT;
  const arrowX = Math.max(boxX + 10, Math.min(cx, boxX + width - 10));
  return (
    <g pointerEvents='none'>
      <rect
        x={boxX}
        y={boxY}
        width={width}
        height={CALLOUT_HEIGHT}
        rx={CALLOUT_HEIGHT / 2}
        fill='var(--color-popover)'
        stroke='var(--color-border)'
      />
      <path
        d={`M${arrowX - 5},${boxY + CALLOUT_HEIGHT - 0.5} L${arrowX},${boxY + CALLOUT_HEIGHT + CALLOUT_ARROW} L${arrowX + 5},${boxY + CALLOUT_HEIGHT - 0.5} Z`}
        fill='var(--color-popover)'
        stroke='var(--color-border)'
        strokeLinejoin='round'
      />
      <rect
        x={arrowX - 5.5}
        y={boxY + CALLOUT_HEIGHT - 2}
        width={11}
        height={2.5}
        fill='var(--color-popover)'
      />
      <text
        x={boxX + width / 2}
        y={boxY + CALLOUT_HEIGHT / 2 + 4}
        textAnchor='middle'
        fontSize={11}
        fontWeight={500}
        fill='var(--color-popover-foreground)'
      >
        {label}
      </text>
      <circle
        cx={cx}
        cy={cy}
        r={4.5}
        fill='var(--color-primary)'
        stroke='var(--color-popover)'
        strokeWidth={2}
      />
    </g>
  );
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
  formatValue,
  emptyLabel = 'Not enough data yet to chart a trend.',
  secondaryLabel,
  referenceY,
  yDomain,
  yTicks,
  marker,
  divider,
  hasDots = true,
  seriesLabel,
  readoutLabels,
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

  const readoutText = formatValue ?? formatY;
  const renderReadout = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: readonly { dataKey?: unknown; value?: unknown }[];
    label?: unknown;
  }) => {
    if (!active || !payload?.length) return null;

    const main = payload.find((item) => item.dataKey === 'y');
    const other = payload.find((item) => item.dataKey === 'y2');
    return (
      <div className='border-border bg-popover text-popover-foreground rounded-full border px-2.5 py-1 text-[11px] whitespace-nowrap shadow-sm'>
        <span className='font-medium'>{formatX(Number(label))}</span>
        {main && (
          <span>
            {' '}
            · {readoutLabels?.main ?? seriesLabel ?? yLabel}{' '}
            {readoutText(Number(main.value))}
          </span>
        )}
        {other && other.value != null && secondaryLabel && (
          <span className='text-muted-foreground'>
            {' '}
            · {readoutLabels?.secondary ?? secondaryLabel}{' '}
            {readoutText(Number(other.value))}
          </span>
        )}
      </div>
    );
  };

  return (
    <div
      className={join(
        'w-full',
        isSoft && 'touch-pan-y touch-pinch-zoom',
        className,
      )}
    >
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
            domain={yDomain}
            ticks={yTicks}
            allowDataOverflow={yDomain !== undefined}
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
              readoutText(Number(value)),
              name === 'y2' ? secondaryLabel : (seriesLabel ?? yLabel ?? ''),
            ]}
            separator={isSoft ? ': ' : undefined}
            isAnimationActive={isSoft ? false : undefined}
            position={isSoft ? { y: 0 } : undefined}
            wrapperStyle={isSoft ? { maxWidth: '100%' } : undefined}
            cursor={
              isSoft
                ? {
                    stroke: 'var(--color-primary)',
                    strokeOpacity: 0.35,
                    strokeWidth: 2,
                    strokeLinecap: 'round',
                  }
                : undefined
            }
            content={isSoft ? renderReadout : undefined}
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
              strokeOpacity={isSoft ? 0.6 : 1}
              strokeWidth={1}
              strokeDasharray={isSoft ? undefined : '4 4'}
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
              stroke={
                isSoft
                  ? 'var(--color-foreground)'
                  : 'var(--color-muted-foreground)'
              }
              strokeOpacity={isSoft ? 0.85 : 1}
              strokeWidth={isSoft ? 3 : 2}
              strokeDasharray={isSoft ? '0.1 7' : '5 4'}
              strokeLinecap='round'
              isAnimationActive={!isSoft}
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
          {divider && (
            <ReferenceLine
              x={divider.x}
              stroke='var(--color-muted-foreground)'
              strokeOpacity={0.35}
              strokeWidth={1}
              label={{
                value: divider.label,
                position: 'insideTopLeft',
                fill: 'var(--color-muted-foreground)',
                fontSize: 10,
              }}
            />
          )}
          {marker && (
            <ReferenceDot
              x={marker.x}
              y={marker.y}
              shape={<MarkerCallout label={marker.label} />}
            />
          )}
          {isSoft && (
            <ReferenceDot
              x={last.x}
              y={last.y}
              r={6}
              fill='var(--color-primary)'
              stroke='var(--color-popover)'
              strokeWidth={3}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export default TrendLineChart;
