import { RotateCcw } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import { HELM_COPY } from '@apps/helm/constants';
import type { MapColours } from '@apps/helm/utils/circleMapStyle';

interface CircleMapLegendProps {
  isOpen: boolean;
  onClose: () => void;
  onReset: () => void;
  colours: MapColours;
}

interface Sample {
  label: string;
  dash: string | null;
  isDouble?: boolean;
  opacity: number;
  stroke: keyof MapColours;
}

const SAMPLES: Sample[] = [
  {
    label: HELM_COPY.mapLegendFamily,
    dash: null,
    opacity: 0.85,
    stroke: 'foreground',
  },
  {
    label: HELM_COPY.mapLegendCouple,
    dash: null,
    isDouble: true,
    opacity: 0.85,
    stroke: 'primary',
  },
  {
    label: HELM_COPY.mapLegendFriend,
    dash: '2 4',
    opacity: 0.85,
    stroke: 'mutedForeground',
  },
  {
    label: HELM_COPY.mapLegendWork,
    dash: '8 5',
    opacity: 0.85,
    stroke: 'mutedForeground',
  },
  {
    label: HELM_COPY.mapLegendFigured,
    dash: null,
    opacity: 0.4,
    stroke: 'foreground',
  },
  {
    label: HELM_COPY.mapLegendPast,
    dash: null,
    isDouble: true,
    opacity: 0.25,
    stroke: 'primary',
  },
];

function LineSample({
  sample,
  colours,
}: {
  sample: Sample;
  colours: MapColours;
}) {
  const stroke = colours[sample.stroke];
  return (
    <svg width='56' height='12' aria-hidden='true' className='shrink-0'>
      {sample.isDouble ? (
        <>
          <line
            x1='2'
            x2='54'
            y1='3.5'
            y2='3.5'
            stroke={stroke}
            strokeWidth='1.5'
            opacity={sample.opacity}
          />
          <line
            x1='2'
            x2='54'
            y1='8.5'
            y2='8.5'
            stroke={stroke}
            strokeWidth='1.5'
            opacity={sample.opacity}
          />
        </>
      ) : (
        <line
          x1='2'
          x2='54'
          y1='6'
          y2='6'
          stroke={stroke}
          strokeWidth={sample.dash === '2 4' ? 2 : 1.5}
          strokeLinecap={sample.dash === '2 4' ? 'round' : 'butt'}
          strokeDasharray={sample.dash ?? undefined}
          opacity={sample.opacity}
        />
      )}
    </svg>
  );
}

/** What each line on the map means, and the one place the layout is put back. */
function CircleMapLegend({
  isOpen,
  onClose,
  onReset,
  colours,
}: CircleMapLegendProps) {
  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={onClose}
      title={HELM_COPY.mapLegendTitle}
    >
      <div className='space-y-4 pb-2'>
        <ul className='space-y-3'>
          {SAMPLES.map((sample) => (
            <li key={sample.label} className='flex items-center gap-3'>
              <LineSample sample={sample} colours={colours} />
              <span className='text-foreground text-[15px]'>
                {sample.label}
              </span>
            </li>
          ))}
        </ul>
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.mapLegendFiguredLine} {HELM_COPY.mapLegendPastLine}
        </p>
        <p className='text-muted-foreground text-[13px] text-pretty'>
          {HELM_COPY.mapLegendMoveLine}
        </p>
        <ActionGroup>
          <ActionRow
            isGrouped
            icon={<RotateCcw className='size-4' aria-hidden='true' />}
            label={HELM_COPY.mapResetLayout}
            subtitle={HELM_COPY.mapResetLayoutLine}
            onClick={onReset}
          />
        </ActionGroup>
      </div>
    </DetailSheet>
  );
}

export default CircleMapLegend;
