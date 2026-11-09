import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Keyboard, Mic } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { useAppDispatch, useAppSelector } from '@/store';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import { HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import { useLastInputMode } from '@apps/helm/hooks/useLastInputMode';
import {
  selectTopScreen,
  setAskMode,
  type InputMode,
  type ScreenPlacement,
} from '@apps/helm/store/screenSlice';

const ICON_BUTTON =
  "relative size-8 min-h-0 min-w-8 shrink-0 p-0 before:absolute before:-inset-1 before:content-['']";

interface AskAboutThisControlProps {
  /** Where this copy is drawn: at the page's foot, or at the foot of a sheet open over it. Only the one that matches the page in front shows. */
  placement: ScreenPlacement;
}

/** The ask bar: the assistant's mark, "Ask about …", a mic and a keyboard. Content pages publish what they show and the shell draws this once; a sheet that covers the foot draws its own, and never both. */
function AskAboutThisControl({ placement }: AskAboutThisControlProps) {
  const entry = useAppSelector(selectTopScreen);
  const name = useAssistantName();
  const { user } = useAuth();
  const dispatch = useAppDispatch();
  const { openAsk } = useHelmUrlState();
  const [lastMode] = useLastInputMode(user?.uid ?? null);

  if (!entry || entry.placement !== placement) return null;

  const ask = (mode: InputMode) => {
    dispatch(setAskMode(mode));
    void openAsk();
  };

  const row = (
    <div className='helm-card flex h-12 items-center gap-2 pr-2 pl-1'>
      <Button
        type='button'
        variant='tertiary'
        className='h-10 min-w-0 flex-1 justify-start gap-2 px-2 text-left'
        onClick={() => ask(lastMode)}
      >
        <AssistantMark name={name} />
        <span className='min-w-0 truncate text-[15px]'>{entry.labels.ask}</span>
      </Button>
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        aria-label={HELM_COPY.askByVoice}
        className={ICON_BUTTON}
        onClick={() => ask('voice')}
      >
        <Mic className='size-4' aria-hidden='true' />
      </Button>
      <Button
        type='button'
        variant='secondary'
        size='icon'
        rounded='full'
        aria-label={HELM_COPY.askByTyping}
        className={ICON_BUTTON}
        onClick={() => ask('typed')}
      >
        <Keyboard className='size-4' aria-hidden='true' />
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
