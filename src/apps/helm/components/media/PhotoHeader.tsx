import { useRef, type ReactNode } from 'react';

import { DropdownMenuFactories } from '@moondreamsdev/dreamer-ui/components';
import { Camera, ImagePlus } from 'lucide-react';

import EllipsisDropdown from '@/components/EllipsisDropdown';
import { useCanTakePhoto } from '@/hooks/useCanTakePhoto';
import { openFileChooser } from '@/utils/fileUtils';
import WhoPhoto from '@apps/helm/components/who/WhoPhoto';
import { HELM_COPY, PHOTOS_PER_RECORD } from '@apps/helm/constants';
import { useMediaUpload } from '@apps/helm/hooks/useMediaUpload';
import type { PhotoOwner } from '@apps/helm/store/actions/mediaActions';
import type { WhoKind } from '@apps/helm/types';

const { option } = DropdownMenuFactories;
const TAKE = 'take';
const CHOOSE = 'choose';

interface PhotoHeaderProps {
  owner: PhotoOwner;
  kind: WhoKind | 'place';
  name: string;
  mainId: string | null;
  photoCount: number;
  children: ReactNode;
}

/** A who's or place's header: its round picture, which a tap opens to take or choose a photo, beside the title block. */
function PhotoHeader({
  owner,
  kind,
  name,
  mainId,
  photoCount,
  children,
}: PhotoHeaderProps) {
  const canTakePhoto = useCanTakePhoto();
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const { add, isUploading, error } = useMediaUpload(
    owner,
    owner.kind === 'who' && mainId === null,
  );
  const isFull = photoCount >= PHOTOS_PER_RECORD;

  const picture = (
    <span className='relative block'>
      <WhoPhoto kind={kind} name={name} mediaId={mainId} isLarge />
      <span className='bg-background border-border text-muted-foreground absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full border'>
        <Camera className='size-3.5' aria-hidden='true' />
      </span>
    </span>
  );

  const pick = (input: HTMLInputElement) => {
    const file = input.files?.[0] ?? null;
    input.value = '';
    void add(file);
  };

  return (
    <div className='space-y-2'>
      <div className='flex items-start gap-4'>
        <EllipsisDropdown
          variant='tertiary'
          placement='bottom'
          alignment='start'
          ariaLabel={HELM_COPY.photoMenuLabel(name)}
          disabled={isUploading}
          className="relative size-14! shrink-0 rounded-full after:absolute after:-inset-1 after:content-['']"
          icon={picture}
          items={
            isFull
              ? [
                  option({
                    label: HELM_COPY.photoFullShort,
                    value: 'full',
                    disabled: true,
                  }),
                ]
              : [
                  ...(canTakePhoto
                    ? [
                        option({
                          label: HELM_COPY.attachTake,
                          value: TAKE,
                          icon: (
                            <Camera className='size-4' aria-hidden='true' />
                          ),
                        }),
                      ]
                    : []),
                  option({
                    label: HELM_COPY.photoChoose,
                    value: CHOOSE,
                    icon: <ImagePlus className='size-4' aria-hidden='true' />,
                  }),
                ]
          }
          onItemSelect={(value) =>
            value === 'full'
              ? undefined
              : openFileChooser(
                  value === TAKE ? cameraInput.current : libraryInput.current,
                  { isCamera: value === TAKE },
                )
          }
        />
        <div className='min-w-0'>{children}</div>
      </div>
      {(isUploading || error) && (
        <p className='text-muted-foreground text-[13px]' role='status'>
          {isUploading ? HELM_COPY.photoAdding : error}
        </p>
      )}
      <input
        ref={cameraInput}
        type='file'
        accept='image/*'
        className='hidden'
        tabIndex={-1}
        onChange={(event) => pick(event.currentTarget)}
      />
      <input
        ref={libraryInput}
        type='file'
        accept='image/*'
        className='hidden'
        tabIndex={-1}
        onChange={(event) => pick(event.currentTarget)}
      />
    </div>
  );
}

export default PhotoHeader;
