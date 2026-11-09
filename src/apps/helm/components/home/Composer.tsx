import {
  useEffect,
  useMemo,
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
import { getDeviceTimeZone } from '@/utils/timezoneUtils';

import {
  CAPTURE_COUNTER_FROM,
  CAPTURE_MAX_CHARS,
  HELM_COPY,
} from '@apps/helm/constants';
import ReadChips from '@apps/helm/components/home/ReadChips';
import ShorthandRow from '@apps/helm/components/home/ShorthandRow';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmVoiceContext } from '@apps/helm/hooks/useHelmVoice';
import {
  clearSentTurn,
  getNextTurn,
  recordSentTurn,
} from '@apps/helm/hooks/useSession';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { store, useAppSelector } from '@/store';
import { HELM_DRAFT_PREFIX } from '@apps/helm/security';
import type { ScreenContext } from '@apps/helm/types';
import { sendCapture } from '@apps/helm/store/actions/captureActions';
import {
  applyReadingEdits,
  getReadingKey,
  readCapture,
  URGENT_KEY,
} from '@apps/helm/utils/captureReading';

const HOME_DRAFT_KEY = `${HELM_DRAFT_PREFIX}composer`;

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
  /** The page the words are asked from, stamped on the turn; null from home. */
  screen: ScreenContext | null;
  /** Where unsent words are kept; the conversation over a page keeps its own, apart from home's. */
  draftKey?: string;
}

/** The text field at the foot of home's conversation. Send keeps the turn sealed; Enter sends and Shift+Enter starts a new line. */
function Composer({
  fieldRef,
  onFocusChange,
  isReady,
  waitingPlaceholder,
  screen,
  draftKey = HOME_DRAFT_KEY,
}: ComposerProps) {
  const name = useAssistantName();
  const voice = useHelmVoiceContext();
  const { user } = useAuth();
  const { addToast } = useToast();
  const { restored } = useFormDraft({
    key: isReady ? draftKey : null,
    base: null,
    parse: parseDraft,
  });
  const [text, setText] = useState(restored ?? '');
  // Kept on unmount too: leaving home for another view, or the phone closing the page, finds the words still here.
  useKeepFormDraft({
    key: isReady ? draftKey : null,
    base: null,
    isRestored: restored !== null,
    value: text,
    isDirty: text.length > 0,
    keepOnUnmount: true,
  });
  const [isSending, setIsSending] = useState(false);
  // The clock the words are read against, taken when they last changed.
  const [typedAt, setTypedAt] = useState(() => Date.now());
  const [isFocused, setIsFocused] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [fixedDays, setFixedDays] = useState<Record<string, number>>({});
  const [lastDrop, setLastDrop] = useState<{
    key: string;
    label: string;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  // The reading is of the words as they will be sealed, so its offsets match the trimmed text.
  const read = useMemo(
    () =>
      readCapture(text.trimStart(), {
        now: typedAt,
        timeZone,
        assistantName: name,
      }),
    [text, typedAt, timeZone, name],
  );
  const reading = applyReadingEdits(read, {
    dismissed,
    days: fixedDays,
    timeZone,
  });
  const readKeys = [
    ...(['people', 'places', 'documents', 'dates'] as const).flatMap((kind) =>
      read[kind].map((token) => getReadingKey(kind, token.text)),
    ),
    ...(read.isUrgent ? [URGENT_KEY] : []),
  ];
  const shownDrop =
    lastDrop && readKeys.includes(lastDrop.key) ? lastDrop : null;
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
  const length = text.trim().length;
  const isTooLong = length > CAPTURE_MAX_CHARS;
  const canSend =
    isReady &&
    length > 0 &&
    !isSending &&
    isCapturesLoaded &&
    user !== null &&
    !isTooLong;
  const isNearLimit = length >= CAPTURE_COUNTER_FROM;

  const send = async () => {
    if (!canSend || !user) return;
    const { uid } = user;
    const sent = text;
    const turn = { ...getNextTurn(), createdAt: Date.now() };
    const sentDismissed = dismissed;
    const sentDays = fixedDays;
    const restore = (error: unknown) => {
      console.error('Helm turn did not send', error);
      const withSent = (current: string) =>
        current ? `${current}\n${sent}` : sent;
      // The field may have unmounted since Send, so the words go back into the kept draft directly.
      // After a switch to another account the sealer is theirs, so nothing is kept for this one.
      if (store.getState().helm.uid === uid) {
        const kept = parseDraft(readFormDraft(uid, draftKey, null)) ?? '';
        writeFormDraft(uid, draftKey, null, withSent(kept));
        setDismissed((current) =>
          Array.from(new Set([...current, ...sentDismissed])),
        );
        setFixedDays((current) => ({ ...sentDays, ...current }));
      }
      setText(withSent);
      addToast({ title: HELM_COPY.sendFailed, type: 'error' });
    };
    setIsSending(true);
    try {
      const encryption = await getHelmEncryption(uid);
      // The write is not awaited: offline it waits in the queue, and the field is free for the next line.
      // Read again at Send, so a line typed before midnight and sent after it means the day it is sent.
      const sentReading = applyReadingEdits(
        readCapture(sent.trimStart(), {
          now: turn.createdAt,
          timeZone,
          assistantName: name,
        }),
        { dismissed: sentDismissed, days: sentDays, timeZone },
      );
      const { write, id } = await sendCapture(uid, encryption, {
        text: sent,
        reading: sentReading,
        screen,
        ...turn,
      });
      recordSentTurn(uid, turn, id);
      setText('');
      setDismissed([]);
      setFixedDays({});
      setLastDrop(null);
      write.catch((error: unknown) => {
        clearSentTurn(uid, id);
        restore(error);
      });
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

  const insertShorthand = (insert: string) => {
    const field = root.current?.querySelector('textarea');
    if (!field) return;
    const from = field.selectionStart;
    const to = field.selectionEnd;
    const before = text.slice(0, from);
    const spacer = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
    const added = `${spacer}${insert}`;
    setText(`${before}${added}${text.slice(to)}`);
    setTypedAt(Date.now());
    const caret = before.length + added.length;
    requestAnimationFrame(() => field.setSelectionRange(caret, caret));
  };

  return (
    <div
      ref={root}
      data-composer
      className='space-y-2'
      // A press on any control here keeps the field focused: a blur would drop the shorthand row and move what was pressed before the tap lands.
      onPointerDown={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('button')) {
          event.preventDefault();
        }
      }}
    >
      {voice.notice !== null && (
        <p className='text-muted-foreground text-[13px]' role='status'>
          {voice.notice}
        </p>
      )}
      {isFocused && isReady && <ShorthandRow onInsert={insertShorthand} />}
      <Textarea
        ref={fieldRef}
        variant='outline'
        rows={2}
        aria-label={HELM_COPY.composerLabel(name)}
        placeholder={waitingPlaceholder ?? HELM_COPY.composerPlaceholder(name)}
        className='helm-field'
        disabled={!isReady}
        value={text}
        onChange={(event) => {
          if (voice.notice !== null) voice.clearNotice();
          setText(event.target.value);
          setTypedAt(Date.now());
        }}
        onKeyDown={handleKeyDown}
        onFocus={(event) => {
          onFocusChange(true);
          setIsFocused(true);
          // The keyboard shrinks the viewport after focus lands, so the field and its Send row are brought back into view each time it does.
          const block = event.currentTarget.closest('[data-composer]');
          const keepInView = () => block?.scrollIntoView({ block: 'nearest' });
          stopKeepingInView.current?.();
          window.visualViewport?.addEventListener('resize', keepInView);
          stopKeepingInView.current = () =>
            window.visualViewport?.removeEventListener('resize', keepInView);
        }}
        onBlur={() => {
          setIsFocused(false);
          stopKeepingInView.current?.();
          stopKeepingInView.current = null;
          onFocusChange(false);
        }}
      />
      <ReadChips
        reading={reading}
        timeZone={timeZone}
        onDismiss={(key, label) => {
          setDismissed((current) => [...current, key]);
          setLastDrop({ key, label });
        }}
        onPickDay={(key, day) => {
          setFixedDays((current) => ({ ...current, [key]: day }));
          setLastDrop(null);
        }}
      />
      {shownDrop && (
        <p className='text-muted-foreground text-[13px]'>
          {HELM_COPY.readAsTextDone(shownDrop.label)}
          <Button
            type='button'
            variant='tertiary'
            size='sm'
            className="relative ml-1 inline-flex h-7 min-w-0 rounded-full px-2 align-middle text-[13px] before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']"
            onClick={() => {
              setDismissed((current) =>
                current.filter((key) => key !== shownDrop.key),
              );
              setLastDrop(null);
            }}
          >
            {HELM_COPY.undo}
          </Button>
        </p>
      )}
      {isTooLong && (
        <p className='text-destructive text-[13px]' aria-live='polite'>
          {HELM_COPY.tooLong(length - CAPTURE_MAX_CHARS)}
        </p>
      )}
      {waitingPlaceholder === null && (
        <div className='flex items-center justify-between gap-3'>
          <span
            className='text-muted-foreground text-[13px] tabular-nums'
            aria-live='polite'
          >
            {isNearLimit &&
              `${length.toLocaleString()} / ${CAPTURE_MAX_CHARS.toLocaleString()}`}
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
