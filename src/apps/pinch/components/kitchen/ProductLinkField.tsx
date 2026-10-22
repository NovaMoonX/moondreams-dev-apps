import { useRef, useState } from 'react';

import {
  Button,
  Checkbox,
  Input,
  Label,
} from '@moondreamsdev/dreamer-ui/components';
import { Camera, Link2 } from 'lucide-react';

import LinkPreviewCard from '@/components/LinkPreviewCard';
import RevealChip from '@/components/RevealChip';
import { useLinkPreview } from '@/hooks/useLinkPreview';
import { toWebLink } from '@/utils/urlUtils';
import { productPageQueryOptions } from '@apps/pinch/queries/productPageQueries';

export interface AliasOffer {
  text: string;
  isOn: boolean;
  onChange: (isOn: boolean) => void;
}

interface ProductLinkFieldProps {
  caption?: string;
  savedLink?: string | null;
  isEditing?: boolean;
  canClear?: boolean;
  shouldFocus?: boolean;
  aliasOffer?: AliasOffer | null;
  value: string;
  onChange: (value: string) => void;
  onFill: (link: string) => void;
  isFilling: boolean;
  note: string | null;
  error: string | null;
  /** A screenshot or photo could get past the failure shown, so the field offers one. */
  canTryPicture: boolean;
  onReadFile: (file: File) => void;
}

/** A product page's address, its preview once the page is read, and a button that fills the price and size from it. */
function ProductLinkField({
  caption,
  savedLink = null,
  isEditing = false,
  canClear = true,
  shouldFocus = false,
  aliasOffer = null,
  value,
  onChange,
  onFill,
  isFilling,
  note,
  error,
  canTryPicture,
  onReadFile,
}: ProductLinkFieldProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileKey, setFileKey] = useState(0);
  const preview = useLinkPreview(value, {
    getQueryOptions: productPageQueryOptions,
    isEnabled: value.trim() !== (savedLink ?? ''),
  });
  const link = toWebLink(value);
  const isTyped = value.trim() !== '';
  const isUnreadable = isTyped && link === null;
  const hasRead = note !== null;

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
          autoFocus={shouldFocus}
          placeholder='https://'
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={() => {
            if (link !== null && link !== value.trim()) {
              onChange(link);
            }
          }}
        />
        {isTyped && canClear && (
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
      {preview && !hasRead && <LinkPreviewCard preview={preview} />}
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
      {isUnreadable && (
        <p className='text-destructive text-xs'>
          Paste the whole address of the page.
        </p>
      )}
      {!isUnreadable && !hasRead && (
        <p className='text-muted-foreground text-xs'>
          Paste a product page and an AI reads it, with the ingredient's name,
          to fill in the price and size. Nothing is saved until you{' '}
          {isEditing ? 'save' : 'add'} it.
        </p>
      )}
      {note && (
        <p className='text-muted-foreground text-xs' role='status'>
          {note}
        </p>
      )}
      {hasRead && aliasOffer && (
        <label className='flex min-h-10 cursor-pointer items-start gap-3 py-1 text-sm select-none'>
          <Checkbox
            aria-label={`Also call this ingredient ${aliasOffer.text}`}
            checked={aliasOffer.isOn}
            onCheckedChange={(checked) => aliasOffer.onChange(checked === true)}
          />
          <span className='min-w-0 wrap-break-word'>
            Also call this ingredient “{aliasOffer.text}”
          </span>
        </label>
      )}
      {error && <p className='text-destructive text-xs'>{error}</p>}
      {canTryPicture && (
        <div className='space-y-1.5'>
          <p className='text-muted-foreground text-xs'>
            Or choose a screenshot of the page, or a photo of the shelf tag or
            package. An AI reads the picture to fill in the price and size.
            Nothing is saved until you {isEditing ? 'save' : 'add'} it.
          </p>
          <RevealChip
            icon={<Camera className='h-4 w-4' aria-hidden='true' />}
            onClick={() => fileRef.current?.click()}
          >
            Read a screenshot or photo
          </RevealChip>
          <Input
            key={fileKey}
            ref={fileRef}
            type='file'
            accept='image/*,application/pdf'
            aria-label='Upload a screenshot or photo of the product'
            className='hidden'
            onChange={(event) => {
              const next = event.target.files?.[0];
              setFileKey((current) => current + 1);
              if (next) onReadFile(next);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default ProductLinkField;
