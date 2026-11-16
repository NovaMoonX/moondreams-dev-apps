import { Button } from '@moondreamsdev/dreamer-ui/components';

import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface WhyTidyOfferProps {
  tidied: string;
  isBusy: boolean;
  onKeep: () => void;
  onUse: () => void;
}

/** A suggestion, so it is dashed in verdigris until the person picks: their words stay either way. */
function WhyTidyOffer({ tidied, isBusy, onKeep, onUse }: WhyTidyOfferProps) {
  const assistantName = useAssistantName();

  return (
    <div className='helm-card space-y-3 border-dashed! border-[var(--helm-verdigris)]! p-4'>
      <div className='flex items-center gap-3'>
        <AssistantMark name={assistantName} />
        <p className='text-foreground text-[15px] font-medium'>
          {HELM_COPY.goalTidyTitle}
        </p>
      </div>
      <blockquote className='bg-card border-border rounded-[10px] border p-3 text-[15px] break-words'>
        {tidied}
      </blockquote>
      <p className='text-muted-foreground text-[13px] text-pretty'>
        {HELM_COPY.goalTidyNote}
      </p>
      <div className='flex items-center justify-between gap-3'>
        <Button
          type='button'
          variant='tertiary'
          disabled={isBusy}
          onClick={onKeep}
        >
          {HELM_COPY.goalTidyKeep}
        </Button>
        <Button
          type='button'
          variant='secondary'
          size='sm'
          disabled={isBusy}
          onClick={onUse}
        >
          {HELM_COPY.goalTidyUse}
        </Button>
      </div>
    </div>
  );
}

export default WhyTidyOffer;
