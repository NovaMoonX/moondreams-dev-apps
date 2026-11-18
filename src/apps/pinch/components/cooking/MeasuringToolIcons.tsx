import type { ReactElement, ReactNode } from 'react';

import type { MeasuringTool } from '@apps/pinch/utils/measuringTools';

interface IconProps {
  className?: string;
}

const Frame = ({
  className = 'size-6',
  children,
}: IconProps & { children: ReactNode }) => (
  <svg
    viewBox='0 0 24 24'
    aria-hidden='true'
    fill='none'
    stroke='currentColor'
    strokeWidth={1.5}
    strokeLinecap='round'
    strokeLinejoin='round'
    className={className}
  >
    {children}
  </svg>
);

function KitchenScaleIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d='M19 15v3.889C19 21.114 18.264 22 15.889 22H8.11C5.886 22 5 21.264 5 18.889V15a7 7 0 1 1 14 0Z' />
      <path d='M16 15a4 4 0 0 0-8 0m4 2l1-2m3.312-10H7.688c-.884 0-1.326 0-1.715-.152a2 2 0 0 1-.368-.187c-.35-.22-.595-.568-1.085-1.263c-.382-.541-.573-.812-.507-1.033a.5.5 0 0 1 .107-.19C4.28 2 4.624 2 5.313 2h13.376c.689 0 1.033 0 1.192.175q.075.084.107.19c.066.221-.125.492-.507 1.033c-.49.695-.735 1.042-1.085 1.263a2 2 0 0 1-.368.187C17.637 5 17.196 5 16.312 5ZM14 8V5m-4 3V5' />
    </Frame>
  );
}

function LiquidCupIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d='M4.5 15V7c0-1.886 0-2.828.59-3.414S6.63 3 8.53 3h8.453c.28 0 .42 0 .554.018c.346.046.674.181.953.392c.107.081.206.18.404.376c.281.279.422.419.494.557c.19.366.135.81-.139 1.118c-.103.118-.274.22-.615.423l-.263.156c-.275.164-.413.246-.514.358a1 1 0 0 0-.214.375c-.045.143-.045.302-.045.62V15c0 2.828 0 4.243-.885 5.121s-2.31.879-5.16.879h-1.008c-2.85 0-4.274 0-5.16-.879C4.5 19.243 4.5 17.828 4.5 15m0-1h13' />
      <path d='M5 10.5h2M5 7h2' strokeLinejoin='miter' />
    </Frame>
  );
}

function DryCupsIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d='M2.75 9h11.5v4.5a5.75 5.75 0 0 1-11.5 0Z' />
      <path d='M14.25 10h6.5a1.25 1.25 0 0 1 0 2.5h-6.5' />
      <path d='M5.5 12.5h1.5' />
    </Frame>
  );
}

function SpoonsIcon({ className }: IconProps) {
  return (
    <Frame className={className}>
      <path d='M21.105 2.895c-1.715-1.716-5.447-.765-7.377 1.165c-1.04 1.04-1.345 2.152-1.136 3.226c.21 1.08.19 2.299-.613 3.052L2.503 19.24a1.597 1.597 0 1 0 2.257 2.257l8.902-9.476c.753-.802 1.972-.823 3.052-.613c1.074.209 2.186-.095 3.226-1.136c1.93-1.93 2.88-5.661 1.165-7.377Z' />
    </Frame>
  );
}

const ICONS: Record<MeasuringTool['key'], (props: IconProps) => ReactElement> =
  {
    SCALE: KitchenScaleIcon,
    LIQUID_CUP: LiquidCupIcon,
    DRY_CUPS: DryCupsIcon,
    SPOONS: SpoonsIcon,
  };

/** The line drawing of a measuring tool: a kitchen scale, a liquid cup, dry cups or spoons. */
export default function MeasuringToolIcon({
  tool,
  className,
}: IconProps & { tool: MeasuringTool['key'] }) {
  const Icon = ICONS[tool];
  return <Icon className={className} />;
}
