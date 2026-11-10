import { Button } from '@moondreamsdev/dreamer-ui/components';
import { ChevronRight } from 'lucide-react';

import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import { HELM_COPY } from '@apps/helm/constants';

interface SuggestedCardProps {
  title: string;
  /** The time and why, as the plan sealed them. */
  detail: string | null;
  assistantName: string;
  onOpen: () => void;
}

/** A suggested task: dashed in verdigris until it is kept, opening its sheet. */
function SuggestedCard({
  title,
  detail,
  assistantName,
  onOpen,
}: SuggestedCardProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      className='helm-card flex h-auto min-h-14 w-full items-center justify-start gap-3 border-dashed! border-[var(--helm-verdigris)]! px-4 py-3 text-left'
      onClick={onOpen}
    >
      <AssistantMark name={assistantName} />
      <span className='min-w-0 flex-1'>
        <span className='text-foreground block text-[15px] leading-[21px] break-words'>
          {title}
        </span>
        <span className='text-muted-foreground block text-[13px] break-words'>
          {[detail, HELM_COPY.planSuggestedMark]
            .filter((part): part is string => !!part)
            .join(' · ')}
        </span>
      </span>
      <ChevronRight
        className='text-muted-foreground size-4 shrink-0'
        aria-hidden='true'
      />
    </Button>
  );
}

export default SuggestedCard;
