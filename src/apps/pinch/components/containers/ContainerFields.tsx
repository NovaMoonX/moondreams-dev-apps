import { Label } from '@moondreamsdev/dreamer-ui/components';

import { PillGroup } from '@/components/PillGroup';
import Stepper from '@/components/Stepper';
import EatByField from '@apps/pinch/components/containers/EatByField';
import {
  CONTAINER_PLACE_OPTIONS,
  MAX_CONTAINER_SERVINGS,
} from '@apps/pinch/constants';
import type { ContainerPlace } from '@apps/pinch/types';

export interface ContainerFieldValues {
  place: ContainerPlace;
  setPlace: (place: ContainerPlace) => void;
  servings: number;
  setServings: (servings: number) => void;
  eatByText: string;
  setEatByText: (text: string) => void;
  hint: string;
}

interface ContainerFieldsProps {
  draft: ContainerFieldValues;
  /** The place is already answered (the freezer pill was tapped), so only how many and eat by are asked. */
  isPlaceFixed?: boolean;
}

function ContainerFields({
  draft,
  isPlaceFixed = false,
}: ContainerFieldsProps) {
  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <Label className='text-muted-foreground text-xs'>Servings</Label>
        <Stepper
          value={draft.servings}
          onChange={draft.setServings}
          label='Servings in the container'
          min={1}
          max={MAX_CONTAINER_SERVINGS}
          step={1}
        />
      </div>
      {!isPlaceFixed && (
        <div className='space-y-1'>
          <Label className='text-muted-foreground text-xs'>Where</Label>
          <PillGroup
            label='Where it goes'
            options={CONTAINER_PLACE_OPTIONS}
            value={draft.place}
            onChange={draft.setPlace}
          />
        </div>
      )}
      <EatByField
        value={draft.eatByText}
        onChange={draft.setEatByText}
        hint={draft.hint}
      />
    </div>
  );
}

export default ContainerFields;
