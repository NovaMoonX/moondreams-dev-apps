import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { Link2 } from 'lucide-react';

import LinkPreviewCard from '@/components/LinkPreviewCard';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { isValidHttpsUrl, toWebLink } from '@/utils/urlUtils';
import { productPageQueryOptions } from '@apps/pinch/queries/productPageQueries';

interface ProductLinkFieldProps {
  caption?: string;
  savedLink?: string | null;
  value: string;
  onChange: (value: string) => void;
  onFill: (link: string) => void;
  isFilling: boolean;
  note: string | null;
  error: string | null;
}

/** A product page's address, its preview once the page is read, and a button that fills the price and size from it. */
function ProductLinkField({
  caption,
  savedLink = null,
  value,
  onChange,
  onFill,
  isFilling,
  note,
  error,
}: ProductLinkFieldProps) {
  const preview = useLinkPreview(value, {
    getQueryOptions: productPageQueryOptions,
    isEnabled: value.trim() !== (savedLink ?? ''),
  });
  const link = toWebLink(value);
  const isTyped = value.trim() !== '';
  const needsHttps = isTyped && !isValidHttpsUrl(value.trim());

  return (
    <div className='space-y-2'>
      {caption && (
        <Label className='text-muted-foreground text-xs'>{caption}</Label>
      )}
      <div className='flex items-center gap-2'>
        <Input
          variant='outline'
          type='url'
          aria-label='Product page link'
          placeholder='https://'
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {isTyped && (
          <Button
            type='button'
            variant='tertiary'
            disabled={isFilling}
            onClick={() => onChange('')}
          >
            Clear
          </Button>
        )}
      </div>
      {preview && <LinkPreviewCard preview={preview} />}
      {link !== null && (
        <Button
          type='button'
          variant='secondary'
          className='w-full gap-2'
          loading={isFilling}
          disabled={isFilling}
          onClick={() => onFill(link)}
        >
          <Link2 className='h-4 w-4' aria-hidden='true' />
          Fill in from this page
        </Button>
      )}
      {needsHttps ? (
        <p className='text-destructive text-xs'>
          Start the link with https:// to keep it.
        </p>
      ) : (
        <p className='text-muted-foreground text-xs'>
          Paste a product page and an AI reads it to fill in the price and size.
          Nothing is saved until you add it.
        </p>
      )}
      {note && <p className='text-muted-foreground text-xs'>{note}</p>}
      {error && <p className='text-destructive text-xs'>{error}</p>}
    </div>
  );
}

export default ProductLinkField;
