import { ENVELOPE_FIGURE_WORDS } from '@apps/runway/constants';
import type { Level } from '@apps/runway/types';
import { isTrackingLevel } from '@apps/runway/engine/level';

/** The words a level gives to figures: what an envelope's number is called, and the Free to Spend row that adds the envelopes up. */
export function getLevelWords(level: Level) {
  const result = {
    envelopeFigure: ENVELOPE_FIGURE_WORDS[level],
    envelopesRow: isTrackingLevel(level)
      ? 'Left in envelopes'
      : 'Assigned to envelopes',
  };
  return result;
}
