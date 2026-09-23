import { useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';

import ExternalLinkText from '@/components/ExternalLinkText';
import { getErrorMessage } from '@/utils/errorUtils';
import { linkMetadataQueryOptions } from '@/lib/linkMetadata/linkMetadataQueries';
import type { LinkPreview } from '@/lib/linkMetadata/types';

interface LinkAttachFieldProps {
  url: string;
  preview: LinkPreview | null;
  onChange: (url: string, preview: LinkPreview | null) => void;
  onUseTitle?: (title: string) => void;
  currentTitle?: string;
  /** Also doubles as a manual fallback for site details Places doesn't give for
   * free (e.g. a business's own website) — callers can relabel it accordingly. */
  label?: string;
  placeholder?: string;
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/** An app-agnostic URL field with an on-demand preview fetch. Fetched once when
 * the user attaches or changes the link, never on render. */
function LinkAttachField({
  url,
  preview,
  onChange,
  onUseTitle,
  currentTitle,
  label = 'Link (optional)',
  placeholder = 'https://…',
}: LinkAttachFieldProps) {
  const queryClient = useQueryClient();
  const [draftUrl, setDraftUrl] = useState(url);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runFetch = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      onChange('', null);
      return;
    }
    if (!isValidHttpUrl(trimmed)) {
      setError('Enter a valid http/https link.');
      return;
    }

    setError(null);
    setIsFetching(true);
    try {
      const result = await queryClient.fetchQuery(linkMetadataQueryOptions(trimmed));
      onChange(trimmed, {
        title: result.title,
        description: result.description,
        imageUrl: result.imageUrl,
        siteName: result.siteName,
        fetchedAt: result.fetchedAt,
      });
    } catch (fetchError) {
      // The link is still worth keeping even without a preview.
      onChange(trimmed, null);
      setError(getErrorMessage(fetchError, "Couldn't load a preview — link saved anyway."));
    } finally {
      setIsFetching(false);
    }
  };

  const clearLink = () => {
    setDraftUrl('');
    setError(null);
    onChange('', null);
  };

  const attachedUrl = url.trim();
  const isTitleApplied =
    Boolean(preview?.title) && currentTitle?.trim() === preview?.title?.trim();

  return (
    <div className='space-y-1.5'>
      <Label>{label}</Label>
      {attachedUrl ? (
        <div className='border-border bg-card flex items-center gap-3 rounded-md border p-2'>
          {preview?.imageUrl && (
            <img
              src={preview.imageUrl}
              alt=''
              loading='lazy'
              referrerPolicy='no-referrer'
              className='h-12 w-12 shrink-0 rounded object-cover'
              onError={(event) => {
                event.currentTarget.style.display = 'none';
              }}
            />
          )}
          <div className='min-w-0 flex-1'>
            {preview?.title && <p className='truncate text-sm font-medium'>{preview.title}</p>}
            <ExternalLinkText href={attachedUrl} className='text-xs' />
          </div>
          {onUseTitle && preview?.title && (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='shrink-0'
              disabled={isTitleApplied}
              onClick={() => onUseTitle(preview.title as string)}
            >
              {isTitleApplied ? '✓ Title applied' : 'Use title'}
            </Button>
          )}
          <Button
            type='button'
            variant='tertiary'
            size='icon'
            aria-label='Remove link'
            className='shrink-0'
            onClick={clearLink}
          >
            <X className='h-4 w-4' />
          </Button>
        </div>
      ) : (
        <div className='flex gap-2'>
          <div className='flex-1'>
            <Input
              type='url'
              placeholder={placeholder}
              value={draftUrl}
              disabled={isFetching}
              onChange={(event) => setDraftUrl(event.target.value)}
              onBlur={() => {
                if (draftUrl.trim()) {
                  void runFetch(draftUrl);
                }
              }}
            />
          </div>
          <Button
            type='button'
            variant='secondary'
            size='sm'
            loading={isFetching}
            disabled={isFetching || !draftUrl.trim()}
            onClick={() => void runFetch(draftUrl)}
          >
            Fetch preview
          </Button>
        </div>
      )}
      {error && <p className='text-muted-foreground text-xs'>{error}</p>}
    </div>
  );
}

export default LinkAttachField;
