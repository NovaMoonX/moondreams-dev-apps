import { useState, type KeyboardEvent, type Ref } from 'react';

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
}

/** The text field at the foot of home's conversation. Send keeps the turn sealed; Enter sends and Shift+Enter starts a new line. */
function Composer({ fieldRef }: ComposerProps) {
  const name = useAssistantName();
  const { user } = useAuth();
  const { addToast } = useToast();
  const [text, setText] = useState('');
  const [isSending, setIsSending] = useState(false);

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
        className='bg-card'
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
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
