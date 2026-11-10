import { createContext, useContext, useEffect, useRef, useState } from 'react';

import { httpsCallable } from 'firebase/functions';

import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import { useAuth } from '@/hooks/useAuth';
import { useVoiceConversation } from '@/hooks/useVoiceConversation';
import type { VoiceIdentity } from '@/lib/speech/voice/types';
import {
  createVoiceTokenSource,
  type MintVoiceTokenRequest,
  type MintVoiceTokenResult,
} from '@/lib/speech/voice/voiceToken';
import { store, useAppSelector } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import {
  DEFAULT_ASSISTANT_NAME,
  END_PHRASES,
  HELM_COPY,
} from '@apps/helm/constants';
import { useAssistantName } from '@apps/helm/hooks/useAssistantName';
import {
  clearSentTurn,
  getNextTurn,
  recordSentTurn,
} from '@apps/helm/hooks/useSession';
import { functions } from '@lib/firebase/config';
import { canUndo } from '@apps/helm/nomos/planUndo';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  loadExecutionsById,
  markCaptureSpoken,
  sendCapture,
} from '@apps/helm/store/actions/captureActions';
import { takeBack } from '@apps/helm/store/actions/undoActions';
import {
  selectAllCaptures,
  selectExecutionsById,
} from '@apps/helm/store/selectors/captureSelectors';
import type { OpenCapture, ScreenContext } from '@apps/helm/types';
import {
  applyReadingEdits,
  readCapture,
} from '@apps/helm/utils/captureReading';
import { getOpenSessionId } from '@apps/helm/utils/sessions';
import { isUndoPhrase } from '@apps/helm/utils/voicePhrases';

const NOTE_MS = 6000;
// A turn still unsorted this long after it was sent while offline stops the wait; it is filed once the connection is back.
const OFFLINE_WAIT_MS = 20_000;

const mintVoiceToken = httpsCallable<
  MintVoiceTokenRequest,
  MintVoiceTokenResult
>(functions, 'mintVoiceToken');

const HELM_VOICE_IDENTITY: VoiceIdentity = {
  id: 'helm-assistant',
  label: DEFAULT_ASSISTANT_NAME,
  device: {
    naturalVoice: true,
    systemVoiceHints: [],
    rate: 1,
    pitch: 1,
  },
};

/** Helm's voice: talking writes a spoken turn like a typed one, the line the server sealed for it is said once the turn is sorted, and "undo that" takes the open session's latest turn back. One instance serves home and the conversation over a page. */
export function useHelmVoice() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const name = useAssistantName();
  const uid = user?.uid ?? null;
  const [note, setNote] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const captures = useAppSelector(selectAllCaptures);
  const executionsById = useAppSelector(selectExecutionsById);
  const failedIds = useAppSelector((state) => state.helm.failedExecutionIds);
  const screen = useRef<ScreenContext | null>(null);
  const noteId = useRef(0);
  const waiting = useRef(new Set<string>());
  const onSettled = useRef(() => undefined as void);
  const offlineId = useRef(0);
  const isSurfaceShown = useRef(true);
  // Rises on each Stop, so a turn still being sent when Stop was tapped is never waited on.
  const stopCount = useRef(0);
  const [tokenSource] = useState(() =>
    createVoiceTokenSource({
      appId: 'helm',
      mint: async (request) => (await mintVoiceToken(request)).data,
    }),
  );
  const voiceMode = useAppSelector((state) => state.helm.profile?.voiceMode);
  const [showsPhoneLine, setShowsPhoneLine] = useState(false);

  const voice = useVoiceConversation({
    lang: navigator.language || 'en-US',
    identity: HELM_VOICE_IDENTITY,
    endPhrases: END_PHRASES,
    onUtterance: (text, heardBy) => {
      void handleUtterance(text, heardBy.sttProvider);
    },
    onNothingHeard: () => showNote(HELM_COPY.talkHeardNothing),
    onCloudHeld: () => setShowsPhoneLine(true),
    cloudListening: {
      tokenSource,
      isAllowed: voiceMode !== 'deviceOnly',
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
    void voice.speak(line, { priority: 'ack', turnKey: Date.now() });
  }

  async function handleUtterance(text: string, sttProvider: string) {
    if (isUndoPhrase(text)) {
      await undoLatest();
      return;
    }
    await sendTurn(text, sttProvider);
  }

  async function sendTurn(text: string, sttProvider: string) {
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
        ...turn,
        voice: { sttProvider },
      });
      recordSentTurn(uid, turn, id);
      const leadId = turn.leadId ?? id;
      write.catch((error: unknown) => {
        clearSentTurn(uid, id);
        waiting.current.delete(leadId);
        fail(error);
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
    const result = await voice.speak(line, {
      priority: 'ack',
      turnKey: capture.createdAt,
    });
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
        if (capture.status === 'sorted' && missing.length > 0) {
          void loadExecutionsById(uid, missing);
          return;
        }
        waiting.current.delete(leadId);
        const line =
          capture.status === 'sorted'
            ? (capture.executionIds
                .flatMap((id) => executionsById.get(id) ?? [])
                .find((execution) => execution.spoken !== null)?.spoken ?? null)
            : null;
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
      if (state === 'listening') voice.cancel();
      else if (state === 'speaking') voice.stop();
      else if (state === 'thinking') {
        waiting.current.clear();
        voice.settle();
      }
    });
  };

  /** Starts listening from `page` (what the page publishes, null from home), or sends what is being said, or stops what is working or speaking. */
  const talk = (page: ScreenContext | null) => {
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
    screen.current = page;
    setNotice(null);
    setShowsPhoneLine(false);
    voice.listen();
    return 'started' as const;
  };

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
