import { useState } from 'react';

import { useAppSelector } from '@/store';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { selectUsualDays } from '@apps/pinch/store/selectors';
import type { ContainerPlace, RecipeCare } from '@apps/pinch/types';
import {
  getContainerCountMax,
  getEatByDefault,
  getEatByHint,
  getMoveForPlace,
  getSplitText,
  isValidContainerServings,
  isValidEatBy,
  splitServings,
} from '@apps/pinch/utils/containers';

interface ContainerDraftOptions {
  care: RecipeCare | null;
  initialPlace: ContainerPlace;
  initialServings: number;
}

/** A typed eat-by date survives a change of place. */
export function useContainerDraft({
  care,
  initialPlace,
  initialServings,
}: ContainerDraftOptions) {
  const [place, setPlace] = useState(initialPlace);
  const [servings, setServings] = useState(initialServings);
  const [typedEatBy, setTypedEatBy] = useState<string | null>(null);
  const [wantedContainers, setContainers] = useState(1);
  const usualDays = useAppSelector(selectUsualDays);

  const maxContainers = getContainerCountMax(servings);
  const containers = Math.min(wantedContainers, maxContainers);
  const move = getMoveForPlace(place, null);
  const preset = getEatByDefault(move, care, undefined, null, usualDays);
  const eatByText = typedEatBy ?? toDateInputValue(preset.eatBy);
  const eatBy = fromDateInputValue(eatByText) ?? null;
  const isValid =
    isValidContainerServings(servings) && eatBy !== null && isValidEatBy(eatBy);

  return {
    place,
    setPlace,
    servings,
    setServings,
    containers,
    setContainers,
    maxContainers,
    split: splitServings(servings, containers),
    splitText: getSplitText(servings, containers),
    eatByText,
    setEatByText: setTypedEatBy,
    eatBy,
    hint: getEatByHint(move, preset),
    isValid,
    isDirty:
      place !== initialPlace ||
      servings !== initialServings ||
      containers !== 1 ||
      typedEatBy !== null,
  };
}

export type ContainerDraft = ReturnType<typeof useContainerDraft>;
