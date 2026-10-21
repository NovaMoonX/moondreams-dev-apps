import { createContext, useContext } from 'react';

import type { PinchSubview } from '@apps/pinch/types';

export interface PinchOverlayContextValue {
  subview: PinchSubview | null;
  openSubview: (subview: PinchSubview) => void;
  /** Switches to the Shopping tab unless a subview is up when it runs, so a late tap never replaces a form holding typed work. */
  showShoppingTab: () => void;
  /** Switches to the Settings tab unless a subview is up. Unlike the Shopping tab's, it may run from an open sheet: it closes the sheet's history entry first, then changes tab. */
  showSettingsTab: () => void;
  /** Shows the Calendar's week on a day, under the same guard, and also not while a dialog is open over the screen. */
  showCalendarDay: (dayKey: string) => void;
  closeSubview: () => void;
  /** Closes the open subview only if `isCurrent` says it is still the one that asked, for a close that follows an awaited write. */
  closeSubviewIf: (
    isCurrent: (subview: PinchSubview | null) => boolean,
  ) => void;
  /** The phone's list of ways to start a recipe, a drawer that lives above the tabs so any screen (and a way's own screen, on back) can raise it. */
  isStartOpen: boolean;
  /** `fromCalendar` marks the new recipe as started from the calendar's empty state; it defaults to false on every open. */
  setIsStartOpen: (isOpen: boolean, fromCalendar?: boolean) => void;
  /** Opens a subview for a toast's action, unless a subview is already up or a dialog is open, so a late tap never replaces typed work. */
  openSubviewFromToast: (subview: PinchSubview) => void;
  /** The new-idea sheet over whatever screen shows, for a way in other than the Ideas list. */
  openIdeaSheet: () => void;
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
