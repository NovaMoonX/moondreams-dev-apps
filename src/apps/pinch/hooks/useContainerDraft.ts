import { useState } from 'react';

import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import type { ContainerPlace, RecipeCare } from '@apps/pinch/types';
import {
  getEatByDefault,
  getEatByHint,
  getMoveForPlace,
  isValidContainerServings,
  isValidEatBy,
} from '@apps/pinch/utils/containers';

interface ContainerDraftOptions {
  care: RecipeCare | null;
  initialPlace: ContainerPlace;
  initialServings: number;
}

/** The three answers a container needs: how many, where, and eat by. Eat by follows the default for the place until the person types a date, and a typed date is kept when the place changes. */
export function useContainerDraft({
  care,
  initialPlace,
  initialServings,
}: ContainerDraftOptions) {
  const [place, setPlace] = useState(initialPlace);
  const [servings, setServings] = useState(initialServings);
  const [typedEatBy, setTypedEatBy] = useState<string | null>(null);

  const move = getMoveForPlace(place, null);
  const preset = getEatByDefault(move, care);
  const eatByText = typedEatBy ?? toDateInputValue(preset.eatBy);
  const eatBy = fromDateInputValue(eatByText) ?? null;
  const isValid =
    isValidContainerServings(servings) && eatBy !== null && isValidEatBy(eatBy);

  return {
    place,
    setPlace,
    servings,
    setServings,
    eatByText,
    setEatByText: setTypedEatBy,
    eatBy,
    hint: getEatByHint(move, preset),
    isValid,
    isDirty:
      place !== initialPlace ||
      servings !== initialServings ||
      typedEatBy !== null,
  };
}

export type ContainerDraft = ReturnType<typeof useContainerDraft>;
