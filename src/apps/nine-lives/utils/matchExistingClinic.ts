import { createOptionMatcher } from '@/utils/optionMatchUtils';
import type { VetClinic } from '../types';

const clinicMatcher = createOptionMatcher<VetClinic>({ names: (clinic) => [clinic.name] });

export function matchExistingClinic(
  name: string | null | undefined,
  clinics: VetClinic[],
): string | null {
  return clinicMatcher.match(name ?? '', clinics)?.id ?? null;
}
