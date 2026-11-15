import type { ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Volume2 } from 'lucide-react';

import WorkingRing from '@/components/WorkingRing';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';

interface AssistantLineProps {
  children: ReactNode;
  /** A state the assistant is in ("Reading"), drawn quieter than its words. */
  isQuiet?: boolean;
  isWorking?: boolean;
  /** The words to say again when the speaker is tapped; none draws no speaker. */
  speakText?: string;
}

function PlayAgainButton({ text }: { text: string }) {
  const voice = useHelmVoiceContext();
  return (
    <Button
      type='button'
      variant='tertiary'
      size='sm'
      aria-label={HELM_COPY.playAgain}
      className='text-muted-foreground relative -my-1 shrink-0 before:absolute before:-inset-2 before:content-[""]'
      onClick={() =>
        void voice.speak(text, { priority: 'reply', turnKey: Date.now() })
      }
    >
      <Volume2 className='size-4' aria-hidden='true' />
    </Button>
  );
}

/** The assistant's words beside its mark. */
function AssistantLine({
  children,
  isQuiet = false,
  isWorking = false,
  speakText,
}: AssistantLineProps) {
  const name = useAssistantName();
  return (
    <div className='flex max-w-full items-start gap-2'>
      <WorkingRing isWorking={isWorking} className='text-primary mt-px'>
        <AssistantMark name={name} />
      </WorkingRing>
      <p
        className={join(
          'min-w-0 text-[15px] leading-[21px] break-words',
          isQuiet && 'text-muted-foreground',
        )}
      >
        {children}
      </p>
      {speakText && <PlayAgainButton text={speakText} />}
    </div>
  );
}

export default AssistantLine;
