import type {
  IngestionPreventiveProposal,
  IngestionVaccinationProposal,
} from '../lib/extractProposalFromFile.types';
import type { Preventive, Vaccination } from '../types';

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

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
        vaccination.catId === catId && normalizeName(vaccination.name) === normalizeName(proposal.name),
    )?.id ?? null
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
        [...requestedCatIds].every((catId) => preventive.catIds.includes(catId)),
    )?.id ?? null
  );
}

