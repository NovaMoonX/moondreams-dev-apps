import { startSymptomsListener } from './symptomsListener';

export { startSymptomsListener };

export function startCatDetailSymptomsListener(
  householdId: string,
  catId: string,
  onChange: (symptoms: import('@apps/nine-lives/types').Symptom[]) => void,
) {
  return startSymptomsListener(householdId, catId, onChange);
}
