import {
  RESEARCH_DEPTHS,
  RESEARCH_MONTHLY_CAP_CENTS,
  toResearchMonth,
} from '@apps/helm/engine/research';
import type { HelmProfile } from '@apps/helm/types';

/** How many thorough looks this month's allowance still holds, as the server last settled it; a month that has turned over is the full allowance. */
export const readThoroughLeft = (
  allowance: HelmProfile['researchAllowance'],
  now: number,
  timeZone: string,
) =>
  Math.floor(
    (allowance !== null && allowance.month === toResearchMonth(now, timeZone)
      ? allowance.leftCents
      : RESEARCH_MONTHLY_CAP_CENTS) / RESEARCH_DEPTHS.thorough.estimateCents,
  );
