import { useState, type ReactNode } from 'react';

export interface QuestionStep {
  id: string;
  /** The question while it is open, in large type. */
  title: string;
  /** The caption of its folded row. */
  summaryLabel: string;
  /** What its folded row says; empty reads "Not answered yet". */
  summaryValue: ReactNode;
  isAnswered: boolean;
  /** Nearly always right as it starts (a priority, today, every time): shown folded and never asked. */
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

/** Which question is open in a one-question-at-a-time form, and the moves between them. */
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

  const isFolded = (step: QuestionStep) =>
    step.isAnswered && (step.isPreAnswered === true || passed.has(step.id));
  const chosen =
    openId === null ? null : (steps.find((step) => step.id === openId) ?? null);
  const open = chosen ?? steps.find((step) => !isFolded(step)) ?? null;

  const advance = () => {
    if (open === null || !open.isAnswered) return;
    onAdvance?.(open.id);
    setPassed((current) => new Set([...current, open.id]));
    setOpenId(null);
  };

  const result = {
    steps,
    open,
    isReview: open === null,
    reopen: (id: string) => setOpenId(id),
    advance,
  };
  return result;
}

export type QuestionFlowState = ReturnType<typeof useQuestionFlow>;
