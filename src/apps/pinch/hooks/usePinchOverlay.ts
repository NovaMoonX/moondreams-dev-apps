import { createContext, useContext } from 'react';

import type { PinchSubview } from '@apps/pinch/types';

export interface PinchOverlayContextValue {
  subview: PinchSubview | null;
  openSubview: (subview: PinchSubview) => void;
  closeSubview: () => void;
}

/** One subview value for the whole app, so a full-page screen can never open on top of another. */
export const PinchOverlayContext = createContext<
  PinchOverlayContextValue | undefined
>(undefined);

export function usePinchOverlay() {
  const context = useContext(PinchOverlayContext);

  if (!context) {
    throw new Error('usePinchOverlay must be used inside Pinch');
  }

  return context;
}
