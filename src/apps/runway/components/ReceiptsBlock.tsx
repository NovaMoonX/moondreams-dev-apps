import { ReceiptText } from 'lucide-react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import FallbackImage from '@/components/FallbackImage';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { SPEND_WORDS } from '@apps/runway/constants';
import { useReceiptImageUrl } from '@apps/runway/hooks/useReceiptImageUrl';
import type { OpenReceiptImage } from '@apps/runway/types';

/** What stands in for a receipt while amounts are hidden or it is still opening: a neutral tile, never a blur. */
export function ReceiptTile() {
  return (
    <span
      className='bg-muted text-muted-foreground grid size-full place-items-center'
      aria-hidden='true'
    >
      <ReceiptText className='size-6' />
    </span>
  );
}

interface ReceiptThumbProps {
  image: OpenReceiptImage;
  onOpen: () => void;
}

function ReceiptThumb({ image, onOpen }: ReceiptThumbProps) {
  const { isHidden } = useValuesHidden();
  const { url } = useReceiptImageUrl(image, !isHidden);

  return (
    <Button
      type='button'
      variant='tertiary'
      className='border-border relative aspect-square h-auto w-full overflow-hidden rounded-xl border p-0!'
      aria-label={SPEND_WORDS.viewReceipt}
      onClick={onOpen}
    >
      {url === null ? (
        <ReceiptTile />
      ) : (
        <FallbackImage
          src={url}
          alt=''
          fallback={<ReceiptTile />}
          className='size-full object-cover'
        />
      )}
    </Button>
  );
}

interface ReceiptsBlockProps {
  images: OpenReceiptImage[];
  onOpen: (imageId: string) => void;
}

/** A purchase's receipts as a row of square thumbnails, each opening the viewer. */
function ReceiptsBlock({ images, onOpen }: ReceiptsBlockProps) {
  return (
    <section className='space-y-2'>
      <h3 className='text-muted-foreground text-sm font-medium'>
        {SPEND_WORDS.receipts}
      </h3>
      <ul className='grid grid-cols-4 gap-2' data-sensitive=''>
        {images.map((image) => (
          <li key={image.id}>
            <ReceiptThumb image={image} onOpen={() => onOpen(image.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ReceiptsBlock;
