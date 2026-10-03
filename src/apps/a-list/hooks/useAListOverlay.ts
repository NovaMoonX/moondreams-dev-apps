import { createContext, useContext } from 'react';

import type { AListOverlay } from '@apps/a-list/types';

export interface AListOverlayContextValue {
  overlay: AListOverlay | null;
  openOverlay: (overlay: AListOverlay) => void;
  closeOverlay: () => void;
}

/** One overlay value for the whole app, so an overlay can never open on top of another. */
export const AListOverlayContext = createContext<
  AListOverlayContextValue | undefined
>(undefined);

export function useAListOverlay() {
  const context = useContext(AListOverlayContext);

  if (!context) {
    throw new Error('useAListOverlay must be used inside A-List Tracker');
  }

  return context;
}
