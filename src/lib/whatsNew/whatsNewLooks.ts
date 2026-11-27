import type { WhatsNewScope } from './whatsNewTypes';

/** How one app draws its What's new notes, so the sheet reads as part of that app. */
export interface WhatsNewLook {
  /** A note's emoji in a rounded square, in a circle, or bare beside the words, as the app's own rows wear theirs. */
  mark: 'tile' | 'disc' | 'emoji';
  /** The token behind a tile or circle. */
  markFill: 'accent' | 'secondary' | 'muted';
  /** A hairline round the tile and a soft edge on its emoji, as Runway's item badges have. */
  isMarkEdged: boolean;
  /** What's told as separate cards (raised with a shadow, or flat), one bordered card of divided rows, or bare divided rows. */
  rows: 'raised' | 'cards' | 'boxed' | 'list';
  /** Footer buttons as full pills, for an app that rounds every button. */
  isPillButtons: boolean;
}

const DEFAULT_LOOK: WhatsNewLook = {
  mark: 'emoji',
  markFill: 'muted',
  isMarkEdged: false,
  rows: 'list',
  isPillButtons: false,
};

const LOOKS: Partial<Record<WhatsNewScope, WhatsNewLook>> = {
  site: {
    mark: 'tile',
    markFill: 'muted',
    isMarkEdged: false,
    rows: 'raised',
    isPillButtons: false,
  },
  runway: {
    mark: 'tile',
    markFill: 'accent',
    isMarkEdged: true,
    rows: 'cards',
    isPillButtons: false,
  },
  'a-list': {
    mark: 'disc',
    markFill: 'secondary',
    isMarkEdged: false,
    rows: 'boxed',
    isPillButtons: true,
  },
  'going-once': {
    mark: 'disc',
    markFill: 'accent',
    isMarkEdged: false,
    rows: 'cards',
    isPillButtons: true,
  },
  helm: {
    mark: 'tile',
    markFill: 'muted',
    isMarkEdged: false,
    rows: 'boxed',
    isPillButtons: false,
  },
  'nine-lives': {
    mark: 'emoji',
    markFill: 'muted',
    isMarkEdged: false,
    rows: 'boxed',
    isPillButtons: false,
  },
  pinch: {
    mark: 'tile',
    markFill: 'accent',
    isMarkEdged: false,
    rows: 'boxed',
    isPillButtons: false,
  },
  waypoint: {
    mark: 'disc',
    markFill: 'secondary',
    isMarkEdged: false,
    rows: 'list',
    isPillButtons: false,
  },
  'worth-the-wait': {
    mark: 'tile',
    markFill: 'muted',
    isMarkEdged: false,
    rows: 'raised',
    isPillButtons: false,
  },
};

/** Whether `scope` has a look of its own rather than the plain default. */
export const hasOwnWhatsNewLook = (scope: WhatsNewScope) => scope in LOOKS;

export const getWhatsNewLook = (scope: WhatsNewScope): WhatsNewLook =>
  LOOKS[scope] ?? DEFAULT_LOOK;
