import { createContext, useContext } from 'react';

import type { PinchSubview } from '@apps/pinch/types';

export interface PinchOverlayContextValue {
  subview: PinchSubview | null;
  openSubview: (subview: PinchSubview) => void;
  closeSubview: () => void;
  /** The phone's list of ways to start a recipe, a drawer that lives above the tabs so any screen (and a way's own screen, on back) can raise it. */
  isStartOpen: boolean;
  /** `fromCalendar` marks the new recipe as started from the calendar's empty state; it defaults to false on every open. */
  setIsStartOpen: (isOpen: boolean, fromCalendar?: boolean) => void;
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
