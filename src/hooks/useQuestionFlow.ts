import { useState, type ReactNode } from 'react';

export interface QuestionStep {
  id: string;
  /** The question while it is open, in large type. */
  title: string;
  /** The caption of its folded row. */
  summaryLabel: string;
  /** What its folded row says; empty reads "Not answered yet". */
  summaryValue: ReactNode;
  /** The folded row's value as words, for its accessible name when `summaryValue` is not plain text. */
  summaryText?: string;
  isAnswered: boolean;
  /** Why it is not answered yet, when the question alone doesn't say (a day that has passed, an amount over a limit). */
  blocker?: string | null;
  /** Nearly always right as it starts: shown folded and never asked. */
  isPreAnswered?: boolean;
  /** Its control, drawn only while it is the open question. */
  render: () => ReactNode;
}

interface UseQuestionFlowOptions {
  steps: QuestionStep[];
  /** Opens on every answer folded, for a form that changes something already saved. */
  startFolded?: boolean;
  /** A question to open first even though it is answered. */
  initialOpenId?: string | null;
  /** Runs as the person moves on from a question, before the next one opens (to prefill it). */
  onAdvance?: (fromId: string) => void;
}

/** Which question is open in a one-question-at-a-time form, the moves between them, and whether every answer has been seen once. */
export function useQuestionFlow({
  steps,
  startFolded = false,
  initialOpenId = null,
  onAdvance,
}: UseQuestionFlowOptions) {
  const [passed, setPassed] = useState<ReadonlySet<string>>(
    () => new Set(startFolded ? steps.map((step) => step.id) : []),
  );
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [hasReviewed, setHasReviewed] = useState(startFolded);

  const isFoldedIn = (step: QuestionStep, done: ReadonlySet<string>) =>
    step.isAnswered && (step.isPreAnswered === true || done.has(step.id));
  const chosen =
    openId === null ? null : (steps.find((step) => step.id === openId) ?? null);
  const open =
    chosen ?? steps.find((step) => !isFoldedIn(step, passed)) ?? null;

  const advance = () => {
    if (open === null || !open.isAnswered) return;
    onAdvance?.(open.id);
    const done = new Set([...passed, open.id]);
    setPassed(done);
    setOpenId(null);
    if (steps.every((step) => isFoldedIn(step, done))) setHasReviewed(true);
  };

  const result = {
    steps,
    open,
    isReview: open === null,
    /** Every answer has been seen once: from here the form's own primary (Add, Save) is offered and reopened answers keep the rest folded around them. */
    hasReviewed,
    blocker: open !== null && !open.isAnswered ? (open.blocker ?? null) : null,
    reopen: (id: string) => setOpenId(id),
    advance,
  };
  return result;
}

export type QuestionFlowState = ReturnType<typeof useQuestionFlow>;
