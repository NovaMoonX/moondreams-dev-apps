import type { IngestionVisitProposal } from '../lib/extractProposalFromFile.types';
import type { VetClinic, Visit } from '../types';
import { matchExistingClinic } from './matchExistingClinic';

export const VISIT_MATCH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function matchExistingVisit(
  proposal: IngestionVisitProposal,
  visits: Visit[],
  clinics: VetClinic[],
): string | null {
  const matchedClinicId = matchExistingClinic(proposal.clinicName, clinics);
  const candidates = visits
    .filter((visit) => visit.status === 'upcoming')
    .filter((visit) => Math.abs(visit.scheduledAt - proposal.scheduledAt) <= VISIT_MATCH_WINDOW_MS)
    .filter((visit) => !matchedClinicId || visit.clinicId === matchedClinicId)
    .sort(
      (left, right) =>
        Math.abs(left.scheduledAt - proposal.scheduledAt) -
        Math.abs(right.scheduledAt - proposal.scheduledAt),
    );

  return candidates[0]?.id ?? null;
}
