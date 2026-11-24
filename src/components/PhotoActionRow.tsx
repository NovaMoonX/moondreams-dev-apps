import {
  DropdownMenu,
  DropdownMenuFactories,
} from '@moondreamsdev/dreamer-ui/components';
import { Camera, ImagePlus } from 'lucide-react';

import ActionRow from '@/components/ActionRow';

const { option } = DropdownMenuFactories;
const TAKE = 'take';
const CHOOSE = 'choose';

interface PhotoActionRowProps {
  label: string;
  subtitle?: string;
  /** A touch screen offers the camera beside the chooser; elsewhere the row opens the chooser. */
  canTakePhoto: boolean;
  isDisabled?: boolean;
  isRoomy?: boolean;
  isGrouped?: boolean;
  takeLabel?: string;
  chooseLabel?: string;
  onPick: (isCamera: boolean) => void;
}

/** One drawer row that adds a photo: on a touch screen a tap asks Take a photo or Choose a photo. */
function PhotoActionRow({
  label,
  subtitle,
  canTakePhoto,
  isDisabled = false,
  isRoomy = false,
  isGrouped = false,
  takeLabel = 'Take a photo',
  chooseLabel = 'Choose a photo',
  onPick,
}: PhotoActionRowProps) {
  const row = (onClick: () => void) => (
    <ActionRow
      isGrouped={isGrouped}
      isRoomy={isRoomy}
      icon={<ImagePlus />}
      label={label}
      subtitle={subtitle}
      isDisabled={isDisabled}
      onClick={onClick}
    />
  );

  if (!canTakePhoto || isDisabled) return row(() => onPick(false));

  return (
    <DropdownMenu
      placement='bottom'
      alignment='start'
      className='min-w-56'
      trigger={<div className='block w-full'>{row(() => undefined)}</div>}
      items={[
        option({
          label: takeLabel,
          value: TAKE,
          icon: <Camera className='size-4' aria-hidden='true' />,
        }),
        option({
          label: chooseLabel,
          value: CHOOSE,
          icon: <ImagePlus className='size-4' aria-hidden='true' />,
        }),
      ]}
      onItemSelect={(value) => onPick(value === TAKE)}
    />
  );
}

export default PhotoActionRow;
