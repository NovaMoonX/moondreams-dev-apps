import type {
  IngestionPreventiveProposal,
  IngestionVaccinationProposal,
} from '../lib/extractProposalFromFile.types';
import type { Preventive, Vaccination } from '../types';
import { normalizeString } from '@/utils/stringUtils';
import { isSameCalendarDay } from '@/utils/dateInputUtils';

/**
 * Nothing in the app asks for a vaccination/preventive's time of day, so extraction doesn't
 * either — a re-parse of the same document can land on a different arbitrary time for the
 * same administration. Duplicate detection compares calendar day, not a tight time window.
 */

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
      vaccination.history.some((dose) => isSameCalendarDay(dose.administeredAt, proposal.administeredAt)),
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
      preventive.history.some((dose) => isSameCalendarDay(dose.administeredAt, proposal.administeredAt)),
  );
}
