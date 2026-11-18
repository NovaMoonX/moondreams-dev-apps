import { Button } from '@moondreamsdev/dreamer-ui/components';

import { HELM_COPY } from '@apps/helm/constants';
import type { RestDayKind } from '@apps/helm/engine/restDay';

interface RestDayLineProps {
  kind: RestDayKind;
  assistantName: string;
  /** "today", "tomorrow" or a weekday, for the middle of the sentence. */
  dayName: string;
  isPlanning: boolean;
  /** Null until the day can be planned. */
  onPlanAnyway: (() => void) | null;
}

/** The day after a night shift or a late night: nothing is planned, and one small button plans it anyway. */
function RestDayLine({
  kind,
  assistantName,
  dayName,
  isPlanning,
  onPlanAnyway,
}: RestDayLineProps) {
  return (
    <div className='helm-card bg-muted/50 flex flex-col items-start gap-3 p-4'>
      <p className='text-muted-foreground text-[15px] text-pretty'>
        {kind === 'shift'
          ? HELM_COPY.planRestShift(assistantName, dayName)
          : HELM_COPY.planRestLate(assistantName, dayName)}
      </p>
      {onPlanAnyway && (
        <Button
          type='button'
          variant='secondary'
          size='sm'
          loading={isPlanning}
          className="relative after:absolute after:-inset-x-2 after:-inset-y-1.5 after:content-['']"
          onClick={onPlanAnyway}
        >
          {HELM_COPY.planRestAnyway}
        </Button>
      )}
    </div>
  );
}

export default RestDayLine;
