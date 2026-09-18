import type {
  IngestionPreventiveProposal,
  IngestionVaccinationProposal,
} from '../lib/extractProposalFromFile.types';
import type { Preventive, Vaccination } from '../types';
import { normalizeString } from '@/utils/stringUtils';

export const ADMINISTRATION_DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

export function matchExistingVaccination(
  proposal: IngestionVaccinationProposal,
  catId: string | null,
  vaccinations: Vaccination[],
): string | null {
  if (!catId) {
    return null;
  }

  return (
    vaccinations.find(
      (vaccination) =>
        vaccination.catId === catId && normalizeString(vaccination.name) === normalizeString(proposal.name),
    )?.id ?? null
  );
}

export function detectDuplicateVaccination(
  proposal: IngestionVaccinationProposal,
  catId: string | null,
  vaccinations: Vaccination[],
): boolean {
  if (!catId) {
    return false;
  }

  return vaccinations.some(
    (vaccination) =>
      vaccination.catId === catId &&
      normalizeString(vaccination.name) === normalizeString(proposal.name) &&
      vaccination.history.some(
        (dose) =>
          Math.abs(dose.administeredAt - proposal.administeredAt) <=
          ADMINISTRATION_DUPLICATE_WINDOW_MS,
      ),
  );
}

export function matchExistingPreventive(
  proposal: IngestionPreventiveProposal,
  catIds: string[],
  preventives: Preventive[],
): string | null {
  const requestedCatIds = new Set(catIds);
  if (requestedCatIds.size === 0) {
    return null;
  }

  return (
    preventives.find(
      (preventive) =>
        preventive.type === proposal.type &&
        normalizeString(preventive.name) === normalizeString(proposal.name) &&
        [...requestedCatIds].every((catId) => preventive.catIds.includes(catId)),
    )?.id ?? null
  );
}

export function detectDuplicatePreventive(
  proposal: IngestionPreventiveProposal,
  catIds: string[],
  preventives: Preventive[],
): boolean {
  const requestedCatIds = new Set(catIds);
  if (requestedCatIds.size === 0) {
    return false;
  }

  return preventives.some(
    (preventive) =>
      preventive.type === proposal.type &&
      normalizeString(preventive.name) === normalizeString(proposal.name) &&
      [...requestedCatIds].every((catId) => preventive.catIds.includes(catId)) &&
      preventive.history.some(
        (dose) =>
          Math.abs(dose.administeredAt - proposal.administeredAt) <=
          ADMINISTRATION_DUPLICATE_WINDOW_MS,
      ),
  );
}
