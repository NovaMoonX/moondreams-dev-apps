import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceArea,
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
  /** Faint vertical guides, such as where the past ends; a label sits at the top or bottom of its line. */
  dividers?: { x: number; label: string; labelAt?: 'top' | 'bottom' }[];
  /** A faintly shaded stretch of the x-axis with its own label. */
  band?: { x1: number; x2: number; label: string };
  /** A small dot on the line with a callout and arrow, always visible, such as where it crosses a guide. */
  markers?: ChartMarker[];
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

export interface ChartMarker {
  x: number;
  y: number;
  label: string;
  /** Which side of the dot the callout prefers; it flips when that side has no room. */
  prefer?: 'above' | 'below';
  /** A hollow dot, to tell a second marker from the first. */
  isHollow?: boolean;
}

const CALLOUT_HEIGHT = 22;
const CALLOUT_ARROW = 6;

/** A small dot with a label and an arrow pointing at it, kept inside the plot. A rising line leaves the up-left and down-right of any point clear, so the callout goes to one of those. */
function MarkerCallout({
  cx,
  cy,
  label,
  prefer = 'above',
  isHollow = false,
}: {
  cx?: number;
  cy?: number;
  label: string;
  prefer?: 'above' | 'below';
  isHollow?: boolean;
}) {
  const plot = usePlotArea();
  if (cx === undefined || cy === undefined) return null;

  const left = (plot?.x ?? 0) + 2;
  const right = (plot?.x ?? 0) + (plot?.width ?? 0) - 2;
  const top = plot?.y ?? 0;
  const bottom = top + (plot?.height ?? 0) + 18;
  const width = label.length * 6 + 20;
  const options = [
    {
      side: 'above',
      boxX: cx - width + 16,
      boxY: cy - CALLOUT_ARROW - 4 - CALLOUT_HEIGHT,
    },
    { side: 'below', boxX: cx - 16, boxY: cy + CALLOUT_ARROW + 4 },
  ] as const;
  const ordered = prefer === 'above' ? options : [options[1], options[0]];
  const fits = (option: (typeof options)[number]) =>
    option.boxX >= left &&
    option.boxX + width <= right &&
    option.boxY >= top &&
    option.boxY + CALLOUT_HEIGHT <= bottom;
  // Neither side fits cleanly (a dot near an edge): up-left, where a rising line is lowest.
  const pick = ordered.find(fits) ?? options[0];
  const boxX = Math.max(left, Math.min(pick.boxX, right - width));
  const boxY = Math.max(top, pick.boxY);
  const isAbove = pick.side === 'above';
  const arrowX = Math.max(boxX + 10, Math.min(cx, boxX + width - 10));
  const baseY = isAbove ? boxY + CALLOUT_HEIGHT : boxY;
  const tipY = isAbove ? baseY + CALLOUT_ARROW : baseY - CALLOUT_ARROW;
  const seamY = isAbove ? baseY - 2 : baseY - 0.5;
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
        d={`M${arrowX - 5},${baseY + (isAbove ? -0.5 : 0.5)} L${arrowX},${tipY} L${arrowX + 5},${baseY + (isAbove ? -0.5 : 0.5)} Z`}
        fill='var(--color-popover)'
        stroke='var(--color-border)'
        strokeLinejoin='round'
      />
      <rect
        x={arrowX - 5.5}
        y={seamY}
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
        fill={isHollow ? 'var(--color-popover)' : 'var(--color-primary)'}
        stroke={isHollow ? 'var(--color-primary)' : 'var(--color-popover)'}
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
  markers,
  dividers,
  band,
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
            width={isSoft ? 56 : 48}
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
          {band && (
            <ReferenceArea
              x1={band.x1}
              x2={band.x2}
              fill='var(--color-primary)'
              fillOpacity={0.06}
              stroke='none'
              label={{
                value: band.label,
                position: 'insideTop',
                fill: 'var(--color-muted-foreground)',
                fontSize: 10,
              }}
            />
          )}
          {dividers?.map((divider) => (
            <ReferenceLine
              key={divider.x}
              x={divider.x}
              stroke='var(--color-muted-foreground)'
              strokeOpacity={0.35}
              strokeWidth={1}
              label={{
                value: divider.label,
                position:
                  divider.labelAt === 'bottom'
                    ? 'insideBottomRight'
                    : 'insideTopLeft',
                fill: 'var(--color-muted-foreground)',
                fontSize: 10,
              }}
            />
          ))}
          {markers?.map((marker) => (
            <ReferenceDot
              key={marker.label}
              x={marker.x}
              y={marker.y}
              shape={
                <MarkerCallout
                  label={marker.label}
                  prefer={marker.prefer}
                  isHollow={marker.isHollow}
                />
              }
            />
          ))}
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
