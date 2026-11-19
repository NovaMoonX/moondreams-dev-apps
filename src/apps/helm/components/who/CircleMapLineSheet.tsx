import { Pencil } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import DetailSheet from '@/components/DetailSheet';
import { HELM_COPY } from '@apps/helm/constants';
import type { MapLine } from '@apps/helm/utils/circleMap';

interface CircleMapLineSheetProps {
  line: MapLine | null;
  /** Null when the line has nothing to change. */
  onChange: (() => void) | null;
  onClose: () => void;
}

/** A tapped line: what it means and the date or reason that goes with it, with the way to change it behind. */
function CircleMapLineSheet({
  line,
  onChange,
  onClose,
}: CircleMapLineSheetProps) {
  return (
    <DetailSheet
      isOpen={line !== null}
      onClose={onClose}
      title={HELM_COPY.mapLineTitle}
    >
      <div className='space-y-4 pb-2'>
        {line && (
          <div className='space-y-1 text-[15px] text-pretty'>
            <p className='text-foreground'>{line.sentence}</p>
            {line.note && <p className='text-muted-foreground'>{line.note}</p>}
          </div>
        )}
        {line && onChange && (
          <ActionGroup>
            <ActionRow
              isGrouped
              hasChevron
              icon={<Pencil className='size-4' aria-hidden='true' />}
              label={
                line.isGuess
                  ? HELM_COPY.mapLineFiguredChange
                  : HELM_COPY.mapLineChange
              }
              subtitle={
                line.isGuess
                  ? HELM_COPY.mapLineFiguredChangeLine
                  : HELM_COPY.mapLineChangeLine
              }
              onClick={onChange}
            />
          </ActionGroup>
        )}
      </div>
    </DetailSheet>
  );
}

export default CircleMapLineSheet;
