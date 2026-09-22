import { useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';

import { getErrorMessage } from '@/utils/errorUtils';
import { fetchLinkMetadata } from '@apps/waypoint/utils/linkMetadataApi';
import type { LinkPreview } from '@apps/waypoint/types';

interface LinkAttachFieldProps {
  url: string;
  preview: LinkPreview | null;
  onChange: (url: string, preview: LinkPreview | null) => void;
  onUseTitle?: (title: string) => void;
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/** A URL field with an on-demand preview fetch — the fallback path for events/stays
 * that aren't on Google Places (an Airbnb listing, tickets, a menu). Fetched once
 * when the user attaches or changes the link, never on render. */
function LinkAttachField({ url, preview, onChange, onUseTitle }: LinkAttachFieldProps) {
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
      const result = await fetchLinkMetadata(trimmed);
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

  return (
    <div className='space-y-1.5'>
      <Label>Booking or listing link (optional)</Label>
      <div className='flex gap-2'>
        <div className='flex-1'>
          <Input
            type='url'
            placeholder='https://www.airbnb.com/rooms/…'
            value={draftUrl}
            disabled={isFetching}
            onChange={(event) => setDraftUrl(event.target.value)}
            onBlur={() => {
              if (draftUrl.trim() !== url.trim()) {
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
          {preview ? 'Refresh' : 'Fetch preview'}
        </Button>
      </div>
      {error && <p className='text-muted-foreground text-xs'>{error}</p>}
      {preview && (preview.title || preview.imageUrl) && (
        <div className='border-border bg-card flex items-center gap-3 rounded-md border p-2'>
          {preview.imageUrl && (
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
            {preview.title && <p className='truncate text-sm font-medium'>{preview.title}</p>}
            {preview.siteName && (
              <p className='text-muted-foreground truncate text-xs'>{preview.siteName}</p>
            )}
          </div>
          {onUseTitle && preview.title && (
            <Button
              type='button'
              variant='link'
              size='sm'
              className='shrink-0'
              onClick={() => onUseTitle(preview.title as string)}
            >
              Use title
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default LinkAttachField;
