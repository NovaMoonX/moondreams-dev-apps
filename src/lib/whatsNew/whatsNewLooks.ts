import type { WhatsNewScope } from './whatsNewTypes';

/** How one app draws its What's new notes, so the sheet reads as part of that app. */
export interface WhatsNewLook {
  /** A note's emoji in a rounded tile, as the app's items wear theirs, or bare beside the words. */
  mark: 'tile' | 'emoji';
  /** What's told as bordered cards, or as rows of a divided list. */
  rows: 'cards' | 'list';
}

const DEFAULT_LOOK: WhatsNewLook = { mark: 'emoji', rows: 'list' };

const LOOKS: Partial<Record<WhatsNewScope, WhatsNewLook>> = {
  runway: { mark: 'tile', rows: 'cards' },
};

export const getWhatsNewLook = (scope: WhatsNewScope): WhatsNewLook =>
  LOOKS[scope] ?? DEFAULT_LOOK;
