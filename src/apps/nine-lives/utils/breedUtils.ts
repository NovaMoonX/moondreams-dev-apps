import { CAT_BREEDS, CUSTOM_BREED_OPTION } from '@apps/nine-lives/constants/presetOptions';

export interface BreedValue {
  preset: string;
  customBreed: string;
}

export function getBreedInitialValue(breed?: string): BreedValue {
  const isPresetBreed = CAT_BREEDS.some((option) => option === breed);

  return {
    preset: isPresetBreed || !breed ? (breed ?? CAT_BREEDS[0]) : CUSTOM_BREED_OPTION,
    customBreed: isPresetBreed || !breed ? '' : breed,
  };
}

export function resolveBreedValue(value: BreedValue) {
  const chosenBreed = value.preset === CUSTOM_BREED_OPTION ? value.customBreed : value.preset;
  return chosenBreed.trim() || CAT_BREEDS[0];
}
