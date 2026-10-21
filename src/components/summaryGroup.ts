export type SummaryGroupPosition = 'first' | 'middle' | 'last' | 'only';

/** The hairline frame that makes consecutive summary rows of a form one card: put on each row's grid cell, which pulls up over the grid's gap (`gap-4`) so the rows touch. */
export const SUMMARY_GROUP_FRAME: Record<SummaryGroupPosition, string> = {
  first: 'border-border rounded-t-2xl border-x border-t',
  middle: 'border-border -mt-4 border-x border-t',
  last: 'border-border -mt-4 rounded-b-2xl border',
  only: 'border-border rounded-2xl border',
};

export const SUMMARY_GROUP_ROUNDING: Record<SummaryGroupPosition, string> = {
  first: 'rounded-t-2xl',
  middle: 'rounded-none',
  last: 'rounded-b-2xl',
  only: 'rounded-2xl',
};
