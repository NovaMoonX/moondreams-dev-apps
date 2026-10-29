import { ENVELOPE_FIGURE_WORDS } from '@apps/runway/constants';
import type { Level } from '@apps/runway/types';

/** The words a level gives to figures: what an envelope's number is called, and the Free to Spend row that adds the envelopes up. */
export function getLevelWords(level: Level) {
  const result = {
    envelopeFigure: ENVELOPE_FIGURE_WORDS[level],
    envelopesRow:
      level === 'track' ? 'Left in envelopes' : 'Assigned to envelopes',
  };
  return result;
}
