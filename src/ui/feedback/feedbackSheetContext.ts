import { createContext, useContext } from 'react';

import type { FeedbackKind } from '@lib/feedback/types';

export interface FeedbackSheetValue {
  /** Opens the feedback sheet above whatever is showing: on that kind (a shake opens "bug"), or with the kind picker first for `null`. */
  open: (kind: FeedbackKind | null) => void;
}

export const FeedbackSheetContext = createContext<FeedbackSheetValue>({
  open: () => undefined,
});

export function useFeedbackSheet() {
  return useContext(FeedbackSheetContext);
}
