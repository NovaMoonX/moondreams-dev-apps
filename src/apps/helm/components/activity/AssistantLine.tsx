import type { ReactNode } from 'react';

import { join } from '@moondreamsdev/dreamer-ui/utils';

import WorkingDots from '@/components/WorkingDots';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';

interface AssistantLineProps {
  children: ReactNode;
  /** A state the assistant is in ("Reading"), drawn quieter than its words. */
  isQuiet?: boolean;
  isWorking?: boolean;
}

/** The assistant's words beside its mark. */
function AssistantLine({
  children,
  isQuiet = false,
  isWorking = false,
}: AssistantLineProps) {
  const name = useAssistantName();
  return (
    <div className='flex max-w-full items-start gap-2'>
      <AssistantMark name={name} className='mt-px' />
      <p
        className={join(
          'min-w-0 text-[15px] leading-[21px] break-words',
          isQuiet && 'text-muted-foreground',
        )}
      >
        {children}
        {isWorking && <WorkingDots />}
      </p>
    </div>
  );
}

export default AssistantLine;
