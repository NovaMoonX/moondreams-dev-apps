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
import { useFormDraft, useKeepFormDraft } from '@/hooks/useFormDraft';
import { readFormDraft, writeFormDraft } from '@lib/app/formDrafts';
import { join } from '@moondreamsdev/dreamer-ui/utils';

import {
  CAPTURE_COUNTER_FROM,
  CAPTURE_MAX_CHARS,
  HELM_COPY,
} from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { getNextTurn, recordSentTurn } from '@apps/helm/hooks/useSession';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { useAppSelector } from '@/store';
import { HELM_DRAFT_PREFIX } from '@apps/helm/security';
import { sendCapture } from '@apps/helm/store/actions/captureActions';

const DRAFT_KEY = `${HELM_DRAFT_PREFIX}composer`;

const parseDraft = (stored: unknown) =>
  typeof stored === 'string' && stored.length > 0 ? stored : null;

interface ComposerProps {
  /** Lets the dock's Type and Talk put the cursor here. */
  fieldRef: Ref<HTMLTextAreaElement>;
  onFocusChange: (isFocused: boolean) => void;
  /** Without the data key nothing typed could be kept sealed, so the field waits; it remounts once the key is here, starting from the kept draft. */
  isReady: boolean;
  /** Says why the field waits when the key can't come yet (offline, or refused). */
  waitingPlaceholder: string | null;
}

/** The text field at the foot of home's conversation. Send keeps the turn sealed; Enter sends and Shift+Enter starts a new line. */
function Composer({
  fieldRef,
  onFocusChange,
  isReady,
  waitingPlaceholder,
}: ComposerProps) {
  const name = useAssistantName();
  const { user } = useAuth();
  const { addToast } = useToast();
  const { restored } = useFormDraft({
    key: isReady ? DRAFT_KEY : null,
    base: null,
    parse: parseDraft,
  });
  const [text, setText] = useState(restored ?? '');
  // Kept on unmount too: leaving home for another view, or the phone closing the page, finds the words still here.
  useKeepFormDraft({
    key: isReady ? DRAFT_KEY : null,
    base: null,
    isRestored: restored !== null,
    value: text,
    isDirty: text.length > 0,
    keepOnUnmount: true,
  });
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

  // Before the first snapshot the open session isn't known, so a turn sent then would start a new one.
  const isCapturesLoaded = useAppSelector(
    (state) => state.helm.recentCaptures.isLoaded,
  );
  const canSend =
    isReady &&
    text.trim().length > 0 &&
    !isSending &&
    isCapturesLoaded &&
    user !== null;
  const isNearLimit = text.length >= CAPTURE_COUNTER_FROM;

  const send = async () => {
    if (!canSend || !user) return;
    const { uid } = user;
    const sent = text;
    const turn = { ...getNextTurn(), createdAt: Date.now() };
    const restore = (error: unknown) => {
      console.error('Helm turn did not send', error);
      const withSent = (current: string) =>
        current ? `${current}\n${sent}` : sent;
      // The field may have unmounted since Send, so the words go back into the kept draft directly.
      const kept = parseDraft(readFormDraft(uid, DRAFT_KEY, null)) ?? '';
      writeFormDraft(uid, DRAFT_KEY, null, withSent(kept));
      setText(withSent);
      addToast({ title: HELM_COPY.sendFailed, type: 'error' });
    };
    setIsSending(true);
    try {
      const encryption = await getHelmEncryption(uid);
      // The write is not awaited: offline it waits in the queue, and the field is free for the next line.
      const { write } = await sendCapture(uid, encryption, {
        text: sent,
        ...turn,
      });
      recordSentTurn(uid, turn);
      setText('');
      write.catch(restore);
    } catch (error) {
      restore(error);
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
    <div data-composer className='space-y-2'>
      <Textarea
        ref={fieldRef}
        variant='outline'
        rows={2}
        maxLength={CAPTURE_MAX_CHARS}
        aria-label={HELM_COPY.composerLabel(name)}
        placeholder={waitingPlaceholder ?? HELM_COPY.composerPlaceholder(name)}
        className='helm-field'
        disabled={!isReady}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(event) => {
          onFocusChange(true);
          // The keyboard shrinks the viewport after focus lands, so the field and its Send row are brought back into view each time it does.
          const block = event.currentTarget.closest('[data-composer]');
          const keepInView = () => block?.scrollIntoView({ block: 'nearest' });
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
      {waitingPlaceholder === null && (
        <div className='flex items-center justify-between gap-3'>
          <span
            className={join(
              'text-[13px] tabular-nums',
              text.length >= CAPTURE_MAX_CHARS
                ? 'text-destructive'
                : 'text-muted-foreground',
            )}
            aria-live='polite'
          >
            {isNearLimit &&
              `${text.length.toLocaleString()} / ${CAPTURE_MAX_CHARS.toLocaleString()}`}
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
      )}
    </div>
  );
}

export default Composer;
