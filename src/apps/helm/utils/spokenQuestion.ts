import { HELM_COPY } from '@apps/helm/constants';
import type { HelmQuestion } from '@apps/helm/types';

const SPOKEN_OPTIONS = 4;
const SPOKEN_FIRST = 3;
const YES_NO_OPENERS = new Set(
  'is are do does did can could should will would have has'.split(' '),
);

const joinOr = (labels: string[]) =>
  labels.length < 2
    ? (labels[0] ?? '')
    : `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`;

const toSentence = (prompt: string) =>
  /[?.!:]$/.test(prompt) ? prompt : `${prompt}?`;

const choiceLabels = (question: HelmQuestion) =>
  question.options
    .filter((option) => option.id !== 'none' && option.id !== 'new')
    .map((option) => option.label);

/** The options as said aloud: all of them up to four, else the first three and how many wait on the screen. */
const sayOptions = (labels: string[]) =>
  labels.length <= SPOKEN_OPTIONS
    ? `${joinOr(labels)}?`
    : `${labels.slice(0, SPOKEN_FIRST).join(', ')}, or one of ${labels.length - SPOKEN_FIRST} more on your screen.`;

/** A question the way it is read aloud, worded per shape exactly as the server words the first one. */
export function buildSpokenQuestion(question: HelmQuestion): string {
  const prompt = toSentence(question.prompt.trim());
  const labels = choiceLabels(question);
  const isLong = labels.length > SPOKEN_OPTIONS;
  if (question.shape === 'pickOne') return `${prompt} ${sayOptions(labels)}`;
  if (question.shape === 'pickSeveral') {
    if (isLong)
      return `${prompt} ${sayOptions(labels)} You can say more than one.`;
    return labels.length === 2
      ? `${prompt} ${labels[0]}, ${labels[1]}, or both?`
      : `${prompt} ${joinOr(labels)}. You can say more than one.`;
  }
  if (question.shape === 'yesNo') {
    const opener = question.prompt
      .trim()
      .split(/\s+/)[0]
      .toLowerCase()
      .replace(/[^a-z]/g, '');
    return YES_NO_OPENERS.has(opener) ? prompt : `${prompt} Yes or no?`;
  }
  return prompt;
}

/** The line that asks a code-built question once more after a reply that was none of its choices. */
export const buildAskAgainLine = (question: HelmQuestion) =>
  HELM_COPY.questionAskAgain(sayOptions(choiceLabels(question)));
