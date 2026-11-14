import { useEffect, useRef, useState } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { X } from 'lucide-react';

import Subview from '@/components/Subview';
import { useAppSelector } from '@/store';
import Composer from '@apps/helm/components/home/Composer';
import ConversationThread from '@apps/helm/components/home/ConversationThread';
import VoiceStatus from '@apps/helm/components/voice/VoiceStatus';
import { HELM_COPY } from '@apps/helm/constants';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';
import { useSession } from '@apps/helm/hooks/useSession';
import { HELM_DRAFT_PREFIX } from '@apps/helm/security';
import type { ScreenEntry } from '@apps/helm/store/screenSlice';
import type { ScreenContext } from '@apps/helm/types';

const ASK_DRAFT_KEY = `${HELM_DRAFT_PREFIX}ask`;
const noop = () => undefined;

interface AskConversationProps {
  entry: ScreenEntry;
  onClose: () => void;
}

/** Without the chip a turn names the page and nothing on it. */
const withoutPage = (context: ScreenContext): ScreenContext => ({
  view: context.view,
  focus: null,
  visible: [],
  topicId: null,
  procedureId: null,
  runId: null,
  v: 1,
});

/** The conversation over a content page: the open session's turns and a composer of its own, with a chip saying what the page tells the assistant. Removing the chip lasts until this closes. */
function AskConversation({ entry: liveEntry, onClose }: AskConversationProps) {
  // Held from the moment it opened: a sheet closing beneath it never changes what the conversation is about.
  const [entry] = useState(liveEntry);
  const { sessions, openSessionId } = useSession();
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const voice = useHelmVoiceContext();
  // Opened by the mic, the field stays unfocused so the keyboard doesn't cover the words being heard, or the notice a blocked tap shows.
  const [startsByVoice] = useState(
    () =>
      voice.state === 'listening' || voice.isStarting || voice.notice !== null,
  );
  const [isChipRemoved, setIsChipRemoved] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const chip = isChipRemoved ? HELM_COPY.chipAnything : entry.labels.chip;
  const screen = isChipRemoved ? withoutPage(entry.context) : entry.context;
  const openSession = sessions.filter(
    (session) => session.sessionId === openSessionId,
  );

  useEffect(() => {
    if (!startsByVoice) fieldRef.current?.focus();
  }, [startsByVoice]);

  return (
    <Subview
      overlay
      title={entry.labels.back}
      onClose={onClose}
      className='helm-ask-overlay'
    >
      <div className='flex flex-1 flex-col gap-4'>
        <ConversationThread
          sessions={openSession}
          openSessionId={openSessionId}
          scroll='container'
          loadsEarlier={false}
        />
        <div className='form-footer flex flex-col gap-3'>
          <VoiceStatus hasControls screen={screen} />
          <div
            className={
              voice.state === 'idle' || voice.isDictating ? undefined : 'hidden'
            }
          >
            <Composer
              fieldRef={fieldRef}
              onFocusChange={noop}
              isReady={keyStatus === 'ready'}
              waitingPlaceholder={null}
              screen={screen}
              draftKey={ASK_DRAFT_KEY}
              topSlot={
                <span className='bg-secondary text-secondary-foreground inline-flex h-8 max-w-full items-center gap-1 rounded-full pr-1 pl-3 text-[13px]'>
                  <span className='min-w-0 truncate'>{chip}</span>
                  {!isChipRemoved && (
                    <Button
                      type='button'
                      variant='tertiary'
                      size='icon'
                      rounded='full'
                      aria-label={HELM_COPY.chipRemove(chip)}
                      className="relative size-6 min-h-0 min-w-6 shrink-0 p-0 before:absolute before:-inset-2 before:content-['']"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => setIsChipRemoved(true)}
                    >
                      <X className='size-3.5' aria-hidden='true' />
                    </Button>
                  )}
                </span>
              }
            />
          </div>
        </div>
      </div>
    </Subview>
  );
}

export default AskConversation;
