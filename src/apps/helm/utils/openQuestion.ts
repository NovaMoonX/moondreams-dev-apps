/** How long after a spoken reply the wake phrase still answers the question it left open. */
export const OPEN_QUESTION_MS = 2 * 60_000;

/** How an answer arrived: typed, spoken after a tap or in the listening window, or spoken after the wake phrase. */
export type AnswerRoute = 'typed' | 'spoken' | 'wake';

interface QuestionTurn {
  inputMode: 'typed' | 'voice' | 'attachment';
  answersQuestion: unknown;
  createdAt: number;
  sortedAt: number | null;
}

/** The turn of an open session whose open question an answer goes to: the latest turn for a typed answer; for a spoken one the latest spoken turn, past any message typed since; after the wake phrase only while its reply is under two minutes old. */
export function pickQuestionTurn<T extends QuestionTurn>(
  sessionTurns: T[],
  route: AnswerRoute,
  now: number,
): T | null {
  const asking = sessionTurns.filter((turn) => turn.answersQuestion === null);
  const latest =
    route === 'typed'
      ? asking.at(-1)
      : asking.filter((turn) => turn.inputMode === 'voice').at(-1);
  if (!latest) return null;
  if (route !== 'wake') return latest;
  return now - (latest.sortedAt ?? latest.createdAt) <= OPEN_QUESTION_MS
    ? latest
    : null;
}

export type TurnRoute = 'spoken' | 'typed' | 'tap';

/** Whether a turn is answered aloud: a spoken one is, a choice tapped while a spoken conversation is open is, a typed one never is, and Mute ends it. */
export function isSpokenTurn(
  route: TurnRoute,
  conversation: { isOpen: boolean; isMuted: boolean },
) {
  if (conversation.isMuted || route === 'typed') return false;
  return route === 'spoken' || conversation.isOpen;
}
