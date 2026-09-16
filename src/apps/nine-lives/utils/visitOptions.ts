import type { Visit } from '../types';
import { getDefaultVisitTitle } from './dateHelpers';

interface GetVisitOptionsParams {
  /** Restrict to visits that include this cat. */
  catId?: string | null;
  /** Exclude one visit, e.g. the visit currently being edited. */
  excludeVisitId?: string | null;
}

/** Builds `{label, value}` options for a visit picker from the household's visits. */
export function getVisitOptions(
  visits: Visit[],
  { catId, excludeVisitId }: GetVisitOptionsParams = {},
): { label: string; value: string }[] {
  return visits
    .filter((visit) => !catId || visit.catIds.includes(catId))
    .filter((visit) => visit.id !== excludeVisitId)
    .map((visit) => ({
      label: visit.title ?? getDefaultVisitTitle(visit.scheduledAt),
      value: visit.id,
    }));
}
