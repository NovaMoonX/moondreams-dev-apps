import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { httpsCallable } from 'firebase/functions';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useOnDeviceRecognition } from '@/hooks/useOnDeviceRecognition';
import { useVoiceConversation } from '@/hooks/useVoiceConversation';
import type { ClosingRead } from '@/lib/speech/closingPhrase';
import { toPlainText } from '@/lib/speech/speechText';
import type { VoiceIdentity } from '@/lib/speech/voice/types';
import {
  createVoiceTokenSource,
  type MintVoiceTokenRequest,
  type MintVoiceTokenResult,
} from '@/lib/speech/voice/voiceToken';
import { store, useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { END_PHRASES, HELM_COPY, SESSION_IDLE_MS } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
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
import { toQuestionChoice } from '@apps/helm/utils/questionChoice';
import {
  closeQuestions,
  loadExecutionsById,
  markCaptureSpoken,
  reopenQuestions,
  type QuestionRef,
  rankStoredNotes,
  sendCapture,
  wasSentHere,
  skipQuestion,
} from '@apps/helm/store/actions/captureActions';
import { VIEW_KINDS } from '@apps/helm/screen/views';
import { formatDayName, toDayKey } from '@apps/helm/utils/planDays';
import { selectTopScreen } from '@apps/helm/store/screenSlice';
import {
  isAnswerInFlight,
  sendQuestionAnswer,
} from '@apps/helm/store/actions/questionActions';
import { takeBack } from '@apps/helm/store/actions/undoActions';
import {
  selectAllCaptures,
  selectExecutionsById,
} from '@apps/helm/store/selectors/captureSelectors';
import type {
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
import {
  readCloseEffects,
  readDeviceTurn,
} from '@apps/helm/utils/closeConversation';
import { matchSpokenAnswer } from '@apps/helm/utils/questionAnswers';
import {
  buildAskAgainLine,
  buildSpokenQuestion,
} from '@apps/helm/utils/spokenQuestion';
import { getOpenSessionId } from '@apps/helm/utils/sessions';
import { readPresence } from '@apps/helm/utils/presence';
import { toWakeSpellings } from '@apps/helm/utils/voicePhrases';

const NOTE_MS = 6000;
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

/** Helm's voice: talking writes a spoken turn like a typed one, the line the server sealed for it is said once the turn is sorted, and "undo that" takes the open session's latest turn back. One instance serves home and the conversation over a page. */
export function useHelmVoice() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const name = useAssistantName();
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
  const captures = useAppSelector(selectAllCaptures);
  const executionsById = useAppSelector(selectExecutionsById);
  const failedIds = useAppSelector((state) => state.helm.failedExecutionIds);
  const screen = useRef<ScreenContext | null>(null);
  const isWakeStarted = useRef(false);
  const noteId = useRef(0);
  const waiting = useRef(new Set<string>());
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

  const voice = useVoiceConversation({
    lang,
    isOnDeviceReady: onDevice.isOn,
    identity: voiceIdentity,
    endPhrases: END_PHRASES,
    readsClose: true,
    conversationIdleMs: SESSION_IDLE_MS,
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
    onCloudHeld: () => setShowsPhoneLine(true),
    onBargeIn: () => {
      interruptedCaptureId.current = speakingCaptureId.current;
    },
    // A utility screen with no ask bar has nowhere to show the conversation, so it never listens for the phrase.
    wake: {
      isOn:
        isWakeWordOn &&
        keyStatus === 'ready' &&
        (isHomeView || topScreen !== null),
      spellings: toWakeSpellings(name),
      onWake: wakeUp,
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

  function endDictation() {
    dictation.current = null;
    setDictationOwner(null);
  }

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

  function say(line: string) {
    voice.settle();
    showNote(line);
    void voice.speak(line, {
      priority: 'reply',
      turnKey: Date.now(),
      canAnswer: isHandsFreeOn && isSurfaceShown.current,
    });
  }

  /** The phrase was heard: it starts what a Talk tap starts, from the page in front, or sends the words that came with it. */
  function wakeUp(rest: string | null, heardBy: { sttProvider: string }) {
    if (!voice.isAvailable) return false;
    endDictation();
    const page = isHomeView
      ? null
      : (selectTopScreen(store.getState())?.context ?? null);
    const isStarted =
      rest === null
        ? talk(page) === 'started'
        : sendHeard(rest, page, heardBy.sttProvider);
    if (isStarted) isWakeStarted.current = true;
    if (isStarted && page !== null && !isAskRequested) void openAsk();
    return isStarted;
  }

  function sendHeard(
    text: string,
    page: ScreenContext | null,
    sttProvider: string,
  ) {
    screen.current = page;
    setNotice(null);
    setHasNoticeDoor(false);
    setNeedsMicrophone(false);
    setShowsPhoneLine(false);
    interruptedCaptureId.current = null;
    return voice.submit(text, sttProvider);
  }

  async function handleUtterance(text: string, sttProvider: string) {
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
    await takeOnDevice(text, {
      isSpoken: true,
      sttProvider,
      interrupted,
      hasPage: screen.current !== null,
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
    },
  ) {
    const { isSpoken, sttProvider, interrupted } = opts;
    // eslint-disable-next-line react-hooks/purity -- runs from a heard phrase or a Send; the compiler flags every clock read once the answer path calls the sender
    const now = Date.now();
    const state = store.getState();
    const timeZone =
      state.helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
    const asked = findAsked(isSpoken, now);
    const turn = readDeviceTurn({
      text,
      isSpoken,
      isTalkedOver: interrupted !== null,
      question: asked?.question ?? null,
      isPending: asked !== undefined || waiting.current.size > 0,
      hasPage: opts.hasPage,
      extra: [toPlainText(name), ...toWakeSpellings(name)],
      now,
      timeZone,
    });
    if (turn.kind === 'undo') {
      await undoLatest();
      return true;
    }
    if (turn.kind === 'stopVoice') {
      voice.settle();
      startListening(screen.current);
      return true;
    }
    if (turn.kind === 'close') {
      if (await closeConversation(turn.close, isSpoken)) return true;
      // A typed close that was not written keeps its words in the field; a spoken one puts what was heard there.
      if (!isSpoken) return 'kept' as const;
      if (fieldWriter.current) fieldWriter.current(text);
      else say(HELM_COPY.talkSendFailed);
      return true;
    }
    if (!isSpoken) {
      return turn.kind === 'answer'
        ? answerQuestion(text, sttProvider, now, false)
        : false;
    }
    const said = turn.kind === 'send' ? turn.text : text;
    if (await answerQuestion(said, sttProvider, now, true)) return true;
    await sendTurn(
      said,
      sttProvider ?? 'browser',
      interrupted,
      turn.kind === 'send' && turn.isFinish,
    );
    return true;
  }

  /** The device-side close: drops what was pending, keeps what was done, releases the microphone when it was spoken, and offers Undo only when something was dropped. Nothing is sent to the server. */
  async function closeConversation(close: ClosingRead, isSpoken: boolean) {
    const state = store.getState();
    const all = selectAllCaptures(state);
    const sessionId = getOpenSessionId(all, Date.now());
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
        say(HELM_COPY.heldActionFailed);
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
  const handleTyped = (text: string, page: ScreenContext | null) =>
    takeOnDevice(text, {
      isSpoken: false,
      sttProvider: undefined,
      interrupted: null,
      hasPage: page !== null,
    });

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
    const next = capture
      ? getOpenQuestions(capture).find(
          (entry) => entry.id !== settledId && entry.skippedAt === null,
        )
      : undefined;
    return next ? buildSpokenQuestion(next.question) : null;
  }

  /** The open question of the latest turn that can be answered by words: a spoken turn's for a spoken answer, any turn's for a typed one. */
  function findAsked(isSpoken: boolean, now: number) {
    const all = selectAllCaptures(store.getState());
    const sessionId = getOpenSessionId(all, now);
    const latest = all
      .filter((capture) => capture.sessionId === sessionId)
      .reverse()
      .find((capture) => capture.answersQuestion === null);
    return latest &&
      (!isSpoken || latest.inputMode === 'voice') &&
      latest.status === 'needsYou'
      ? getOpenQuestions(latest)
          .filter(
            (entry) =>
              entry.skippedAt === null &&
              !isAnswerInFlight(latest.id, entry.id),
          )
          .map((entry) => ({ captureId: latest.id, ...entry }))[0]
      : undefined;
  }

  /** An answer to the open question of the latest turn settles it instead of becoming a turn of its own kind: a code-built question is answered on the server, one the assistant wrote goes as an answer turn (what could not be placed goes as its words). A code-built question's reply that is none of its choices is asked again once, then goes on as a turn. */
  async function answerQuestion(
    text: string,
    sttProvider: string | undefined,
    now: number,
    isSpoken: boolean,
  ) {
    const state = store.getState();
    const asked = findAsked(isSpoken, now);
    if (!uid || !asked) return false;
    const { question } = asked;
    const askedKey = `${asked.captureId}:${asked.id}`;
    const answer = matchSpokenAnswer(text, question, {
      now,
      timeZone: state.helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC',
    });
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
        );
      } catch (error) {
        console.error('Helm question was not skipped by voice', error);
        say(HELM_COPY.heldActionFailed);
      }
      return true;
    }
    const isModel = question.builtBy === 'model';
    const choice = toQuestionChoice(question, answer?.value ?? null);
    const optionId = choice && 'optionId' in choice ? choice.optionId : null;
    if (isModel ? answer === null : choice === null) {
      const isShort = text.trim().split(/\s+/).length <= ASK_AGAIN_MAX_WORDS;
      if (!isShort || askedAgain.current.has(askedKey)) return false;
      askedAgain.current.add(askedKey);
      say(
        question.options.some(
          (option) => option.id !== 'none' && option.id !== 'new',
        )
          ? buildAskAgainLine(question)
          : buildSpokenQuestion(question),
      );
      return true;
    }
    if (isModel) {
      return answerAsTurn(asked, answer?.value ?? null, text, sttProvider);
    }
    if (choice === null) return false;
    if (question.kind === 'whichIsTrue' && optionId === 'none') {
      say(HELM_COPY.whichIsTrueNoneVoice);
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
      );
    } else if (result.kind === 'offline') {
      say(HELM_COPY.questionNeedsConnection);
    } else if (result.kind === 'gone' || result.kind === 'stale') {
      say(HELM_COPY.questionGone(question.kind));
    } else if (result.kind === 'failed') say(HELM_COPY.heldActionFailed);
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
        ...turn,
        voice: {
          sttProvider,
          interruptedCaptureId: interrupted,
        },
        presence: { startedByWake, ...readPresence() },
      });
      recordSentTurn(uid, turn, id);
      if (isFinish) finishedIds.current.add(turn.leadId ?? id);
      trackSent(uid, id, turn.leadId ?? id, write, stopsAtSend);
    } catch (error) {
      fail(error);
    }
  }

  async function undoLatest() {
    const state = store.getState();
    const all = selectAllCaptures(state);
    const sessionId = getOpenSessionId(all, Date.now());
    const isTurnPending =
      waiting.current.size > 0 ||
      all.some(
        (capture) =>
          capture.sessionId === sessionId &&
          (capture.status === 'received' || capture.status === 'interpreting'),
      );
    if (isTurnPending) {
      say(HELM_COPY.undoWhilePending);
      return;
    }
    const executions = selectExecutionsById(state);
    const latest = all
      .filter((capture) => capture.sessionId === sessionId)
      .flatMap((capture) => capture.executionIds)
      .flatMap((id) => executions.get(id) ?? [])
      .filter(canUndo)
      .sort((a, b) => b.createdAt - a.createdAt)[0];
    if (!uid || !latest) {
      say(HELM_COPY.nothingToUndo);
      return;
    }
    try {
      const result = await takeBack(uid, latest.id);
      if (result.kind === 'done') say(result.report);
      else if (result.kind === 'refused') {
        say(result.report ?? HELM_COPY.cannotTakeBack);
      } else say(HELM_COPY.undoNeedsConnectionTitle);
    } catch (error) {
      console.error('Helm undo by voice failed', error);
      say(HELM_COPY.undoFailed);
    }
  }

  async function deliver(capture: OpenCapture, line: string) {
    voice.settle();
    // Nothing shows the voice on this view (no Stop, no Mute), so the written reply stands alone.
    if (!isSurfaceShown.current) return;
    speakingCaptureId.current = capture.id;
    const result = await voice.speak(line, {
      priority: 'reply',
      turnKey: capture.createdAt,
      canAnswer:
        capture.inputMode === 'voice' &&
        isHandsFreeOn &&
        isSurfaceShown.current &&
        !finishedIds.current.has(capture.id),
    });
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
        const spoken = isSettledWithLines
          ? (capture.executionIds
              .flatMap((id) => executionsById.get(id) ?? [])
              .find((execution) => execution.spoken !== null)?.spoken ??
            capture.line)
          : null;
        const answered = afterAnswer.current.get(leadId);
        afterAnswer.current.delete(leadId);
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
    const openSessionId = getOpenSessionId(captures, now);
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
    const { state } = voice;
    queueMicrotask(() => {
      if (state === 'listening') {
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

  /** Starts listening from `page` (what the page publishes, null from home), or sends what is being said, or stops what is working or speaking. */
  const talk = (page: ScreenContext | null) => {
    // An answer window or a line being said gives way to listening: the tap is the answer.
    if (
      voice.isAvailable &&
      (voice.isFollowUpOpen || voice.state === 'speaking')
    ) {
      if (voice.state === 'speaking') {
        waiting.current.clear();
        stopCount.current += 1;
      }
      return startListening(page);
    }
    if (voice.state !== 'idle') {
      if (voice.state !== 'listening') {
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
    return startListening(page);
  };

  function startListening(page: ScreenContext | null) {
    // A listen that ended on an error never says so, so each new one starts as a turn.
    endDictation();
    screen.current = page;
    setClosed(null);
    setNotice(null);
    setHasNoticeDoor(false);
    setNeedsMicrophone(false);
    setShowsPhoneLine(false);
    interruptedCaptureId.current = null;
    voice.listen();
    return 'started' as const;
  }

  const dictate = (write: (text: string) => void, owner: string) => {
    if (dictation.current !== null && voice.state === 'listening') {
      voice.stop();
      return 'stopped' as const;
    }
    if (voice.state !== 'idle') return 'blocked' as const;
    const result = talk(null);
    if (result === 'started') {
      dictation.current = write;
      setDictationOwner(owner);
    }
    return result;
  };

  // A listen that ends on a lasting error (the mic refused) reports nothing, so the owner counts only while it listens.
  const liveOwner = voice.state === 'listening' ? dictationOwner : null;

  return {
    ...voice,
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
    setSurfaceShown,
    /** The quiet line after a close: Undo is offered only when something was dropped; null when none is showing. */
    closed: closed === null ? null : { hasDropped: closed.hasDropped },
    undoClose,
    handleTyped,
    registerField,
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
