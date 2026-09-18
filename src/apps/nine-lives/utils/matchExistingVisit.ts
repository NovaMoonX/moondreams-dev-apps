import type { IngestionVisitProposal } from '../lib/extractProposalFromFile.types';
import type { VetClinic, Visit } from '../types';
import { matchExistingClinic } from './matchExistingClinic';

export const VISIT_MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function matchExistingVisit(
  proposal: IngestionVisitProposal,
  visits: Visit[],
  clinics: VetClinic[],
  catIds: string[] = [],
): string | null {
  const matchedClinicId = matchExistingClinic(proposal.clinicName, clinics);
  const requestedCatIds = new Set(catIds);
  const candidates = visits
    .filter((visit) => visit.status !== 'cancelled')
    .filter((visit) => Math.abs(visit.scheduledAt - proposal.scheduledAt) <= VISIT_MATCH_WINDOW_MS)
    .filter((visit) => !matchedClinicId || visit.clinicId === matchedClinicId)
    .filter((visit) => requestedCatIds.size === 0 || [...requestedCatIds].every((catId) => visit.catIds.includes(catId)))
    .filter((visit) => visit.reason === proposal.reason)
    .sort(
      (left, right) =>
        Math.abs(left.scheduledAt - proposal.scheduledAt) -
        Math.abs(right.scheduledAt - proposal.scheduledAt),
    );

  return candidates[0]?.id ?? null;
}
