import type { ReactNode } from 'react';

import { MaskedText } from '@apps/runway/components/MaskedText';
import { FIGURE, maskFigures } from '@apps/runway/utils/maskText';

interface SummaryStep {
  summaryValue: ReactNode;
  summaryText?: string;
}

/** A form's folded answers with every amount in them masked while amounts are hidden, and their accessible names masked too; the question being answered is drawn by its own field. */
export function maskSummaries<S extends SummaryStep>(
  steps: readonly S[],
  isHidden: boolean,
): S[] {
  const result = steps.map((step) => {
    const value = step.summaryValue;
    if (typeof value !== 'string' || value.split(FIGURE).length < 2)
      return step;
    const masked: S = {
      ...step,
      summaryValue: <MaskedText>{value}</MaskedText>,
      summaryText: isHidden ? maskFigures(value) : value,
    };
    return masked;
  });
  return result;
}
