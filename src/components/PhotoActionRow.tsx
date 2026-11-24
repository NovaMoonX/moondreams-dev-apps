import { useState, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';
import { Camera, ImagePlus, Images } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import FormSheet from '@/components/FormSheet';

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

interface PhotoTileProps {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}

function PhotoTile({ icon, label, onClick }: PhotoTileProps) {
  return (
    <Button
      type='button'
      variant='tertiary'
      onClick={onClick}
      className='bg-accent/50 border-border h-auto min-h-36 w-full flex-col justify-start gap-3 rounded-2xl border px-3! py-6 text-center font-normal whitespace-normal'
    >
      <span
        className='bg-primary text-primary-foreground grid size-14 place-items-center rounded-full'
        aria-hidden='true'
      >
        {icon}
      </span>
      <span className='text-foreground min-h-12 text-base leading-6 font-semibold'>
        {label}
      </span>
    </Button>
  );
}

/** One drawer row that adds a photo: on a touch screen a tap opens a sheet with a camera tile and a gallery tile. */
function PhotoActionRow({
  label,
  subtitle,
  canTakePhoto,
  isDisabled = false,
  isRoomy = false,
  isGrouped = false,
  takeLabel = 'Take a photo',
  chooseLabel = 'Choose from gallery',
  onPick,
}: PhotoActionRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isAsking = canTakePhoto && !isDisabled;

  const pick = (isCamera: boolean) => {
    if (!isDisabled) onPick(isCamera);
    setIsOpen(false);
  };

  return (
    <>
      <ActionRow
        isGrouped={isGrouped}
        isRoomy={isRoomy}
        icon={<ImagePlus />}
        label={label}
        subtitle={subtitle}
        isDisabled={isDisabled}
        hasChevron={isAsking}
        onClick={() => (isAsking ? setIsOpen(true) : onPick(false))}
      />
      {isOpen && !isDisabled && (
        <FormSheet
          isOpen
          isDrawerWhenShort
          title={label}
          onClose={() => setIsOpen(false)}
        >
          <div className='grid grid-cols-2 gap-3 pb-2'>
            <PhotoTile
              icon={<Camera className='size-6' />}
              label={takeLabel}
              onClick={() => pick(true)}
            />
            <PhotoTile
              icon={<Images className='size-6' />}
              label={chooseLabel}
              onClick={() => pick(false)}
            />
          </div>
        </FormSheet>
      )}
    </>
  );
}

export default PhotoActionRow;
