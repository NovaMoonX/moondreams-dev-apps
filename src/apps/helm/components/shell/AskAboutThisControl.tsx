import { Button } from '@moondreamsdev/dreamer-ui/components';

import { useAppSelector } from '@/store';
import AssistantMark from '@apps/helm/components/activity/AssistantMark';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import {
  selectTopScreen,
  type ScreenPlacement,
} from '@apps/helm/store/screenSlice';

interface AskAboutThisControlProps {
  /** Where this copy is drawn: at the page's foot, or at the foot of a sheet open over it. Only the one that matches the page in front shows. */
  placement: ScreenPlacement;
}

/** The ask bar: the assistant's mark and "Ask about …". Content pages publish what they show and the shell draws this once; a sheet that covers the foot draws its own, and never both. */
function AskAboutThisControl({ placement }: AskAboutThisControlProps) {
  const entry = useAppSelector(selectTopScreen);
  const name = useAssistantName();
  const { openAsk } = useHelmUrlState();

  if (!entry || entry.placement !== placement) return null;

  const row = (
    <Button
      type='button'
      variant='tertiary'
      className='helm-card h-12 w-full min-w-0 justify-start gap-2 px-3 text-left'
      onClick={() => void openAsk()}
    >
      <AssistantMark name={name} />
      <span className='min-w-0 truncate text-[15px]'>{entry.labels.ask}</span>
    </Button>
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
