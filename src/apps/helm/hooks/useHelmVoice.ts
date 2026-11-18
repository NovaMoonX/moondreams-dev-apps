import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import { httpsCallable } from 'firebase/functions';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useOnDeviceRecognition } from '@/hooks/useOnDeviceRecognition';
import {
  useVoiceConversation,
  type VoiceRepeat,
} from '@/hooks/useVoiceConversation';
import type { ClosingRead } from '@/lib/speech/closingPhrase';
import { isRepeatRequest } from '@/lib/speech/repeatRequest';
import { toPlainText } from '@/lib/speech/speechText';
import type { SpeechDelivery, VoiceIdentity } from '@/lib/speech/voice/types';
import {
  createVoiceTokenSource,
  type MintVoiceTokenRequest,
  type MintVoiceTokenResult,
} from '@/lib/speech/voice/voiceToken';
import { store, useAppSelector } from '@/store';
import { toComparable } from '@/utils/optionMatchUtils';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { END_PHRASES, HELM_COPY, SESSION_IDLE_MS } from '@apps/helm/constants';
import {
  useAssistantName,
  useAssistantNameVariants,
} from '@apps/helm/hooks/useAssistantName';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import {
  clearSentTurn,
  getNextTurn,
  recordSentTurn,
} from '@apps/helm/hooks/useSession';
import { functions } from '@lib/firebase/config';
import {
  createHelmSpeechSource,
  readHelmVoice,
} from '@apps/helm/utils/helmSpeechSource';
import { canUndo } from '@apps/helm/nomos/planUndo';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { resolveQuestion } from '@apps/helm/queries/nomosMutations';
import {
  toKinSearchChoice,
  toQuestionChoice,
} from '@apps/helm/utils/questionChoice';
import {
  closeQuestions,
  loadExecutionsById,
  markCaptureSpoken,
  reopenQuestions,
  type QuestionRef,
  rankStoredNotes,
  sendCapture,
  wasSentHere,
  dismissQuestion,
  skipQuestion,
} from '@apps/helm/store/actions/captureActions';
import { VIEW_KINDS } from '@apps/helm/screen/views';
import { formatDayName, toDayKey } from '@apps/helm/utils/planDays';
import { selectTopScreen } from '@apps/helm/store/screenSlice';
import {
  isAnswerInFlight,
  sendQuestionAnswer,
} from '@apps/helm/store/actions/questionActions';
import { isExecutionHeld } from '@apps/helm/store/actions/privacyActions';
import {
  answerUndoOffer,
  takeBack,
} from '@apps/helm/store/actions/undoActions';
import {
  selectAllCaptures,
  selectExecutionsById,
} from '@apps/helm/store/selectors/captureSelectors';
import type {
  HeardName,
  HelmQuestion,
  OpenCapture,
  QuestionAnswerValue,
  ScreenContext,
} from '@apps/helm/types';
import {
  applyReadingEdits,
  readCapture,
} from '@apps/helm/utils/captureReading';
import { getOpenQuestions } from '@apps/helm/utils/heldCaptures';
import { createSettledReader } from '@apps/helm/utils/linearThread';
import {
  readCloseEffects,
  readDeviceTurn,
} from '@apps/helm/utils/closeConversation';
import { matchSpokenAnswer } from '@apps/helm/utils/questionAnswers';
import {
  buildAskAgainLine,
  buildSpokenQuestion,
} from '@apps/helm/utils/spokenQuestion';
import {
  isSpokenTurn,
  OPEN_QUESTION_MS,
  pickQuestionTurn,
} from '@apps/helm/utils/openQuestion';
import { getFreshFrom, getOpenSessionId } from '@apps/helm/utils/sessions';
import { takeDeviceCheckIn } from '@apps/helm/utils/deviceCheckIn';
import { isUnattendedTurn } from '@apps/helm/utils/privacy';
import { readPresence } from '@apps/helm/utils/presence';
import { setLockScreenName } from '@apps/helm/store/actions/habitActions';
import {
  answerShowName,
  planNameRequest,
  readNameRequest,
  toNameLine,
} from '@apps/helm/utils/lockScreenName';
import { readHelmNameHints } from '@apps/helm/utils/nameHints';
import { readSwappedWords } from '@apps/helm/utils/spokenNames';
import { selectNameRecords } from '@apps/helm/store/selectors/nameSelectors';
import { QUIET_SPOKEN_LINE } from '@apps/helm/utils/privacy';
import { findHeldLine, heldDelivery } from '@apps/helm/utils/quietSpeech';
import {
  isAcknowledgement,
  isLiveCloser,
  toWakeSpellings,
} from '@apps/helm/utils/voicePhrases';

const NOTE_MS = 6000;
const NAME_ASK_MS = 60_000;
const CLOSED_MS = 10_000;
const CLOSE_FRESH_MS = 30_000;
// A turn still unsorted this long after it was sent while offline stops the wait; it is filed once the connection is back.
const OFFLINE_WAIT_MS = 20_000;
const ASK_AGAIN_MAX_WORDS = 3;

const mintVoiceToken = httpsCallable<
  MintVoiceTokenRequest,
  MintVoiceTokenResult
>(functions, 'mintVoiceToken');

const toVoiceIdentity = (label: string): VoiceIdentity => ({
  id: 'helm-assistant',
  label,
  device: {
    naturalVoice: true,
    systemVoiceHints: [],
    rate: 1,
    pitch: 1,
  },
});

type AskedAloud = {
  captureId: string;
  questionId: string;
  question: HelmQuestion;
  wakeUntil: number;
} | null;

// Kept outside React state: it is set from a reply's playback, and a setter there makes the compiler treat every clock read on the answer path as render work.
function createAskedStore() {
  let value: AskedAloud = null;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: AskedAloud) => {
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Helm's voice: talking writes a spoken turn like a typed one, the line the server sealed for it is said once the turn is sorted, and "undo that" takes the open session's latest turn back. One instance serves home and the conversation over a page. */

export function useHelmVoice() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const name = useAssistantName();
  const nameVariants = useAssistantNameVariants();
  const voiceIdentity = useMemo(() => toVoiceIdentity(name), [name]);
  const uid = user?.uid ?? null;
  const [note, setNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [hasNoticeDoor, setHasNoticeDoor] = useState(false);
  const [needsMicrophone, setNeedsMicrophone] = useState(false);
  const [closed, setClosed] = useState<{
    left: QuestionRef[];
    skipped: QuestionRef[];
    words: string[];
    hasDropped: boolean;
  } | null>(null);
  const closedId = useRef(0);
  // Where Undo puts dropped unsent words back: the open field, in memory only.
  const fieldWriter = useRef<((text: string) => void) | null>(null);
  // Turns whose reply, once said, doesn't reopen listening: they ended with a finish phrase.
  const finishedIds = useRef(new Set<string>());
  const [askedStore] = useState(createAskedStore);
  const askedMark = useSyncExternalStore(askedStore.subscribe, askedStore.get);
  const captures = useAppSelector(selectAllCaptures);
  const askedCapture = askedMark
    ? captures.find((capture) => capture.id === askedMark.captureId)
    : undefined;
  // The mark is drawn only while its question is still open, so an answer or a skip from the card clears it at once.
  const askedAloud =
    askedMark &&
    askedCapture?.status === 'needsYou' &&
    getOpenQuestions(askedCapture).some(
      (entry) =>
        entry.id === askedMark.questionId &&
        entry.skippedAt === null &&
        !createSettledReader(captures)(askedCapture, entry.id),
    )
      ? askedMark
      : null;
  const executionsById = useAppSelector(selectExecutionsById);
  const failedIds = useAppSelector((state) => state.helm.failedExecutionIds);
  const screen = useRef<ScreenContext | null>(null);
  const isWakeStarted = useRef(false);
  // The latest tick the device made from words, so "undo that" takes it back when nothing newer was done.
  const nameAsk = useRef<{ habitId: string; at: number } | null>(null);
  const lastCheckIn = useRef<{ undo: () => Promise<void>; at: number } | null>(
    null,
  );
  const noteId = useRef(0);
  const waiting = useRef(new Set<string>());
  const isTypedSince = useRef(false);
  // Code-built questions already asked again once, so a second miss goes on as a turn.
  const askedAgain = useRef(new Set<string>());
  // Answer turns by id, with the question each answered, so its reply is followed by the turn's next question.
  const afterAnswer = useRef(
    new Map<string, { captureId: string; questionId: string }>(),
  );
  const onSettled = useRef(() => undefined as void);
  const offlineId = useRef(0);
  const isSurfaceShown = useRef(true);
  // Rises on each Stop, so a turn still being sent when Stop was tapped is never waited on.
  const stopCount = useRef(0);
  const speakingCaptureId = useRef<string | null>(null);
  // The line the person talked over, kept for the turn that follows it.
  const interruptedCaptureId = useRef<string | null>(null);
  // Words spoken into the open text box go to the field, not out as a turn.
  const dictation = useRef<((text: string) => void) | null>(null);
  const [dictationOwner, setDictationOwner] = useState<string | null>(null);
  const [tokenSource] = useState(() =>
    createVoiceTokenSource({
      appId: 'helm',
      mint: async (request) => (await mintVoiceToken(request)).data,
    }),
  );
  const [speechSource] = useState(createHelmSpeechSource);
  const voiceMode = useAppSelector((state) => state.helm.profile?.voiceMode);
  const isWakeWordOn = useAppSelector(
    (state) => state.helm.profile?.isWakeWordOn ?? false,
  );
  const isHandsFreeOn = useAppSelector(
    (state) => state.helm.profile?.isHandsFreeOn ?? true,
  );
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const topScreen = useAppSelector(selectTopScreen);
  const { view, isAskRequested, openAsk, openVoiceSettings } =
    useHelmUrlState();
  const [showsPhoneLine, setShowsPhoneLine] = useState(false);
  const isHomeView = VIEW_KINDS[view] === 'home';

  const lang = navigator.language || 'en-US';
  // Started ahead of the first listen only where it will be the one listening: the phrase, or no cloud.
  const onDevice = useOnDeviceRecognition({
    lang,
    isWarm:
      keyStatus === 'ready' &&
      (isWakeWordOn || voiceMode !== 'cloudWhenOnline'),
  });

  const nameRecords = useAppSelector(selectNameRecords);
  const [restored, setRestored] = useState<string[]>([]);
  const restoredRef = useRef<string[]>([]);

  const voice = useVoiceConversation({
    lang,
    isOnDeviceReady: onDevice.isOn,
    identity: voiceIdentity,
    endPhrases: END_PHRASES,
    readsClose: true,
    conversationIdleMs: SESSION_IDLE_MS,
    getNameHints: () =>
      readHelmNameHints(store.getState().helm, screen.current, uid),
    onUtterance: (text, heardBy) => {
      void handleUtterance(text, heardBy.sttProvider);
    },
    onNothingHeard: (isAsked) => {
      interruptedCaptureId.current = null;
      endDictation();
      if (isAsked) showNote(HELM_COPY.talkHeardNothing);
    },
    onDeviceListenFailed: (isAsked) => {
      interruptedCaptureId.current = null;
      endDictation();
      if (isAsked) showNote(HELM_COPY.talkListenFailed);
    },
    onUnavailable: (reason) => {
      interruptedCaptureId.current = null;
      endDictation();
      const isMicrophone = reason === 'no-permission';
      showNotice(
        isMicrophone
          ? HELM_COPY.talkNeedsMicrophone
          : HELM_COPY.talkNeedsRecognition,
        false,
        isMicrophone,
      );
    },
    onCloudHeld: () => setShowsPhoneLine(true),
    onBargeIn: () => {
      interruptedCaptureId.current = speakingCaptureId.current;
    },
    onLiveEnd: (why) => {
      if (why === 'quiet') showNote(HELM_COPY.liveEndedQuiet);
      if (why === 'failed') showNote(HELM_COPY.liveEndedFailed);
    },
    // A utility screen with no ask bar has nowhere to show the conversation, so it never listens for the phrase.
    wake: {
      isOn:
        isWakeWordOn &&
        keyStatus === 'ready' &&
        (isHomeView || topScreen !== null),
      spellings: toWakeSpellings(name, nameVariants),
      looseNames: [name],
      onWake: wakeUp,
      startsLive: isHandsFreeOn,
    },
    cloudListening: {
      tokenSource,
      isAllowed: voiceMode === 'cloudWhenOnline',
    },
    cloudSpeaking: {
      source: speechSource,
      isAllowed: voiceMode === 'cloudWhenOnline',
      readVoice: readHelmVoice,
    },
  });

  function endLiveNow() {
    waiting.current.clear();
    stopCount.current += 1;
    voice.endLive();
    voice.settle();
  }

  function endDictation() {
    dictation.current = null;
    setDictationOwner(null);
  }

  function clearRestored() {
    restoredRef.current = [];
    setRestored([]);
  }

  const restoreHeard = (heard: string) => {
    restoredRef.current = [...restoredRef.current, toComparable(heard)];
    setRestored(restoredRef.current);
  };

  function showNote(text: string) {
    setNote(text);
    window.clearTimeout(noteId.current);
    noteId.current = window.setTimeout(() => setNote(null), NOTE_MS);
  }

  function showNotice(text: string, hasDoor: boolean, isMicrophone = false) {
    setNotice(text);
    setHasNoticeDoor(hasDoor);
    setNeedsMicrophone(isMicrophone);
  }

  function sayRepeatRefusal(outcome: VoiceRepeat, turnKey: number) {
    if (outcome === 'none') say(HELM_COPY.nothingToRepeat, turnKey);
    if (outcome === 'muted') showNote(HELM_COPY.replayMuted);
  }

  /** Why a whisper didn't play: the device's own voice never whispers, so that case says how to hear it. */
  function whisperFailedNote() {
    return store.getState().helm.profile?.voiceMode === 'deviceOnly'
      ? HELM_COPY.whisperNeedsCloud
      : HELM_COPY.whisperFailed;
  }

  /** Says the last line again the way it was said; a whisper that can't play says so rather than going quiet. */
  function repeatLast(turnKey: number) {
    sayRepeatRefusal(
      voice.repeat(undefined, {
        onResult: (result, delivery) => {
          if (delivery !== undefined && result.status === 'failed') {
            showNote(whisperFailedNote());
          }
        },
      }),
      turnKey,
    );
  }

  /** Says a line kept off the speaker: whispered unless the setting is off, and never in the usual voice when the whisper can't play. */
  function sayHeldAloud(line: string) {
    const delivery = heldDelivery(
      store.getState().helm.profile?.whisperHeld ?? null,
    );
    sayRepeatRefusal(
      voice.repeat(line, {
        ...(delivery !== null && { delivery }),
        onResult: (result) => {
          if (delivery !== null && result.status === 'failed') {
            showNote(whisperFailedNote());
          }
        },
      }),
      Date.now(),
    );
  }

  /** The person asked by voice to hear what was kept off the speaker: the server put that line on this turn, so it is said (whispered), or the turn's own line says nothing is held. */
  function answerHeldAsk(capture: OpenCapture) {
    const line = capture.heldLine;
    if (line === null) {
      void deliver(capture, capture.line ?? HELM_COPY.nothingHeld);
      return;
    }
    showNote(line);
    void deliver(
      capture,
      line,
      heldDelivery(store.getState().helm.profile?.whisperHeld ?? null) ??
        undefined,
    );
  }

  /** Shows the line; `spoken` is what is said when it differs (a line that names a quiet thing is shown, never said). */
  function say(line: string, turnKey: number, spoken: string = line) {
    voice.settle();
    showNote(line);
    void voice.speak(spoken, {
      priority: 'reply',
      turnKey,
      joinsLine: true,
      canAnswer: isHandsFreeOn && isSurfaceShown.current,
    });
  }

  /** The phrase was heard: readies the page in front as a Talk tap does and says whether a turn may start; the voice hook then keeps listening to the same breath. */
  function wakeUp() {
    if (!voice.isAvailable) return false;
    const page = isHomeView
      ? null
      : (selectTopScreen(store.getState())?.context ?? null);
    prepareListening(page);
    isWakeStarted.current = true;
    if (page !== null && !isAskRequested) void openAsk();
    return true;
  }

  async function handleUtterance(text: string, sttProvider: string) {
    const now = Date.now();
    const interrupted = interruptedCaptureId.current;
    interruptedCaptureId.current = null;
    const write = dictation.current;
    if (write) {
      dictation.current = null;
      voice.settle();
      queueMicrotask(() => setDictationOwner(null));
      write(text);
      return;
    }
    if (isRepeatRequest(text)) {
      clearRestored();
      voice.settle();
      repeatLast(now);
      return;
    }
    const swapped = readSwappedWords(
      text,
      selectNameRecords(store.getState()),
      restoredRef.current,
    );
    clearRestored();
    isTypedSince.current = false;
    await takeOnDevice(swapped.text, {
      isSpoken: true,
      sttProvider,
      interrupted,
      hasPage: screen.current !== null,
      heardNames: swapped.heardNames,
    });
  }

  /** Reads a final transcript or sent text in the device's order (undo, the open question's answer, stop, a closing phrase) and says whether the device took it. A spoken turn that none took goes on to the server; a typed one is left to the field. */
  async function takeOnDevice(
    text: string,
    opts: {
      isSpoken: boolean;
      sttProvider: string | undefined;
      interrupted: string | null;
      hasPage: boolean;
      heardNames?: HeardName[];
    },
  ) {
    const { isSpoken, sttProvider, interrupted } = opts;
    const now = Date.now();
    const state = store.getState();
    const timeZone =
      state.helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
    const asked = findAskedQuestion(now, null, isSpoken)?.asked;
    const turn = readDeviceTurn({
      text,
      isSpoken,
      isTalkedOver: interrupted !== null,
      question: asked?.question ?? null,
      isPending: asked !== undefined || waiting.current.size > 0,
      hasPage: opts.hasPage,
      extra: [toPlainText(name), ...toWakeSpellings(name, nameVariants)],
      now,
      timeZone,
    });
    if (turn.kind === 'undo') {
      const offer = isSpoken ? findAskedQuestion(now, 'undoOffer') : null;
      if (offer?.asked.question.kind === 'undoOffer') {
        await answerOpenUndoOffer(offer.asked, 'yes', now);
        return true;
      }
      await undoLatest(now);
      return true;
    }
    if (turn.kind === 'stopVoice') {
      voice.settle();
      startListening(screen.current, voice.isLive);
      return true;
    }
    if (turn.kind === 'close') {
      if (await closeConversation(turn.close, isSpoken, now)) return true;
      // A typed close that was not written keeps its words in the field; a spoken one puts what was heard there.
      if (!isSpoken) return 'kept' as const;
      if (fieldWriter.current) fieldWriter.current(text);
      else say(HELM_COPY.talkSendFailed, now);
      return true;
    }
    if (await takeLockScreenName(text, turn, isSpoken)) return true;
    if (
      turn.kind === 'send' &&
      (await takeCheckIn(
        turn.text,
        isSpoken,
        isSpoken
          ? { sttProvider: sttProvider ?? 'browser', interrupted }
          : null,
      ))
    ) {
      return true;
    }
    if (!isSpoken) {
      return turn.kind === 'answer'
        ? answerQuestion(text, sttProvider, now, false)
        : false;
    }
    const said = turn.kind === 'send' ? turn.text : text;
    if (await answerQuestion(said, sttProvider, now, true)) return true;
    // A nod or a goodbye in a live conversation is not a turn: filing it read back "nothing to file in it".
    if (voice.isLive && isLiveCloser(text)) {
      endLiveNow();
      return true;
    }
    if (voice.isLive && isAcknowledgement(text)) {
      voice.settle();
      return true;
    }
    await sendTurn(
      said,
      sttProvider ?? 'browser',
      interrupted,
      turn.kind === 'send' && turn.isFinish,
      opts.heardNames,
    );
    return true;
  }

  /** "Show Pills's name on the lock screen" and "hide it", on the device before any server turn. Showing says the warning and holds a yes or no here; only a tapped Show it or a clear spoken yes writes, and anything else drops the question. Hiding is one step with Undo. A private habit's name is spoken as its masked label while nobody is looking. */
  async function takeLockScreenName(
    text: string,
    turn: { kind: string; text?: string },
    isSpoken: boolean,
  ) {
    if (!uid) return false;
    const { helm } = store.getState();
    if (helm.uid !== uid || !helm.habits.isLoaded) return false;
    const now = Date.now();
    const candidates = helm.habits.items.flatMap((item) =>
      item.isUnreadable || item.status === 'retired'
        ? []
        : [
            {
              item,
              habit: {
                id: item.id,
                name: item.name,
                lockScreenName: item.lockScreenName,
                isPrivate: item.privacy === 'private' || item.isCare === true,
              },
            },
          ],
    );
    const isQuiet =
      isSpoken && isUnattendedTurn(isWakeStarted.current, readPresence());
    const show = (line: string, type: 'info' | 'success') => {
      if (isSpoken) say(line, now);
      else addToast({ title: line, type });
    };
    const write = (
      entry: (typeof candidates)[number],
      isShown: boolean,
      line: string,
    ) => {
      const result = setLockScreenName(uid, entry.item, isShown);
      result.written.catch((error: unknown) => {
        console.error('Helm lock screen name was not changed', error);
        addToast({ title: HELM_COPY.lockScreenNameFailed, type: 'error' });
      });
      if (isSpoken) say(line, now);
      addToast({
        title: line,
        type: 'success',
        action: {
          label: HELM_COPY.undo,
          onClick: () => {
            void result.undo().catch((error: unknown) => {
              console.error('Helm lock screen name was not taken back', error);
              addToast({ title: HELM_COPY.habitUndoFailed, type: 'error' });
            });
          },
        },
      });
    };
    const pending = nameAsk.current;
    nameAsk.current = null;
    if (pending && now - pending.at < NAME_ASK_MS) {
      const entry = candidates.find(
        (item) => item.habit.id === pending.habitId,
      );
      if (entry) {
        const said = turn.kind === 'send' && turn.text ? turn.text : text;
        const answer = answerShowName(entry.habit, said, {
          now,
          timeZone: helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC',
        });
        if (answer.kind === 'write' && isQuiet && entry.habit.isPrivate) {
          nameAsk.current = pending;
          show(HELM_COPY.lockScreenNameConfirmOnScreen, 'info');
          return true;
        }
        if (answer.kind === 'write') {
          write(entry, true, toNameLine(answer, entry.habit, isQuiet));
          return true;
        }
        if (answer.kind === 'kept') {
          show(answer.line, 'info');
          return true;
        }
      }
    }
    const request = readNameRequest(
      turn.kind === 'send' && turn.text ? turn.text : text,
      candidates.map((entry) => entry.habit),
    );
    if (!request) return false;
    const entry = candidates.find((item) => item.habit.id === request.habit.id);
    if (!entry) return false;
    const plan = planNameRequest(entry.habit, request.isShown);
    const line = toNameLine(plan, entry.habit, isQuiet);
    if (plan.kind === 'write') {
      write(entry, false, line);
      return true;
    }
    if (plan.kind !== 'ask') {
      show(line, 'info');
      return true;
    }
    nameAsk.current = { habitId: entry.habit.id, at: now };
    if (isSpoken) say(line, now);
    addToast({
      title: line,
      type: 'info',
      duration: NAME_ASK_MS,
      action: {
        label: HELM_COPY.lockScreenNameConfirmAction,
        onClick: () => {
          const live = nameAsk.current;
          if (!live || live.habitId !== entry.habit.id) return;
          nameAsk.current = null;
          write(
            entry,
            true,
            toNameLine(
              {
                kind: 'write',
                lockScreenName: entry.habit.name,
                line: '',
              },
              entry.habit,
              false,
            ),
          );
        },
      },
    });
    return true;
  }

  /** A plain check-in on a habit due today ("took my evening pills"): ticked on the device with no model call and offline, and kept in the thread as a turn whose card is the habit line with Undo. Anything more than the check-in goes on as a turn. */
  async function takeCheckIn(
    text: string,
    isSpoken: boolean,
    voiceTurn: {
      sttProvider: string;
      interrupted: string | null;
    } | null = null,
  ) {
    if (!uid) return false;
    if (!isSpoken) isTypedSince.current = true;
    const turn = getNextTurn();
    const result = await takeDeviceCheckIn(uid, text, {
      sessionId: turn.sessionId,
      turnIndex: turn.turnIndex,
      inputMode: isSpoken ? 'voice' : 'typed',
      sttProvider: isSpoken ? (voiceTurn?.sttProvider ?? 'browser') : null,
      interruptedCaptureId: voiceTurn?.interrupted ?? null,
      presence: isSpoken
        ? { startedByWake: isWakeStarted.current, ...readPresence() }
        : null,
    }).catch((error: unknown) => {
      console.error('Helm check-in was not read', error);
      return null;
    });
    if (result === null || result.kind === 'none') return false;
    if (result.kind === 'said') {
      const line = result.quietLine ?? result.line;
      if (isSpoken) say(line, Date.now());
      else addToast({ title: line, type: 'info' });
      return true;
    }
    const { recorded } = result;
    const createdAt = Date.now();
    if (recorded) {
      recordSentTurn(
        uid,
        { ...turn, leadId: null, joinedCount: 0, createdAt },
        recorded.captureId,
      );
    }
    const entry = { undo: result.undo, at: createdAt };
    // With a recorded turn, "undo that" and the card's Undo go through its execution; the device's own undo is for a tick written without one.
    if (!recorded) lastCheckIn.current = entry;
    result.committed.catch((error: unknown) => {
      console.error('Helm check-in was not saved', error);
      if (lastCheckIn.current === entry) lastCheckIn.current = null;
      addToast({ title: HELM_COPY.habitCheckInFailed, type: 'error' });
    });
    const line = result.quietLine ?? result.line;
    if (isSpoken) say(line, createdAt);
    if (recorded) return true;
    addToast({
      title: line,
      type: 'success',
      action: {
        label: HELM_COPY.undo,
        onClick: () => {
          if (lastCheckIn.current === entry) lastCheckIn.current = null;
          void result.undo().catch((error: unknown) => {
            console.error('Helm check-in was not taken back', error);
            addToast({ title: HELM_COPY.habitUndoFailed, type: 'error' });
          });
        },
      },
    });
    return true;
  }

  /** The device-side close: drops what was pending, keeps what was done, releases the microphone when it was spoken, and offers Undo only when something was dropped. Nothing is sent to the server. */
  async function closeConversation(
    close: ClosingRead,
    isSpoken: boolean,
    now: number,
  ) {
    const state = store.getState();
    const all = selectAllCaptures(state);
    const sessionId = getOpenSessionId(
      all,
      Date.now(),
      getFreshFrom(state.helm.profile),
    );
    const executions = selectExecutionsById(state);
    const effects = readCloseEffects({
      unsentWords: [close.rest],
      captures: all.filter((capture) => capture.sessionId === sessionId),
      isFiled: (capture) =>
        capture.executionIds
          .flatMap((id) => executions.get(id) ?? [])
          .some((execution) => execution.effectRefs.length > 0),
    });
    interruptedCaptureId.current = null;
    if (isSpoken) voice.closeByPhrase();
    else voice.settle();
    setNote(null);
    if (uid && effects.left.length + effects.skipped.length > 0) {
      try {
        await closeQuestions(uid, effects);
      } catch (error) {
        console.error('Helm close was not written', error);
        say(HELM_COPY.heldActionFailed, now);
        return false;
      }
    }
    const canPutWordsBack = fieldWriter.current !== null;
    const words = canPutWordsBack ? effects.dropWords : [];
    // A close that arrives while the last one's line is still showing joins it, so Undo takes back both.
    setClosed((previous) => ({
      left: [...(previous?.left ?? []), ...effects.left],
      skipped: [...(previous?.skipped ?? []), ...effects.skipped],
      words: [...(previous?.words ?? []), ...words],
      hasDropped:
        (previous?.hasDropped ?? false) ||
        effects.left.length > 0 ||
        words.length > 0,
    }));
    window.clearTimeout(closedId.current);
    closedId.current = window.setTimeout(() => setClosed(null), CLOSED_MS);
    return true;
  }

  async function undoClose() {
    if (!closed) return;
    const { left, skipped, words } = closed;
    window.clearTimeout(closedId.current);
    try {
      if (uid && left.length + skipped.length > 0) {
        await reopenQuestions(uid, left, skipped);
      }
      if (words.length > 0) fieldWriter.current?.(words.join(' '));
      setClosed(null);
    } catch (error) {
      console.error('Helm close was not undone', error);
      addToast({ title: HELM_COPY.closedUndoFailed, type: 'error' });
    }
  }

  /** Typed Send: true when the device took the words (a close, or an answer to the open question), so the field is cleared and nothing is sent. */
  const handleTyped = (text: string, page: ScreenContext | null) => {
    isTypedSince.current = true;
    return takeOnDevice(text, {
      isSpoken: false,
      sttProvider: undefined,
      interrupted: null,
      hasPage: page !== null,
    });
  };

  const registerField = useCallback((write: (text: string) => void) => {
    fieldWriter.current = write;
    return () => {
      if (fieldWriter.current === write) fieldWriter.current = null;
    };
  }, []);

  /** The words that ask the next open question of a turn aloud, leaving out the one just settled; null when none is left. */
  function sayNextQuestion(captureId: string, settledId: string) {
    const capture = selectAllCaptures(store.getState()).find(
      (entry) => entry.id === captureId,
    );
    const isSettled = createSettledReader(selectAllCaptures(store.getState()));
    const next = capture
      ? getOpenQuestions(capture).find(
          (entry) =>
            entry.id !== settledId &&
            entry.skippedAt === null &&
            !isSettled(capture, entry.id),
        )
      : undefined;
    return next && !isTurnHeld(captureId)
      ? buildSpokenQuestion(next.question)
      : null;
  }

  /** Whether the turn kept a quiet thing off the speaker, so its questions are shown and never read out. */
  function isTurnHeld(captureId: string) {
    const state = store.getState();
    const capture = selectAllCaptures(state).find(
      (entry) => entry.id === captureId,
    );
    if (!capture) return false;
    const executions = selectExecutionsById(state);
    return (
      findHeldLine(
        [capture],
        capture.executionIds.flatMap((id) => executions.get(id) ?? []),
      ) !== null
    );
  }

  /** The first open, unskipped question (of a kind, when given) of the turn an answer goes to (`pickQuestionTurn`), with that turn. */
  function findAskedQuestion(
    now: number,
    kind: string | null = null,
    isSpoken = true,
  ) {
    const state = store.getState();
    const all = selectAllCaptures(state);
    const sessionId = getOpenSessionId(
      all,
      now,
      getFreshFrom(state.helm.profile),
    );
    const latest = pickQuestionTurn(
      all.filter((capture) => capture.sessionId === sessionId),
      !isSpoken ? 'typed' : isWakeStarted.current ? 'wake' : 'spoken',
      now,
    );
    const isSettled = createSettledReader(all);
    const asked =
      latest && latest.status === 'needsYou'
        ? getOpenQuestions(latest)
            .filter(
              (entry) =>
                entry.skippedAt === null &&
                !isSettled(latest, entry.id) &&
                !isAnswerInFlight(latest.id, entry.id),
            )
            .map((entry) => ({ captureId: latest.id, ...entry }))
            .find((entry) => kind === null || entry.question.kind === kind)
        : undefined;
    return latest && asked ? { state, latest, asked } : null;
  }

  /** Answers an open undo offer by voice and says what happened; a pick between several is finished on the card, never guessed. */
  async function answerOpenUndoOffer(
    asked: { captureId: string; id: string; question: HelmQuestion },
    optionId: string,
    turnKey: number,
  ) {
    if (!uid) return;
    if (asked.question.shape !== 'yesNo' && optionId === 'yes') {
      say(HELM_COPY.undoOfferFinishOnCard, turnKey);
      return;
    }
    try {
      const outcome = await answerUndoOffer(uid, {
        captureId: asked.captureId,
        questionId: asked.id,
        question: asked.question,
        optionId,
        by: 'voice',
      });
      const line =
        outcome.kind === 'undone'
          ? outcome.report
          : outcome.kind === 'kept'
            ? optionId === 'keep'
              ? HELM_COPY.undoOfferKeptAll
              : HELM_COPY.undoOfferKept
            : outcome.kind === 'already'
              ? HELM_COPY.questionGone('undoOffer')
              : outcome.kind === 'nothing'
                ? (outcome.report ?? HELM_COPY.cannotTakeBack)
                : outcome.kind === 'offline'
                  ? HELM_COPY.questionNeedsConnection
                  : HELM_COPY.heldActionFailed;
      const isHeld =
        (outcome.kind === 'undone' || outcome.kind === 'nothing') &&
        outcome.isHeld;
      say(line, turnKey, isHeld ? QUIET_SPOKEN_LINE : line);
    } catch (error) {
      console.error('Helm undo offer was not answered by voice', error);
      say(HELM_COPY.heldActionFailed, turnKey);
    }
  }

  /** An answer to the open question of the latest turn settles it instead of becoming a turn of its own kind: a code-built question is answered on the server, one the assistant wrote goes as an answer turn (what could not be placed goes as its words). A code-built question's reply that is none of its choices is asked again once, then goes on as a turn. */
  async function answerQuestion(
    text: string,
    sttProvider: string | undefined,
    now: number,
    isSpoken = true,
  ) {
    const found = findAskedQuestion(now, null, isSpoken);
    if (!uid || !found) return false;
    const { state, asked } = found;
    const all = selectAllCaptures(state);
    const { question } = asked;
    const askedKey = `${asked.captureId}:${asked.id}`;
    const answer = matchSpokenAnswer(text, question, {
      now,
      timeZone: state.helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC',
    });
    if (answer?.kind === 'dismiss') {
      const latest = all.find((capture) => capture.id === asked.captureId);
      try {
        await dismissQuestion(
          uid,
          asked.captureId,
          asked.id,
          latest !== undefined &&
            getOpenQuestions(latest).every((entry) => entry.id === asked.id),
        );
        say(
          [
            HELM_COPY.questionDismissed,
            sayNextQuestion(asked.captureId, asked.id),
          ]
            .filter(Boolean)
            .join(' '),
          now,
        );
      } catch (error) {
        console.error('Helm question was not dismissed by voice', error);
        say(HELM_COPY.heldActionFailed, now);
      }
      return true;
    }
    if (answer?.kind === 'skip') {
      try {
        await skipQuestion(uid, asked.captureId, asked.id);
        say(
          [
            HELM_COPY.questionSkipped,
            sayNextQuestion(asked.captureId, asked.id),
          ]
            .filter(Boolean)
            .join(' '),
          now,
        );
      } catch (error) {
        console.error('Helm question was not skipped by voice', error);
        say(HELM_COPY.heldActionFailed, now);
      }
      return true;
    }
    const isModel = question.builtBy === 'model';
    const choice =
      toKinSearchChoice(question, text, state.helm.who.items) ??
      toQuestionChoice(question, answer?.value ?? null);
    const optionId = choice && 'optionId' in choice ? choice.optionId : null;
    if (isModel ? answer === null : choice === null) {
      const isShort = text.trim().split(/\s+/).length <= ASK_AGAIN_MAX_WORDS;
      if (!isShort || askedAgain.current.has(askedKey)) return false;
      askedAgain.current.add(askedKey);
      const askAgain = question.options.some(
        (option) => option.id !== 'none' && option.id !== 'new',
      )
        ? buildAskAgainLine(question)
        : buildSpokenQuestion(question);
      say(
        askAgain,
        now,
        isTurnHeld(asked.captureId) ? QUIET_SPOKEN_LINE : askAgain,
      );
      return true;
    }
    if (isModel) {
      return answerAsTurn(asked, answer?.value ?? null, text, sttProvider);
    }
    if (choice === null) return false;
    if (question.kind === 'undoOffer' && optionId !== null) {
      await answerOpenUndoOffer(asked, optionId, now);
      return true;
    }
    if (question.kind === 'whichIsTrue' && optionId === 'none') {
      say(HELM_COPY.whichIsTrueNoneVoice, now);
      return true;
    }
    const result = await resolveQuestion(asked.captureId, asked.id, {
      by: isSpoken ? 'voice' : 'tap',
      ...choice,
    });
    if (result.kind === 'done') {
      say(
        [HELM_COPY.questionAnswered, sayNextQuestion(asked.captureId, asked.id)]
          .filter(Boolean)
          .join(' '),
        now,
      );
    } else if (result.kind === 'offline') {
      say(HELM_COPY.questionNeedsConnection, now);
    } else if (result.kind === 'gone' || result.kind === 'stale') {
      say(HELM_COPY.questionGone(question.kind), now);
    } else if (result.kind === 'failed') say(HELM_COPY.heldActionFailed, now);
    else voice.settle();
    return true;
  }

  async function answerAsTurn(
    asked: { captureId: string; id: string; question: HelmQuestion },
    value: QuestionAnswerValue | null,
    transcript: string,
    sttProvider: string | undefined,
  ) {
    if (!uid) return false;
    const stopsAtSend = stopCount.current;
    try {
      const { write, id } = await sendQuestionAnswer(uid, {
        captureId: asked.captureId,
        questionId: asked.id,
        question: asked.question,
        value,
        transcript,
        assistantName: name,
        sttProvider,
      });
      afterAnswer.current.set(id, {
        captureId: asked.captureId,
        questionId: asked.id,
      });
      trackSent(uid, id, id, write, stopsAtSend);
    } catch (error) {
      console.error('Helm spoken answer did not send', error);
      voice.settle();
      addToast({ title: HELM_COPY.talkSendFailed, type: 'error' });
    }
    return true;
  }

  /** Whether a spoken conversation is open now: listening, thinking, speaking or live, and its answer window or an awaited reply until a typed Send ends it. */
  function conversation() {
    return {
      isOpen:
        voice.isLive ||
        voice.state !== 'idle' ||
        (!isTypedSince.current &&
          (voice.isFollowUpOpen || waiting.current.size > 0)),
      isMuted: voice.isMuted,
    };
  }

  /** A choice tapped on a card: whether its turn is spoken, and once sent, its reply is said like a spoken answer's. */
  function followTap() {
    const isSpoken = isSpokenTurn('tap', conversation());
    const stopsAtSend = stopCount.current;
    return {
      isSpokenTurn: isSpoken,
      onSent: (
        sent: { id: string; write: Promise<void> },
        asked: { captureId: string; questionId: string },
      ) => {
        if (!uid || !isSpoken) return;
        afterAnswer.current.set(sent.id, asked);
        trackSent(uid, sent.id, sent.id, sent.write, stopsAtSend);
      },
    };
  }

  /** Waits for the sorted reply of a sent turn so it is said once, and gives up the wait when the device is offline. */
  function trackSent(
    uid: string,
    id: string,
    leadId: string,
    write: Promise<void>,
    stopsAtSend: number,
  ) {
    write.catch((error: unknown) => {
      clearSentTurn(uid, id);
      waiting.current.delete(leadId);
      console.error('Helm spoken turn did not send', error);
      voice.settle();
      addToast({ title: HELM_COPY.talkSendFailed, type: 'error' });
    });
    if (stopCount.current !== stopsAtSend) return;
    waiting.current.add(leadId);
    window.clearTimeout(offlineId.current);
    offlineId.current = window.setTimeout(
      () => {
        if (!waiting.current.has(leadId) || navigator.onLine) return;
        waiting.current.delete(leadId);
        voice.settle();
        showNote(HELM_COPY.talkSavedOffline);
      },
      navigator.onLine ? OFFLINE_WAIT_MS : 0,
    );
  }

  async function sendTurn(
    text: string,
    sttProvider: string,
    interrupted: string | null,
    isFinish: boolean,
    heardNames?: HeardName[],
  ) {
    const { helm } = store.getState();
    if (!uid || helm.keyStatus !== 'ready' || !helm.recentCaptures.isLoaded) {
      voice.settle();
      showNote(HELM_COPY.talkNotReady);
      return;
    }
    const timeZone = helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
    const turn = { ...getNextTurn(), createdAt: Date.now() };
    const stopsAtSend = stopCount.current;
    const startedByWake = isWakeStarted.current;
    isWakeStarted.current = false;
    const fail = (error: unknown) => {
      console.error('Helm spoken turn did not send', error);
      voice.settle();
      addToast({ title: HELM_COPY.talkSendFailed, type: 'error' });
    };
    try {
      const encryption = await getHelmEncryption(uid);
      const reading = applyReadingEdits(
        readCapture(text.trimStart(), {
          now: turn.createdAt,
          timeZone,
          assistantName: name,
        }),
        { dismissed: [], days: {}, timeZone },
      );
      const { write, id } = await sendCapture(uid, encryption, {
        text,
        reading,
        screen: screen.current,
        answersQuestion: null,
        questionAnswer: null,
        noteIds: rankStoredNotes(text),
        ...(heardNames ? { heardNames } : {}),
        ...turn,
        voice: {
          sttProvider,
          interruptedCaptureId: interrupted,
        },
        isSpokenTurn: isSpokenTurn('spoken', conversation()),
        presence: { startedByWake, ...readPresence() },
        onRepeat: (captureId) => {
          waiting.current.delete(captureId);
          clearSentTurn(uid, captureId);
          voice.settle();
          repeatLast(turn.createdAt);
        },
      });
      recordSentTurn(uid, turn, id);
      if (isFinish) finishedIds.current.add(turn.leadId ?? id);
      trackSent(uid, id, turn.leadId ?? id, write, stopsAtSend);
    } catch (error) {
      fail(error);
    }
  }

  async function undoLatest(now: number) {
    const state = store.getState();
    const all = selectAllCaptures(state);
    const sessionId = getOpenSessionId(
      all,
      now,
      getFreshFrom(state.helm.profile),
    );
    const isTurnPending =
      waiting.current.size > 0 ||
      all.some(
        (capture) =>
          capture.sessionId === sessionId &&
          (capture.status === 'received' || capture.status === 'interpreting'),
      );
    if (isTurnPending) {
      say(HELM_COPY.undoWhilePending, now);
      return;
    }
    const executions = selectExecutionsById(state);
    const latest = all
      .filter((capture) => capture.sessionId === sessionId)
      .flatMap((capture) => capture.executionIds)
      .flatMap((id) => executions.get(id) ?? [])
      .filter(canUndo)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    const checkIn = lastCheckIn.current;
    if (checkIn && (!latest || checkIn.at > latest.createdAt)) {
      lastCheckIn.current = null;
      try {
        await checkIn.undo();
        say(HELM_COPY.habitCheckInTakenBack, now);
      } catch (error) {
        console.error('Helm check-in undo by voice failed', error);
        say(HELM_COPY.undoFailed, now);
      }
      return;
    }
    if (!uid || !latest) {
      say(HELM_COPY.nothingToUndo, now);
      return;
    }
    try {
      const isHeld = isExecutionHeld(latest);
      const result = await takeBack(uid, latest.id, {
        reason: { reason: 'unclear', quote: null, via: 'voice' },
      });
      if (result.kind === 'done')
        say(result.report, now, isHeld ? QUIET_SPOKEN_LINE : result.report);
      else if (result.kind === 'refused') {
        const refusal = result.report ?? HELM_COPY.cannotTakeBack;
        say(refusal, now, isHeld ? QUIET_SPOKEN_LINE : refusal);
      } else say(HELM_COPY.undoNeedsConnectionTitle, now);
    } catch (error) {
      console.error('Helm undo by voice failed', error);
      say(HELM_COPY.undoFailed, now);
    }
  }

  async function deliver(
    capture: OpenCapture,
    line: string,
    delivery?: SpeechDelivery,
  ) {
    voice.settle();
    // Nothing shows the voice on this view (no Stop, no Mute), so the written reply stands alone.
    if (!isSurfaceShown.current) return;
    speakingCaptureId.current = capture.id;
    const result = await voice.speak(line, {
      priority: 'reply',
      turnKey: capture.createdAt,
      canAnswer:
        capture.isSpokenTurn === true &&
        isHandsFreeOn &&
        isSurfaceShown.current &&
        !finishedIds.current.has(capture.id),
      ...(delivery && { delivery }),
    });
    if (delivery && result.status === 'failed') {
      showNote(whisperFailedNote());
    }
    if (speakingCaptureId.current === capture.id) {
      speakingCaptureId.current = null;
    }
    if (uid && result.status === 'spoken' && result.adapterId !== null) {
      markCaptureSpoken(uid, capture.id, result.adapterId).catch(
        (error: unknown) => console.error('Helm voice was not recorded', error),
      );
    }
  }

  useEffect(() => {
    onSettled.current = () => {
      if (!uid) return;
      [...waiting.current].forEach((leadId) => {
        const capture = captures.find((entry) => entry.id === leadId);
        if (
          !capture ||
          capture.status === 'received' ||
          capture.status === 'interpreting'
        ) {
          return;
        }
        const missing = capture.executionIds.filter(
          (id) => !executionsById.has(id) && !failedIds.includes(id),
        );
        const isSettledWithLines =
          capture.status === 'sorted' || capture.status === 'needsYou';
        if (isSettledWithLines && missing.length > 0) {
          void loadExecutionsById(uid, missing);
          return;
        }
        waiting.current.delete(leadId);
        const zone =
          store.getState().helm.profile?.timeZone ??
          getDeviceTimeZone() ??
          'UTC';
        const turnExecutions = capture.executionIds.flatMap(
          (id) => executionsById.get(id) ?? [],
        );
        const isHeld = findHeldLine([capture], turnExecutions) !== null;
        const spoken = isSettledWithLines
          ? isHeld
            ? QUIET_SPOKEN_LINE
            : (turnExecutions.find((execution) => execution.spoken !== null)
                ?.spoken ?? capture.line)
          : null;
        const answered = afterAnswer.current.get(leadId);
        afterAnswer.current.delete(leadId);
        if (isSettledWithLines && capture.asksHeldLine) {
          answerHeldAsk(capture);
          return;
        }
        const reply =
          spoken ??
          (capture.status === 'sorted' && capture.planDayKey
            ? HELM_COPY.planningDaySpoken(
                formatDayName(capture.planDayKey, toDayKey(Date.now(), zone)),
              )
            : null);
        const next = answered
          ? sayNextQuestion(answered.captureId, answered.questionId)
          : null;
        const line = [reply, next].filter(Boolean).join(' ') || null;
        if (line === null) voice.settle();
        else void deliver(capture, line);
      });
    };
  });

  useEffect(() => {
    onSettled.current();
  }, [captures, executionsById, failedIds, uid]);

  // A turn the assistant's own reading closed ("ugh, doesn't matter") gets the same close as a phrase matched here, once, and only when this tab sent it and it is still the newest turn of the open session.
  const appliedCloses = useRef(new Set<string>());
  const applyClose = useRef(closeConversation);
  useEffect(() => {
    applyClose.current = closeConversation;
  });
  useEffect(() => {
    const now = Date.now();
    const newest = captures.at(-1);
    const openSessionId = getOpenSessionId(
      captures,
      now,
      getFreshFrom(store.getState().helm.profile),
    );
    const fresh = captures.filter(
      (capture) =>
        capture.endedConversation && !appliedCloses.current.has(capture.id),
    );
    fresh.forEach((capture) => appliedCloses.current.add(capture.id));
    fresh
      .filter(
        (capture) =>
          capture.sortedAt !== null &&
          now - capture.sortedAt < CLOSE_FRESH_MS &&
          wasSentHere(capture.id) &&
          capture.id === newest?.id &&
          capture.sessionId === openSessionId,
      )
      .forEach((capture) =>
        queueMicrotask(
          () =>
            void applyClose.current(
              { kind: 'dismiss', position: 'whole', rest: '' },
              capture.inputMode === 'voice',
              now,
            ),
        ),
      );
  }, [captures]);

  useEffect(
    () => () => {
      window.clearTimeout(noteId.current);
      window.clearTimeout(offlineId.current);
      window.clearTimeout(closedId.current);
    },
    [],
  );

  /** Says whether this view shows the voice (home's dock or the conversation over a page). Leaving it throws away words being heard and cuts off a line being said; a turn being worked on carries on and its reply stays written. */
  const setSurfaceShown = (isShown: boolean) => {
    const wasShown = isSurfaceShown.current;
    isSurfaceShown.current = isShown;
    if (isShown || !wasShown) return;
    const { state, isStarting } = voice;
    queueMicrotask(() => {
      if (state === 'listening' || isStarting) {
        interruptedCaptureId.current = null;
        endDictation();
        voice.cancel();
      } else if (state === 'speaking') voice.stop();
      else if (state === 'thinking') {
        waiting.current.clear();
        voice.settle();
      }
    });
  };

  const isListeningForAnswer =
    voice.isFollowUpOpen || (voice.isLive && voice.state === 'listening');

  // Each time it listens for an answer, the question an answer would go to is marked on its card.
  useEffect(() => {
    if (!isListeningForAnswer) return;
    const found = findAskedQuestion(Date.now());
    askedStore.set(
      found
        ? {
            captureId: found.asked.captureId,
            questionId: found.asked.id,
            question: found.asked.question,
            wakeUntil:
              (found.latest.sortedAt ?? found.latest.createdAt) +
              OPEN_QUESTION_MS,
          }
        : null,
    );
  }, [isListeningForAnswer, askedStore]);

  useEffect(() => () => askedStore.set(null), [uid, askedStore]);

  /** Starts listening from `page` (what the page publishes, null from home), as a live conversation when that setting is on and the listen isn't a one-off (dictation), or sends what is being said, or stops what is working or speaking. */
  const talk = (page: ScreenContext | null, isOneOff = false) => {
    const isLive = isHandsFreeOn && !isOneOff;
    isWakeStarted.current = false;
    // An answer window or a line being said gives way to listening: the tap is the answer.
    if (
      voice.isAvailable &&
      (voice.isFollowUpOpen || voice.state === 'speaking')
    ) {
      if (voice.state === 'speaking') {
        waiting.current.clear();
        stopCount.current += 1;
      }
      return startListening(page, isLive);
    }
    if (voice.state !== 'idle' || voice.isStarting) {
      if (voice.state !== 'listening' && !voice.isStarting) {
        waiting.current.clear();
        stopCount.current += 1;
      }
      // The turn was already sent: Stop ends the wait and the spoken line, never the filing.
      if (voice.state === 'thinking')
        showNote(HELM_COPY.talkStoppedWhileWorking);
      voice.stop();
      return 'stopped' as const;
    }
    if (!navigator.onLine && !onDevice.isOn) {
      showNotice(
        onDevice.block === null
          ? HELM_COPY.talkNeedsConnection
          : HELM_COPY.talkNeedsConnectionBlocked,
        onDevice.block === null,
      );
      return 'blocked' as const;
    }
    if (!voice.isAvailable) {
      const isMicrophone = voice.unavailableReason === 'no-permission';
      showNotice(
        isMicrophone
          ? HELM_COPY.talkNeedsMicrophone
          : HELM_COPY.talkNeedsRecognition,
        false,
        isMicrophone,
      );
      return 'blocked' as const;
    }
    return startListening(page, isLive);
  };

  function prepareListening(page: ScreenContext | null) {
    // A listen that ended on an error never says so, so each new one starts as a turn.
    endDictation();
    screen.current = page;
    clearRestored();
    setClosed(null);
    setNotice(null);
    setHasNoticeDoor(false);
    setNeedsMicrophone(false);
    setShowsPhoneLine(false);
    interruptedCaptureId.current = null;
  }

  function startListening(page: ScreenContext | null, isLive: boolean) {
    prepareListening(page);
    if (isLive && !voice.isLive) voice.startLive();
    else voice.listen();
    return 'started' as const;
  }

  const dictate = (write: (text: string) => void, owner: string) => {
    const isHearing = voice.state === 'listening' || voice.isStarting;
    if (dictation.current !== null && isHearing) {
      voice.stop();
      return 'stopped' as const;
    }
    if (voice.state !== 'idle' || voice.isStarting) return 'blocked' as const;
    const result = talk(null, true);
    if (result === 'started') {
      dictation.current = write;
      setDictationOwner(owner);
    }
    return result;
  };

  // A listen that ends on a lasting error (the mic refused) reports nothing, so the owner counts only while it listens.
  const liveOwner = voice.state === 'listening' ? dictationOwner : null;

  const live = useMemo(
    () => readSwappedWords(voice.heard, nameRecords, restored),
    [voice.heard, nameRecords, restored],
  );

  return {
    ...voice,
    heard: dictationOwner === null ? live.text : voice.heard,
    heardSwaps: dictationOwner === null ? live.swaps : [],
    restoreHeard,
    isDictating: liveOwner !== null,
    dictationOwner: liveOwner,
    dictate,
    cancel: () => {
      endDictation();
      voice.cancel();
    },
    note,
    notice,
    showsPhoneLine,
    hasNoticeDoor,
    /** The notice is about a blocked microphone, so the screen offers the way to allow it. */
    needsMicrophone,
    openVoiceSettings,
    clearNotice: () => {
      setNotice(null);
      setHasNoticeDoor(false);
      setNeedsMicrophone(false);
    },
    talk,
    /** Ends the live conversation: what is being heard is dropped and a reply on its way is written, not said. */
    endLive: endLiveNow,
    setSurfaceShown,
    /** The quiet line after a close: Undo is offered only when something was dropped; null when none is showing. */
    closed: closed === null ? null : { hasDropped: closed.hasDropped },
    undoClose,
    handleTyped,
    handleCheckIn: (text: string) => takeCheckIn(text, false),
    registerField,
    /** A tapped choice: whether its turn is spoken, and how to have its reply said. */
    followTap,
    /** The question a reply last said aloud, which its card marks as listened for. */
    askedAloud,
    /** The wake phrase is on here, so a question asked aloud can still be answered with it for a while. */
    canWakeAnswer: isWakeWordOn && keyStatus === 'ready',
    /** Plays a line the person tapped again, or says why it can't right now. */
    replay: (line: string) => sayRepeatRefusal(voice.repeat(line), Date.now()),
    /** Says the line a turn kept off the speaker, whispered by default; never in the usual voice when the whisper can't play. */
    sayHeldAloud,
  };
}

export type HelmVoice = ReturnType<typeof useHelmVoice>;

export const HelmVoiceContext = createContext<HelmVoice | null>(null);

export function useHelmVoiceContext() {
  const voice = useContext(HelmVoiceContext);
  if (voice === null) throw new Error('Helm voice is not provided.');
  return voice;
}

/** Whether this field is the one being spoken into: only one field listens at a time. */
export function useIsDictatingHere(owner: string) {
  const voice = useHelmVoiceContext();
  return voice.dictationOwner === owner;
}
