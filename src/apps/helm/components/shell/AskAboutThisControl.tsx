import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Keyboard, Mic } from 'lucide-react';

import { useAppSelector } from '@/store';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import {
  selectTopScreen,
  type ScreenPlacement,
} from '@apps/helm/store/screenSlice';

const ICON_BUTTON = 'size-10 min-h-0 min-w-10 shrink-0 rounded-full! p-0!';

interface AskAboutThisControlProps {
  /** Where this copy is drawn: at the page's foot, or at the foot of a sheet open over it. Only the one that matches the page in front shows. */
  placement: ScreenPlacement;
}

/** The ask bar: the assistant's mark and "Ask about …", then a mic that opens the conversation and starts listening and a keyboard that opens it with the field focused. Content pages publish what they show and the shell draws this once; a sheet that covers the foot draws its own, and never both. */
function AskAboutThisControl({ placement }: AskAboutThisControlProps) {
  const entry = useAppSelector(selectTopScreen);
  const name = useAssistantName();
  const { openAsk } = useHelmUrlState();
  const voice = useHelmVoiceContext();

  if (!entry || entry.placement !== placement) return null;

  const row = (
    <div className='helm-card flex h-12 w-full items-center gap-1 pr-1.5'>
      <Button
        type='button'
        variant='tertiary'
        className='h-full min-w-0 flex-1 justify-start gap-2 px-3 text-left'
        onClick={() => void openAsk()}
      >
        <AssistantMark name={name} />
        <span className='min-w-0 truncate text-[15px]'>{entry.labels.ask}</span>
      </Button>
      <Button
        type='button'
        variant='tertiary'
        aria-label={HELM_COPY.talkByVoice}
        className={ICON_BUTTON}
        onClick={() => {
          if (voice.talk(entry.context) !== 'stopped') void openAsk();
        }}
      >
        <Mic className='size-5' aria-hidden='true' />
      </Button>
      <Button
        type='button'
        variant='tertiary'
        aria-label={HELM_COPY.talkByTyping}
        className={ICON_BUTTON}
        onClick={() => void openAsk()}
      >
        <Keyboard className='size-5' aria-hidden='true' />
      </Button>
    </div>
  );

  if (placement === 'sheet') {
    return (
      <div className='border-border border-t px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'>
        {row}
      </div>
    );
  }
  return (
    <div className='bg-background border-border fixed inset-x-0 bottom-0 z-20 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]'>
      <div className='mx-auto max-w-xl'>{row}</div>
    </div>
  );
}

export default AskAboutThisControl;
