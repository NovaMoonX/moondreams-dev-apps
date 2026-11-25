import { useState } from 'react';

import { Camera, ImagePlus, Images } from 'lucide-react';

import ActionRow from '@/components/ActionRow';
import ChoiceTilesSheet from '@/components/ChoiceTilesSheet';

interface PhotoActionRowProps {
  label: string;
  subtitle?: string;
  canTakePhoto: boolean;
  isDisabled?: boolean;
  isRoomy?: boolean;
  isGrouped?: boolean;
  takeLabel?: string;
  chooseLabel?: string;
  onPick: (isCamera: boolean) => void;
}

/** A drawer row that adds a photo; with `canTakePhoto`, its tap asks camera or gallery. */
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
        <ChoiceTilesSheet
          title={label}
          choices={[
            {
              key: 'take',
              icon: <Camera />,
              label: takeLabel,
              onPick: () => pick(true),
            },
            {
              key: 'choose',
              icon: <Images />,
              label: chooseLabel,
              onPick: () => pick(false),
            },
          ]}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

export default PhotoActionRow;
