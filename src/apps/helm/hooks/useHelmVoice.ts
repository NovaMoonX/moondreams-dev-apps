import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { getToken } from 'firebase/app-check';
import { httpsCallable } from 'firebase/functions';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useOnDeviceRecognition } from '@/hooks/useOnDeviceRecognition';
import { useVoiceConversation } from '@/hooks/useVoiceConversation';
import { createSpeechSource } from '@/lib/speech/voice/speechSource';
import type { VoiceIdentity } from '@/lib/speech/voice/types';
import {
  createVoiceTokenSource,
  type MintVoiceTokenRequest,
  type MintVoiceTokenResult,
} from '@/lib/speech/voice/voiceToken';
import { store, useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { END_PHRASES, HELM_COPY } from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import { useHelmUrlState } from '@apps/helm/hooks/useHelmUrlState';
import {
  clearSentTurn,
  getNextTurn,
  recordSentTurn,
} from '@apps/helm/hooks/useSession';
import {
  app,
  appCheck,
  auth,
  functions,
  isUsingFirebaseEmulators,
} from '@lib/firebase/config';
import { canUndo } from '@apps/helm/nomos/planUndo';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { resolveQuestion } from '@apps/helm/queries/nomosMutations';
import { toQuestionChoice } from '@apps/helm/utils/questionChoice';
import {
  loadExecutionsById,
  markCaptureSpoken,
  rankStoredNotes,
  sendCapture,
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
import { matchSpokenAnswer } from '@apps/helm/utils/questionAnswers';
import {
  buildAskAgainLine,
  buildSpokenQuestion,
} from '@apps/helm/utils/spokenQuestion';
import { getOpenSessionId } from '@apps/helm/utils/sessions';
import { isUndoPhrase, toWakeSpellings } from '@apps/helm/utils/voicePhrases';

const NOTE_MS = 6000;
// A turn still unsorted this long after it was sent while offline stops the wait; it is filed once the connection is back.
const OFFLINE_WAIT_MS = 20_000;
const ASK_AGAIN_MAX_WORDS = 3;

const mintVoiceToken = httpsCallable<
  MintVoiceTokenRequest,
  MintVoiceTokenResult
>(functions, 'mintVoiceToken');

const getSpeechUrl = () => {
  const { projectId } = app.options;
  return isUsingFirebaseEmulators
    ? `http://${window.location.hostname}:5001/${projectId}/us-central1/streamSpeech`
    : `https://us-central1-${projectId}.cloudfunctions.net/streamSpeech`;
};

const getSpeechHeaders = async () => {
  const { currentUser } = auth;
  if (!currentUser || !appCheck) return null;
  const [idToken, appCheckToken] = await Promise.all([
    currentUser.getIdToken(),
    getToken(appCheck),
  ]);
  return {
    Authorization: `Bearer ${idToken}`,
    'X-Firebase-AppCheck': appCheckToken.token,
  };
};

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
  const captures = useAppSelector(selectAllCaptures);
  const executionsById = useAppSelector(selectExecutionsById);
  const failedIds = useAppSelector((state) => state.helm.failedExecutionIds);
  const screen = useRef<ScreenContext | null>(null);
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
  const [tokenSource] = useState(() =>
    createVoiceTokenSource({
      appId: 'helm',
      mint: async (request) => (await mintVoiceToken(request)).data,
    }),
  );
  const [speechSource] = useState(() =>
    createSpeechSource({
      appId: 'helm',
      url: getSpeechUrl(),
      getHeaders: getSpeechHeaders,
    }),
  );
  const voiceMode = useAppSelector((state) => state.helm.profile?.voiceMode);
  const isWakeWordOn = useAppSelector(
    (state) => state.helm.profile?.isWakeWordOn ?? false,
  );
  const isHandsFreeOn = useAppSelector(
    (state) => state.helm.profile?.isHandsFreeOn ?? true,
  );
  const keyStatus = useAppSelector((state) => state.helm.keyStatus);
  const topScreen = useAppSelector(selectTopScreen);
  const { view, isAskRequested, openAsk } = useHelmUrlState();
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
    onUtterance: (text, heardBy) => {
      void handleUtterance(text, heardBy.sttProvider);
    },
    onNothingHeard: (isAsked) => {
      interruptedCaptureId.current = null;
      if (isAsked) showNote(HELM_COPY.talkHeardNothing);
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
    },
  });

  function showNote(text: string) {
    setNote(text);
    window.clearTimeout(noteId.current);
    noteId.current = window.setTimeout(() => setNote(null), NOTE_MS);
  }

  function say(line: string) {
    voice.settle();
    showNote(line);
    void voice.speak(line, {
      priority: 'ack',
      turnKey: Date.now(),
      canAnswer: isHandsFreeOn && isSurfaceShown.current,
    });
  }

  /** The phrase was heard: it starts what a Talk tap starts, from the page in front, or sends the words that came with it. */
  function wakeUp(rest: string | null, heardBy: { sttProvider: string }) {
    if (!voice.isAvailable) return false;
    const page = isHomeView
      ? null
      : (selectTopScreen(store.getState())?.context ?? null);
    const isStarted =
      rest === null
        ? talk(page) === 'started'
        : sendHeard(rest, page, heardBy.sttProvider);
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
    setShowsPhoneLine(false);
    interruptedCaptureId.current = null;
    return voice.submit(text, sttProvider);
  }

  async function handleUtterance(text: string, sttProvider: string) {
    const interrupted = interruptedCaptureId.current;
    interruptedCaptureId.current = null;
    if (isUndoPhrase(text)) {
      await undoLatest();
      return;
    }
    // eslint-disable-next-line react-hooks/purity -- runs from a heard phrase; the compiler flags every clock read once the answer path calls the sender
    if (await answerQuestion(text, sttProvider, Date.now())) return;
    await sendTurn(text, sttProvider, interrupted);
  }

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

  /** An answer to the open question of the latest spoken turn settles it instead of becoming a turn of its own kind: a code-built question is answered on the server, one the assistant wrote goes as an answer turn (what could not be placed goes as its words). A code-built question's reply that is none of its choices is asked again once, then goes on as a turn. */
  async function answerQuestion(
    text: string,
    sttProvider: string,
    now: number,
  ) {
    const state = store.getState();
    const all = selectAllCaptures(state);
    const sessionId = getOpenSessionId(all, now);
    const latest = all
      .filter((capture) => capture.sessionId === sessionId)
      .reverse()
      .find((capture) => capture.answersQuestion === null);
    const asked =
      latest?.inputMode === 'voice' && latest.status === 'needsYou'
        ? getOpenQuestions(latest)
            .filter(
              (entry) =>
                entry.skippedAt === null &&
                !isAnswerInFlight(latest.id, entry.id),
            )
            .map((entry) => ({ captureId: latest.id, ...entry }))[0]
        : undefined;
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
      by: 'voice',
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
    sttProvider: string,
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
      });
      recordSentTurn(uid, turn, id);
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
      priority: 'ack',
      turnKey: capture.createdAt,
      canAnswer:
        capture.inputMode === 'voice' &&
        isHandsFreeOn &&
        isSurfaceShown.current,
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

  useEffect(
    () => () => {
      window.clearTimeout(noteId.current);
      window.clearTimeout(offlineId.current);
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
    if (!voice.isAvailable) {
      setNotice(
        voice.unavailableReason === 'no-permission'
          ? HELM_COPY.talkNeedsMicrophone
          : HELM_COPY.talkNeedsRecognition,
      );
      return 'blocked' as const;
    }
    return startListening(page);
  };

  function startListening(page: ScreenContext | null) {
    screen.current = page;
    setNotice(null);
    setShowsPhoneLine(false);
    interruptedCaptureId.current = null;
    voice.listen();
    return 'started' as const;
  }

  return {
    ...voice,
    note,
    notice,
    showsPhoneLine,
    clearNotice: () => setNotice(null),
    talk,
    setSurfaceShown,
  };
}

export type HelmVoice = ReturnType<typeof useHelmVoice>;

export const HelmVoiceContext = createContext<HelmVoice | null>(null);

export function useHelmVoiceContext() {
  const voice = useContext(HelmVoiceContext);
  if (voice === null) throw new Error('Helm voice is not provided.');
  return voice;
}
