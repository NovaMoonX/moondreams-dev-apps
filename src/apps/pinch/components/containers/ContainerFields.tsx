import type { ReactNode } from 'react';

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
  /** `rows` puts each caption beside its control, for a framed card whose own footer carries `overNote`. */
  layout?: 'stack' | 'rows';
}

interface SettingRowProps {
  label: string;
  helper: string | null | undefined;
  children: ReactNode;
}

function SettingRow({ label, helper, children }: SettingRowProps) {
  return (
    <div className='space-y-1 px-4 py-3'>
      <div className='flex items-center justify-between gap-3'>
        <Label className='min-w-0 text-sm'>{label}</Label>
        <div className='shrink-0'>{children}</div>
      </div>
      {helper && <p className='text-muted-foreground text-xs'>{helper}</p>}
    </div>
  );
}

function ContainerFields({
  draft,
  isPlaceFixed = false,
  layout = 'stack',
}: ContainerFieldsProps) {
  const servingsStepper = (
    <Stepper
      value={draft.servings}
      onChange={draft.setServings}
      label='Servings to put away'
      min={1}
      max={MAX_CONTAINER_SERVINGS}
      step={1}
    />
  );
  const placePills = (
    <PillGroup
      label='Where it goes'
      options={CONTAINER_PLACE_OPTIONS}
      value={draft.place}
      onChange={draft.setPlace}
    />
  );
  const containersStepper = (
    <Stepper
      value={draft.containers}
      onChange={draft.setContainers}
      label='Boxes'
      min={1}
      max={draft.maxContainers}
      step={1}
    />
  );

  if (layout === 'rows') {
    return (
      <div className='divide-border divide-y'>
        <SettingRow label='Servings' helper={draft.basis}>
          {servingsStepper}
        </SettingRow>
        {!isPlaceFixed && (
          <div className='space-y-2 px-4 py-3'>
            <Label className='text-sm'>Where</Label>
            {placePills}
          </div>
        )}
        <SettingRow label='How many boxes?' helper={draft.splitText}>
          {containersStepper}
        </SettingRow>
        <EatByField
          value={draft.eatByText}
          onChange={draft.setEatByText}
          hint={draft.hint}
          isRow
        />
      </div>
    );
  }

  return (
    <div className='space-y-4'>
      <div className='space-y-1'>
        <Label className='text-muted-foreground text-xs'>Servings</Label>
        {servingsStepper}
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
          {placePills}
        </div>
      )}
      <div className='space-y-1'>
        <Label className='text-muted-foreground text-xs'>How many boxes?</Label>
        {containersStepper}
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
