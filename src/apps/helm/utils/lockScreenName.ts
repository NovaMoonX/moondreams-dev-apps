import { HELM_COPY, LOCK_SCREEN_NAME_MAX } from '@apps/helm/constants';
import type { HelmQuestion } from '@apps/helm/types';
import { matchSpokenAnswer } from '@apps/helm/utils/questionAnswers';

interface NameHabit {
  name: string;
  lockScreenName: string | null;
}

/** What a spoken request about a habit's lock-screen name turns into. Only `write` changes anything, and showing the name is written only from `answerShowName`'s yes. */
export type NameTurn =
  | { kind: 'ask'; line: string; question: HelmQuestion }
  | { kind: 'write'; lockScreenName: string | null; line: string }
  | { kind: 'kept'; line: string }
  | { kind: 'again'; line: string };

const toQuestion = (): HelmQuestion => ({
  kind: 'asked',
  builtBy: 'code',
  shape: 'yesNo',
  prompt: HELM_COPY.lockScreenNameAsk(HELM_COPY.lockScreenNameWarning),
  options: [
    { id: 'yes', label: 'Yes', detail: null, ref: null },
    { id: 'no', label: 'No', detail: null, ref: null },
  ],
  allowsSomethingElse: false,
  noneOption: false,
  recordKinds: [],
  dateMode: null,
  number: null,
  aboutRef: null,
  answer: null,
});

/** The first step of "show its name on the lock screen" / "hide it": showing says the switch's own warning and asks, writing nothing; hiding is one step. */
export function planNameRequest(habit: NameHabit, isShown: boolean): NameTurn {
  if (!isShown) {
    return habit.lockScreenName === null
      ? { kind: 'kept', line: HELM_COPY.lockScreenNameVoiceKept }
      : {
          kind: 'write',
          lockScreenName: null,
          line: HELM_COPY.lockScreenNameVoiceHidden(habit.name),
        };
  }
  return {
    kind: 'ask',
    line: HELM_COPY.lockScreenNameAsk(HELM_COPY.lockScreenNameWarning),
    question: toQuestion(),
  };
}

/** The second step: the person's words read on the device against the Show it? question. Only a clear yes writes the name; a no or Skip keeps it hidden, and anything else asks again. */
export function answerShowName(
  habit: NameHabit,
  transcript: string,
  context: { now: number; timeZone: string },
): NameTurn {
  const read = matchSpokenAnswer(transcript, toQuestion(), context);
  if (read === null) {
    return {
      kind: 'again',
      line: HELM_COPY.lockScreenNameAsk(HELM_COPY.lockScreenNameWarning),
    };
  }
  if (
    read.kind === 'answer' &&
    read.value.shape === 'yesNo' &&
    read.value.optionId === 'yes'
  ) {
    return {
      kind: 'write',
      lockScreenName: habit.name.slice(0, LOCK_SCREEN_NAME_MAX),
      line: HELM_COPY.lockScreenNameVoiceShown(habit.name),
    };
  }
  return { kind: 'kept', line: HELM_COPY.lockScreenNameVoiceKept };
}
