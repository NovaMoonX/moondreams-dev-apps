import { useLayoutEffect, useRef } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Keyboard, LayoutGrid, X } from 'lucide-react';

import VoiceControl from '@apps/helm/components/voice/VoiceControl';
import VoiceStatus from '@apps/helm/components/voice/VoiceStatus';
import { HELM_COPY } from '@apps/helm/constants';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';

interface VoiceDockProps {
  onBrowse: () => void;
  /** Talking isn't possible (no recognition or no microphone): the person types. */
  onTalkBlocked: () => void;
  onType: () => void;
}

const SIDE_BUTTON =
  "relative size-12 min-w-12 rounded-full! p-0 before:absolute before:-inset-1 before:content-['']";

/** Home's dock: Browse, Talk and Type, fixed at the foot on a fade from the page colour. It is on home only. */
function VoiceDock({ onBrowse, onTalkBlocked, onType }: VoiceDockProps) {
  const voice = useHelmVoiceContext();
  const isListening = voice.state === 'listening';
  const nav = useRef<HTMLElement>(null);

  // The composer floats this far above the foot of the screen; with the dock gone it drops to the edge.
  useLayoutEffect(() => {
    const element = nav.current;
    if (!element) return;
    const root = document.documentElement;
    const publish = () =>
      root.style.setProperty(
        '--helm-dock-top',
        `${element.offsetHeight - parseFloat(getComputedStyle(element).paddingTop)}px`,
      );
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    publish();
    return () => {
      observer.disconnect();
      root.style.removeProperty('--helm-dock-top');
    };
  }, []);

  return (
    <nav
      ref={nav}
      aria-label='Talk, type or browse'
      className='helm-dock-in from-background via-background/95 pointer-events-none fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t to-transparent px-4 pt-10 pb-[max(1rem,env(safe-area-inset-bottom))]'
    >
      <div className='pointer-events-auto mx-auto flex max-w-xl flex-col gap-4'>
        <VoiceStatus />
        <div className='flex items-end justify-center gap-7'>
          <div className='flex w-14 flex-col items-center gap-1'>
            <Button
              type='button'
              variant='secondary'
              aria-label={isListening ? HELM_COPY.talkCancel : 'Browse'}
              className={SIDE_BUTTON}
              onClick={isListening ? voice.cancel : onBrowse}
            >
              {isListening ? (
                <X className='size-5' aria-hidden='true' />
              ) : (
                <LayoutGrid className='size-5' aria-hidden='true' />
              )}
            </Button>
            <span className='text-muted-foreground text-[13px]'>
              {isListening ? HELM_COPY.talkCancel : 'Browse'}
            </span>
          </div>
          <VoiceControl onBlocked={onTalkBlocked} />
          <div className='flex w-14 flex-col items-center gap-1'>
            <Button
              type='button'
              variant='secondary'
              aria-label='Type'
              className={SIDE_BUTTON}
              onClick={onType}
            >
              <Keyboard className='size-5' aria-hidden='true' />
            </Button>
            <span className='text-muted-foreground text-[13px]'>Type</span>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default VoiceDock;
