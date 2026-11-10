// Generated from src/apps/helm/engine/whoTier.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
export type WhoTierValue = 'close' | 'regular' | 'passing';

export interface WhoTierInput {
  tier: WhoTierValue;
  tierSetBy: 'person' | 'nomos';
  /** The day ("YYYY-MM-DD", in the person's zone) of each capture that names the who, one entry per capture. */
  mentionDayKeys: string[];
  /** Open or done tasks that name the who. */
  taskLinkCount: number;
  /** A key or involved role on any project. */
  hasRole: boolean;
}

export const REGULAR_MENTIONS = 3;
export const REGULAR_DAYS = 2;

/** The tier the assistant gives a who after a write: passing until it is linked, given a role or named in three captures over two days; never close, and never over a tier the person set. */
export function readWhoTier(input: WhoTierInput): WhoTierValue {
  const { tier, tierSetBy, mentionDayKeys, taskLinkCount, hasRole } = input;
  if (tierSetBy === 'person' || tier !== 'passing') return tier;
  const isMentionedOften =
    mentionDayKeys.length >= REGULAR_MENTIONS &&
    new Set(mentionDayKeys).size >= REGULAR_DAYS;
  return hasRole || taskLinkCount > 0 || isMentionedOften
    ? 'regular'
    : 'passing';
}
