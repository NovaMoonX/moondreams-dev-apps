import { store } from '@/store';
import { getDeviceTimeZone } from '@/utils/timezoneUtils';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { sendCapture } from '@apps/helm/store/actions/captureActions';
import {
  clearSentTurn,
  getNextTurn,
  recordSentTurn,
} from '@apps/helm/hooks/useSession';
import type { HelmQuestion, QuestionAnswerValue } from '@apps/helm/types';
import {
  applyReadingEdits,
  readCapture,
} from '@apps/helm/utils/captureReading';
import { describeAnswer } from '@apps/helm/utils/questionAnswers';

export interface QuestionAnswerTurn {
  captureId: string;
  questionId: string;
  question: HelmQuestion;
  /** The structured answer; null when a spoken answer could not be placed, and then `transcript` is the turn's words. */
  value: QuestionAnswerValue | null;
  transcript: string | null;
  /** A chosen person's or place's name when it is not one of the question's options. */
  recordName?: string | null;
  assistantName: string;
  /** Set on a spoken answer. */
  sttProvider?: string;
}

const inFlight = new Set<string>();

/** Whether an answer to this question has been sent from this device and not yet failed. */
export const isAnswerInFlight = (captureId: string, questionId: string) =>
  inFlight.has(`${captureId}:${questionId}`);

/** Writes the answer to a model-written question as a turn in the open session, with the answer in words as its text; offline it waits in the queue like any turn. The write is handed back unawaited with the turn's id, and a rejected one forgets the turn. */
export async function sendQuestionAnswer(
  uid: string,
  turn: QuestionAnswerTurn,
) {
  const text =
    turn.value === null
      ? (turn.transcript ?? '')
      : describeAnswer(turn.question, turn.value, turn.recordName ?? null);
  const { helm } = store.getState();
  const timeZone = helm.profile?.timeZone ?? getDeviceTimeZone() ?? 'UTC';
  const next = { ...getNextTurn(), leadId: null, createdAt: Date.now() };
  const encryption = await getHelmEncryption(uid);
  const reading = applyReadingEdits(
    readCapture(text, {
      now: next.createdAt,
      timeZone,
      assistantName: turn.assistantName,
    }),
    { dismissed: [], days: {}, timeZone },
  );
  const { write, id } = await sendCapture(uid, encryption, {
    text,
    reading,
    screen: null,
    answersQuestion: { captureId: turn.captureId, questionId: turn.questionId },
    questionAnswer: turn.value,
    ...next,
    voice: turn.sttProvider
      ? { sttProvider: turn.sttProvider, interruptedCaptureId: null }
      : undefined,
  });
  const key = `${turn.captureId}:${turn.questionId}`;
  inFlight.add(key);
  recordSentTurn(uid, next, id);
  void write.catch(() => {
    inFlight.delete(key);
    clearSentTurn(uid, id);
  });
  return { write, id };
}
