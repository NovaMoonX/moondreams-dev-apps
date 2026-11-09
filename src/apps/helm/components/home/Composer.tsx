import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from 'react';

import { Button, Textarea } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { ArrowUp } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { CAPTURE_MAX_CHARS, HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { getNextTurn } from '@apps/helm/hooks/useSession';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { sendCapture } from '@apps/helm/store/actions/captureActions';

interface ComposerProps {
  /** Lets the dock's Type and Talk put the cursor here. */
  fieldRef: Ref<HTMLTextAreaElement>;
  onFocusChange: (isFocused: boolean) => void;
}

/** The text field at the foot of home's conversation. Send keeps the turn sealed; Enter sends and Shift+Enter starts a new line. */
function Composer({ fieldRef, onFocusChange }: ComposerProps) {
  const name = useAssistantName();
  const { user } = useAuth();
  const { addToast } = useToast();
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const stopKeepingInView = useRef<(() => void) | null>(null);

  // A field removed while focused gets no blur, so leaving home mid-typing must hand the dock back too.
  useEffect(
    () => () => {
      stopKeepingInView.current?.();
      onFocusChange(false);
    },
    [onFocusChange],
  );

  const canSend = text.trim().length > 0 && !isSending && user !== null;

  const send = async () => {
    if (!canSend || !user) return;
    const { uid } = user;
    setIsSending(true);
    try {
      const encryption = await getHelmEncryption(uid);
      await sendCapture(uid, encryption, { text, ...getNextTurn() });
      setText('');
    } catch (error) {
      console.error('Helm turn did not send', error);
      addToast({ title: HELM_COPY.sendFailed, type: 'error' });
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.nativeEvent.isComposing
    )
      return;
    event.preventDefault();
    void send();
  };

  return (
    <div className='space-y-2'>
      <Textarea
        ref={fieldRef}
        variant='outline'
        rows={2}
        maxLength={CAPTURE_MAX_CHARS}
        aria-label={HELM_COPY.composerLabel(name)}
        placeholder={HELM_COPY.composerPlaceholder(name)}
        className='helm-field'
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(event) => {
          onFocusChange(true);
          // The keyboard shrinks the viewport after focus lands, so the field is brought back into view each time it does.
          const field = event.currentTarget;
          const keepInView = () => field.scrollIntoView({ block: 'nearest' });
          stopKeepingInView.current?.();
          window.visualViewport?.addEventListener('resize', keepInView);
          stopKeepingInView.current = () =>
            window.visualViewport?.removeEventListener('resize', keepInView);
        }}
        onBlur={() => {
          stopKeepingInView.current?.();
          stopKeepingInView.current = null;
          onFocusChange(false);
        }}
      />
      <div className='flex items-center justify-between gap-3'>
        <span className='text-muted-foreground text-[13px] tabular-nums'>
          {text.length.toLocaleString()} / {CAPTURE_MAX_CHARS.toLocaleString()}
        </span>
        <Button
          type='button'
          size='sm'
          rounded='full'
          disabled={!canSend}
          onClick={() => void send()}
        >
          <ArrowUp className='size-4' aria-hidden='true' />
          {HELM_COPY.send}
        </Button>
      </div>
    </div>
  );
}

export default Composer;
