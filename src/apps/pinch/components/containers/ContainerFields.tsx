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
  containers: number;
  setContainers: (containers: number) => void;
  maxContainers: number;
  splitText: string | null;
  basis?: string | null;
  overNote?: string | null;
  eatByText: string;
  setEatByText: (text: string) => void;
  hint: string;
}

interface ContainerFieldsProps {
  draft: ContainerFieldValues;
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
          label='Servings to put away'
          min={1}
          max={MAX_CONTAINER_SERVINGS}
          step={1}
        />
        {draft.basis && (
          <p className='text-muted-foreground text-xs'>{draft.basis}</p>
        )}
        {draft.overNote && (
          <p className='text-muted-foreground text-xs'>{draft.overNote}</p>
        )}
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
      <div className='space-y-1'>
        <Label className='text-muted-foreground text-xs'>
          How many containers?
        </Label>
        <Stepper
          value={draft.containers}
          onChange={draft.setContainers}
          label='Containers'
          min={1}
          max={draft.maxContainers}
          step={1}
        />
        {draft.splitText && (
          <p className='text-muted-foreground text-xs'>{draft.splitText}</p>
        )}
      </div>
      <EatByField
        value={draft.eatByText}
        onChange={draft.setEatByText}
        hint={draft.hint}
      />
    </div>
  );
}

export default ContainerFields;
