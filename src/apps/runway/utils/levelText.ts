import { ENVELOPE_FIGURE_WORDS, FREE_SUM_WORDS } from '@apps/runway/constants';
import type { Level } from '@apps/runway/types';
import { isTrackingLevel } from '@apps/runway/engine/level';

const getEnvelopesRow = (level: Level) => {
  if (level === 'link') return FREE_SUM_WORDS.envelopesLink;
  return isTrackingLevel(level) ? 'Left in envelopes' : 'Assigned to envelopes';
};

/** The words a level gives to figures: what an envelope's number is called, and the Free to Spend row that adds the envelopes up. */
export function getLevelWords(level: Level) {
  const result = {
    envelopeFigure: ENVELOPE_FIGURE_WORDS[level],
    envelopesRow: getEnvelopesRow(level),
  };
  return result;
}
