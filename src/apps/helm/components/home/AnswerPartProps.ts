import type { ReactNode } from 'react';

import type { HelmQuestion, QuestionAnswerValue } from '@apps/helm/types';

/** What every shape's answer part is given: the question, whether an answer is on its way, and where a finished answer goes (`recordName` names a chosen person or place that is not one of the question's options). */
export interface AnswerPartProps {
  question: HelmQuestion;
  isBusy: boolean;
  /** In the thread the words that are none of the choices come from the composer at the bottom, so the part draws no field of its own and says so in one quiet line; a sheet covers the composer and keeps its own field. */
  isComposerAnswer: boolean;
  /** The Skip control, drawn left of the part's own primary button where it has one. */
  skip?: ReactNode;
  onAnswer: (value: QuestionAnswerValue, recordName?: string | null) => void;
}
