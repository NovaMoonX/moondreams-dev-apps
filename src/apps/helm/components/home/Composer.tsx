import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import {
  Button,
  DropdownMenuFactories,
  Textarea,
} from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import {
  ArrowUp,
  AtSign,
  Camera,
  FileText,
  ImagePlus,
  Mic,
  Paperclip,
} from 'lucide-react';

import EllipsisDropdown from '@/components/EllipsisDropdown';
import LockedButton from '@/components/LockedButton';
import MicrophoneAccess from '@/components/MicrophoneAccess';
import { useAuth } from '@/hooks/useAuth';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useCanTakePhoto } from '@/hooks/useCanTakePhoto';
import { useGrowingTextarea } from '@/hooks/useGrowingTextarea';
import { useMicrophonePermission } from '@/hooks/useMicrophonePermission';
import { useFormDraft, useKeepFormDraft } from '@/hooks/useFormDraft';
import { readFormDraft, writeFormDraft } from '@lib/app/formDrafts';
import { formatClock } from '@/utils/durationUtils';
import { openFileChooser } from '@/utils/fileUtils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';

import {
  CAPTURE_COUNTER_FROM,
  CAPTURE_MAX_CHARS,
  HELM_COPY,
  NOTE_BODY_MAX,
} from '@apps/helm/constants';
import AttachmentChips from '@apps/helm/components/home/AttachmentChips';
import NoteSheet from '@apps/helm/components/knowledge/NoteSheet';
import ReadChips from '@apps/helm/components/home/ReadChips';
import ShorthandRow from '@apps/helm/components/home/ShorthandRow';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import {
  DictateButton,
  DictationLine,
} from '@apps/helm/components/voice/Dictation';
import {
  useHelmVoiceContext,
  useIsDictatingHere,
} from '@apps/helm/hooks/useHelmVoice';
import { useTurnAttachments } from '@apps/helm/hooks/useMediaUpload';
import { useSaveAsNote } from '@apps/helm/hooks/useSaveAsNote';
import {
  clearSentTurn,
  getNextTurn,
  recordSentTurn,
} from '@apps/helm/hooks/useSession';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { store, useAppSelector } from '@/store';
import { HELM_DRAFT_PREFIX } from '@apps/helm/security';
import { saveToOutbox } from '@apps/helm/store/actions/outboxActions';
import { MAX_VOICE_NOTE_MS } from '@apps/helm/utils/mediaCaps';
import type { ScreenContext } from '@apps/helm/types';
import {
  rankStoredNotes,
  sendCapture,
} from '@apps/helm/store/actions/captureActions';
import {
  applyReadingEdits,
  getReadingKey,
  readCapture,
  URGENT_KEY,
} from '@apps/helm/utils/captureReading';

const { option } = DropdownMenuFactories;
const TAKE_PHOTO = 'take';
const CHOOSE_PHOTOS = 'choose';
const CHOOSE_FILE = 'file';
const RECORD = 'record';

const HOME_DRAFT_KEY = `${HELM_DRAFT_PREFIX}composer`;

/** The kept draft and the words typed while waiting, the draft first unless the words already hold it. */
const startingText = (restored: string | null, held: string) =>
  restored === null || held.includes(restored)
    ? held || (restored ?? '')
    : held
      ? `${restored}\n${held}`
      : restored;

const parseDraft = (stored: unknown) =>
  typeof stored === 'string' && stored.length > 0 ? stored : null;

interface ComposerProps {
  /** Lets the dock's Type and Talk put the cursor here. */
  fieldRef: RefObject<HTMLTextAreaElement | null>;
  maxLines?: number;
  dictationId?: string;
  onFocusChange: (isFocused: boolean) => void;
  /** Without the data key nothing typed could be kept sealed, so the field waits; it remounts once the key is here, starting from the kept draft and the words typed while waiting. */
  isReady: boolean;
  /** Offline or refused, with the drop-box key kept on this device: the field takes words and keeps them sealed there until the connection is back; photos and voice notes wait. */
  isOutbox?: boolean;
  /** The words typed before this field was mounted again for the key; only home holds them. */
  heldText?: string;
  /** Hands the owner the words as they change, so a remount keeps them. */
  onTextChange?: (text: string) => void;
  /** Says why the field waits when the key can't come yet (offline, or refused). */
  waitingPlaceholder: string | null;
  /** The page the words are asked from, stamped on the turn; null from home. */
  screen: ScreenContext | null;
  /** Where unsent words are kept; the conversation over a page keeps its own, apart from home's. */
  draftKey?: string;
  /** Sits at the card's top-left, above the field. */
  topSlot?: ReactNode;
}

/** The text field at the foot of home's conversation. Send keeps the turn sealed; Enter starts a new line and Shift+Enter sends. */
function Composer({
  fieldRef,
  maxLines = 6,
  dictationId,
  onFocusChange,
  isReady,
  isOutbox = false,
  heldText = '',
  onTextChange,
  waitingPlaceholder,
  screen,
  draftKey = HOME_DRAFT_KEY,
  topSlot,
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
  const [text, setText] = useState(() => startingText(restored, heldText));
  const changeText = (next: string) => {
    setText(next);
    onTextChange?.(next);
  };
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
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const saveAsNote = useSaveAsNote(setOpenNoteId);
  // The clock the words are read against, taken when they last changed.
  const [typedAt, setTypedAt] = useState(() => Date.now());
  const [isFocused, setIsFocused] = useState(false);
  const [isShorthandOpen, setIsShorthandOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [fixedDays, setFixedDays] = useState<Record<string, number>>({});
  const [lastDrop, setLastDrop] = useState<{
    key: string;
    label: string;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canTakePhoto = useCanTakePhoto();
  const profileZone = useAppSelector((state) => state.helm.profile?.timeZone);
  const timeZone = profileZone ?? getDeviceTimeZone() ?? 'UTC';
  const appendWords = (words: string) => {
    setText((current) =>
      current.trim().length > 0 ? `${current.trimEnd()} ${words}` : words,
    );
    setTypedAt(Date.now());
  };
  const { registerField } = voice;
  useEffect(
    () =>
      registerField((words) => {
        setText((current) =>
          current.trim().length > 0 ? `${current.trimEnd()} ${words}` : words,
        );
        setTypedAt(Date.now());
      }),
    [registerField],
  );
  const attachments = useTurnAttachments({
    timeZone,
    onTranscript: (words) => appendWords(words),
  });
  const microphone = useMicrophonePermission();
  const recorder = useAudioRecorder({
    maxMs: MAX_VOICE_NOTE_MS,
    onDone: (recording) => {
      attachments.addVoiceNote(
        new File(
          [recording.blob],
          `voice-note.${recording.mimeType.includes('mp4') ? 'm4a' : 'webm'}`,
          { type: recording.mimeType },
        ),
        recording.durationMs,
      );
      if (recording.isCut) {
        addToast({ title: HELM_COPY.recordStoppedAtLimit, type: 'info' });
      }
    },
  });
  const isRecording = recorder.state === 'recording';
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
  const press = useRef<{ isDown: boolean; pendingBlur: (() => void) | null }>({
    isDown: false,
    pendingBlur: null,
  });

  // A press that takes focus off the field must not change the layout under the finger, or the click lands on what moved into its place.
  useEffect(() => {
    const state = press.current;
    const down = () => {
      state.isDown = true;
    };
    const up = () => {
      state.isDown = false;
      const finish = state.pendingBlur;
      state.pendingBlur = null;
      if (finish) setTimeout(finish, 0);
    };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      state.pendingBlur = null;
    };
  }, []);

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
  const hasPhotos = attachments.mediaIds.length > 0;
  const isHeldBackByPhotos =
    attachments.isUploading || attachments.isWriting || attachments.hasFailed;
  const canSend =
    isReady &&
    (length > 0 || hasPhotos) &&
    !isSending &&
    isCapturesLoaded &&
    user !== null &&
    !isTooLong &&
    !isRecording &&
    !isHeldBackByPhotos;
  const canSendToOutbox =
    isOutbox &&
    !isReady &&
    length > 0 &&
    !isSending &&
    user !== null &&
    !isTooLong;
  const canSaveAsNote = isTooLong && length <= NOTE_BODY_MAX;
  const isNearLimit = length >= CAPTURE_COUNTER_FROM;

  const sendToOutbox = async () => {
    if (!canSendToOutbox || !user) return;
    const sent = text.trim();
    const createdAt = Date.now();
    setIsSending(true);
    try {
      await saveToOutbox(user.uid, {
        text: sent,
        reading: applyReadingEdits(
          readCapture(sent, { now: createdAt, timeZone, assistantName: name }),
          { dismissed, days: fixedDays, timeZone },
        ),
        inputMode: 'typed',
        createdAt,
      });
      changeText('');
      setDismissed([]);
      setFixedDays({});
      setLastDrop(null);
    } catch (error) {
      console.error('Helm could not keep this on the device', error);
      addToast({ title: HELM_COPY.outboxNotKept(name), type: 'error' });
    } finally {
      setIsSending(false);
    }
  };

  const send = async () => {
    if (canSendToOutbox) return sendToOutbox();
    if (!canSend || !user) return;
    const { uid } = user;
    const sent = text;
    if (!hasPhotos && (await voice.handleTyped(sent, screen))) {
      changeText('');
      setDismissed([]);
      setFixedDays({});
      setLastDrop(null);
      return;
    }
    const attachmentIds = attachments.mediaIds;
    const sentChips = attachments.items;
    const sentVoice = attachments.hasWrittenVoiceNote;
    const next = getNextTurn();
    // A turn with photos starts its own turn and never joins a running one.
    const turn = {
      ...next,
      leadId: attachmentIds.length > 0 ? null : next.leadId,
      createdAt: Date.now(),
    };
    const sentDismissed = dismissed;
    const sentDays = fixedDays;
    const restore = (error: unknown) => {
      console.error('Helm turn did not send', error);
      const withSent = (current: string) =>
        !sent ? current : current ? `${current}\n${sent}` : sent;
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
      attachments.restore(sentChips);
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
        answersQuestion: null,
        questionAnswer: null,
        noteIds: rankStoredNotes(sent),
        attachmentIds,
        ...turn,
        ...(sentVoice
          ? { voice: { sttProvider: 'voiceNote', interruptedCaptureId: null } }
          : {}),
      });
      recordSentTurn(uid, turn, id);
      attachments.clear();
      changeText('');
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
    const isSend = event.shiftKey || event.metaKey || event.ctrlKey;
    if (event.key !== 'Enter' || !isSend || event.nativeEvent.isComposing) {
      return;
    }
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
    changeText(`${before}${added}${text.slice(to)}`);
    setTypedAt(Date.now());
    const caret = before.length + added.length;
    requestAnimationFrame(() => field.setSelectionRange(caret, caret));
  };

  const toggleShorthand = () => {
    if (isFocused) setIsShorthandOpen((isOpen) => !isOpen);
    else root.current?.querySelector('textarea')?.focus();
  };

  const pickPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    attachments.add(Array.from(event.target.files ?? []));
    event.target.value = '';
  };

  const startRecording = () => {
    if (!navigator.onLine) {
      attachments.say(HELM_COPY.recordNeedsConnection);
      return;
    }
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    // The recording row replaces the field, and a field removed while focused gets no blur.
    void recorder.start().then((isStarted) => {
      if (!isStarted) return;
      attachments.say(null);
      setIsFocused(false);
      setIsShorthandOpen(false);
      stopKeepingInView.current?.();
      stopKeepingInView.current = null;
      onFocusChange(false);
    });
  };

  const chooseAttachment = (value: string) => {
    if (value === RECORD) startRecording();
    else if (value === CHOOSE_FILE) openFileChooser(fileInput.current);
    else
      openFileChooser(
        value === TAKE_PHOTO ? cameraInput.current : libraryInput.current,
        { isCamera: value === TAKE_PHOTO },
      );
  };

  const canType = isReady || isOutbox;
  useGrowingTextarea(fieldRef, text, maxLines);
  const ownId = useId();
  const dictationOwner = dictationId ?? ownId;
  const isDictating = useIsDictatingHere(dictationOwner);
  const isOpen = (isFocused || isDictating) && !isRecording;
  const showsActions = waitingPlaceholder === null;

  return (
    <div
      ref={root}
      data-composer
      className='helm-composer border-border flex flex-col gap-1 rounded-[20px] border px-2 py-2'
      // A press on any control here keeps the field focused: a blur would drop the shorthand row and move what was pressed before the tap lands.
      onPointerDown={(event) => {
        const target = event.target;
        if (target instanceof Element && target.closest('button')) {
          event.preventDefault();
        }
      }}
    >
      {topSlot && <div className='flex px-1'>{topSlot}</div>}
      {voice.notice !== null && (
        <div
          className='text-muted-foreground flex flex-col items-start gap-0.5 px-1 text-[13px]'
          role='status'
        >
          {voice.needsMicrophone && microphone === 'granted' ? (
            <p>{HELM_COPY.talkNeedsRecognition}</p>
          ) : voice.needsMicrophone ? (
            <MicrophoneAccess
              onAllowed={voice.clearNotice}
              className='w-full'
            />
          ) : (
            <p>{voice.notice}</p>
          )}
          {voice.hasNoticeDoor && (
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className="text-primary relative -ml-2 before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-['']"
              onClick={() => void voice.openVoiceSettings()}
            >
              {HELM_COPY.talkOpenVoiceSettings}
            </Button>
          )}
        </div>
      )}
      {canType && showsActions && (
        <div
          inert={!isShorthandOpen}
          className={join(
            'grid transition-[grid-template-rows,opacity,margin] duration-200 ease-out motion-reduce:transition-none',
            isShorthandOpen
              ? 'grid-rows-[1fr] opacity-100'
              : '-mb-1 grid-rows-[0fr] opacity-0',
          )}
        >
          <div className='-mx-2 min-h-0 overflow-hidden'>
            <ShorthandRow onInsert={insertShorthand} />
          </div>
        </div>
      )}
      <div className={join('flex items-end gap-1', isOpen && 'flex-wrap')}>
        {showsActions && !isRecording && !(isOutbox && !isReady) && (
          <EllipsisDropdown
            variant='tertiary'
            placement='top'
            alignment='start'
            ariaLabel={HELM_COPY.attachMenuLabel}
            disabled={!isReady || isRecording}
            className='size-10! shrink-0 rounded-full'
            icon={<Paperclip className='size-5' aria-hidden='true' />}
            items={[
              ...(canTakePhoto
                ? [
                    option({
                      label: HELM_COPY.attachTake,
                      value: TAKE_PHOTO,
                      icon: <Camera className='size-4' aria-hidden='true' />,
                    }),
                  ]
                : []),
              option({
                label: HELM_COPY.attachChoose,
                value: CHOOSE_PHOTOS,
                icon: <ImagePlus className='size-4' aria-hidden='true' />,
              }),
              option({
                label: HELM_COPY.attachChooseFile,
                description: HELM_COPY.attachChooseFileHint,
                value: CHOOSE_FILE,
                icon: <FileText className='size-4' aria-hidden='true' />,
              }),
              option({
                label: HELM_COPY.attachRecord,
                value: RECORD,
                icon: <Mic className='size-4' aria-hidden='true' />,
              }),
            ]}
            onItemSelect={chooseAttachment}
          />
        )}
        {showsActions && canType && !isRecording && (
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            rounded='full'
            aria-label={HELM_COPY.shorthandLabel}
            aria-pressed={isShorthandOpen}
            disabled={isRecording}
            className='size-10 min-h-0 min-w-10 shrink-0 p-0'
            onClick={toggleShorthand}
          >
            <AtSign className='size-5' aria-hidden='true' />
          </Button>
        )}
        {isRecording ? (
          <div
            className='flex min-h-10 min-w-0 flex-1 items-center gap-2 px-1'
            role='status'
          >
            <span
              className='bg-destructive size-2.5 shrink-0 rounded-full'
              aria-hidden='true'
            />
            <span className='flex min-w-0 flex-1 items-baseline gap-1.5 text-[15px]'>
              <span className='min-w-0 truncate max-[359px]:sr-only'>
                {HELM_COPY.recording}
              </span>
              <span className='shrink-0 tabular-nums'>
                {formatClock(recorder.elapsedMs)}
              </span>
            </span>
            <Button
              type='button'
              variant='tertiary'
              size='sm'
              className="relative shrink-0 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']"
              onClick={recorder.cancel}
            >
              {HELM_COPY.recordCancel}
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='sm'
              rounded='full'
              className="relative shrink-0 before:absolute before:-inset-x-1 before:-inset-y-2.5 before:content-['']"
              onClick={recorder.stop}
            >
              {HELM_COPY.recordStop}
            </Button>
          </div>
        ) : (
          <div
            className={join(
              'min-w-0 flex-1 [&_textarea]:block',
              isOpen && 'order-first basis-full',
            )}
          >
            <Textarea
              ref={fieldRef}
              variant='base'
              rounded='none'
              rows={1}
              aria-label={HELM_COPY.composerLabel(name)}
              placeholder={
                waitingPlaceholder ?? HELM_COPY.composerPlaceholder(name)
              }
              className='min-h-10 resize-none border-0 bg-transparent px-1 py-2.5 text-[15px] leading-5 shadow-none outline-none focus:outline-none focus-visible:ring-0 focus-visible:outline-none'
              disabled={!canType}
              value={text}
              onChange={(event) => {
                if (voice.notice !== null) voice.clearNotice();
                if (attachments.notice !== null) attachments.say(null);
                changeText(event.target.value);
                setTypedAt(Date.now());
              }}
              onKeyDown={handleKeyDown}
              onFocus={(event) => {
                onFocusChange(true);
                setIsFocused(true);
                setIsShorthandOpen(true);
                // The keyboard shrinks the viewport after focus lands, so the card is brought back into view each time it does.
                const block = event.currentTarget.closest('[data-composer]');
                const keepInView = () =>
                  block?.scrollIntoView({ block: 'nearest' });
                stopKeepingInView.current?.();
                window.visualViewport?.addEventListener('resize', keepInView);
                stopKeepingInView.current = () =>
                  window.visualViewport?.removeEventListener(
                    'resize',
                    keepInView,
                  );
              }}
              onBlur={(event) => {
                const field = event.currentTarget;
                const close = () => {
                  setIsFocused(false);
                  setIsShorthandOpen(false);
                  stopKeepingInView.current?.();
                  stopKeepingInView.current = null;
                  onFocusChange(false);
                };
                const finish = () => {
                  if (document.activeElement === field) return;
                  // The attach menu takes focus while open and hands it back to the field when it closes.
                  if (root.current?.querySelector('[aria-expanded="true"]')) {
                    return;
                  }
                  close();
                };
                if (press.current.isDown) press.current.pendingBlur = finish;
                else finish();
              }}
            />
          </div>
        )}
        {showsActions &&
          canType &&
          !isRecording &&
          (isFocused || isDictating) && (
            <DictateButton
              owner={dictationOwner}
              label={HELM_COPY.dictate}
              onWords={appendWords}
              className='mr-1 ml-auto'
            />
          )}
        {showsActions &&
          (isHeldBackByPhotos ? (
            <LockedButton
              label={HELM_COPY.send}
              title={HELM_COPY.attachWaitingTitle}
              size='sm'
              className='h-10 shrink-0 rounded-full'
            >
              <p>
                {attachments.isWriting
                  ? HELM_COPY.attachWaitingVoice
                  : attachments.isUploading
                    ? HELM_COPY.attachWaiting
                    : HELM_COPY.attachFailedBlock}
              </p>
            </LockedButton>
          ) : (
            <Button
              type='button'
              size='icon'
              rounded='full'
              aria-label={HELM_COPY.send}
              disabled={!canSend && !canSendToOutbox}
              className='size-10 min-h-0 min-w-10 shrink-0 p-0'
              onClick={() => void send()}
            >
              <ArrowUp className='size-5' aria-hidden='true' />
            </Button>
          ))}
      </div>
      <div className='flex flex-col gap-2 px-1 pb-1 empty:hidden'>
        <DictationLine owner={dictationOwner} />
        {recorder.state === 'unsupported' && (
          <p className='text-muted-foreground text-[13px]' role='status'>
            {HELM_COPY.recordUnsupported}
          </p>
        )}
        {recorder.state === 'refused' && <MicrophoneAccess />}
        <AttachmentChips
          items={attachments.items}
          onRemove={attachments.remove}
          onRetry={attachments.retry}
        />
        {attachments.notice !== null && (
          <p className='text-muted-foreground text-[13px]' role='status'>
            {attachments.notice}
          </p>
        )}
        {attachments.items.length > 0 && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.attachNote(name)}
          </p>
        )}
        <ReadChips
          isInCard
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
        {isTooLong && (
          <div className='flex items-center'>
            {canSaveAsNote ? (
              <Button
                type='button'
                variant='secondary'
                size='sm'
                rounded='full'
                disabled={!isReady || !user || isSavingNote}
                className="relative before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-['']"
                onClick={() => {
                  setIsSavingNote(true);
                  void saveAsNote(text)
                    .then((isTaken) => {
                      if (isTaken) changeText('');
                    })
                    .finally(() => setIsSavingNote(false));
                }}
              >
                {HELM_COPY.saveAsNote}
              </Button>
            ) : (
              <p className='text-muted-foreground text-[13px]'>
                {HELM_COPY.saveAsNoteTooLong}
              </p>
            )}
          </div>
        )}
        {isOutbox && !isReady && (
          <p className='text-muted-foreground text-[13px] text-pretty'>
            {HELM_COPY.outboxNoAttach}
          </p>
        )}
        {showsActions && isNearLimit && (
          <span
            className='text-muted-foreground text-[13px] tabular-nums'
            aria-live='polite'
          >
            {`${length.toLocaleString()} / ${CAPTURE_MAX_CHARS.toLocaleString()}`}
          </span>
        )}
      </div>
      <input
        ref={cameraInput}
        type='file'
        accept='image/*'
        className='hidden'
        tabIndex={-1}
        onChange={pickPhotos}
      />
      <input
        ref={libraryInput}
        type='file'
        accept='image/*'
        multiple
        className='hidden'
        tabIndex={-1}
        onChange={pickPhotos}
      />
      <input
        ref={fileInput}
        type='file'
        accept='application/pdf,.pdf,.md,.markdown,text/markdown'
        multiple
        className='hidden'
        tabIndex={-1}
        onChange={pickPhotos}
      />
      <NoteSheet noteId={openNoteId} onClose={() => setOpenNoteId(null)} />
    </div>
  );
}

export default Composer;
