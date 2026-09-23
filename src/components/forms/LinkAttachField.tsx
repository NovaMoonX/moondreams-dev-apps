import { useRef, useState } from 'react';

import { Button, Input, Label } from '@moondreamsdev/dreamer-ui/components';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';

import ExternalLinkText from '@/components/ExternalLinkText';
import { DEBOUNCE_MS, useDebouncedCallback } from '@/hooks/useDebounce';
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
  /** Text of the link-style button that reveals the field; hidden until clicked. */
  addLabel?: string;
}

function isValidHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return ['http:', 'https:'].includes(parsed.protocol) && /\.[a-z]{2,}$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

/** An app-agnostic URL field that fetches a preview on its own once the text is a valid
 * link — after a typing pause, on paste, or on blur. Never refetched on render. */
function LinkAttachField({
  url,
  preview,
  onChange,
  onUseTitle,
  currentTitle,
  label = 'Link',
  placeholder = 'https://…',
  addLabel = '+ Add link',
}: LinkAttachFieldProps) {
  const queryClient = useQueryClient();
  const [draftUrl, setDraftUrl] = useState(url);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const latestDraftRef = useRef(url.trim());
  const justPastedRef = useRef(false);

  // `commit` = the user is done with the field (paste/blur): keep the link even if no
  // preview loads. A typing-pause fetch that fails may just be a half-typed URL, so it
  // doesn't attach anything.
  const runFetch = async (value: string, commit: boolean) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError(null);
      return;
    }
    if (!isValidHttpUrl(trimmed)) {
      if (commit) {
        setError('Enter a valid http/https link.');
      }
      return;
    }

    setError(null);
    setIsFetching(true);
    try {
      const result = await queryClient.fetchQuery(linkMetadataQueryOptions(trimmed));
      if (latestDraftRef.current !== trimmed) {
        return;
      }
      onChange(trimmed, {
        title: result.title,
        description: result.description,
        imageUrl: result.imageUrl,
        siteName: result.siteName,
        fetchedAt: result.fetchedAt,
      });
    } catch (fetchError) {
      if (latestDraftRef.current !== trimmed) {
        return;
      }
      if (commit) {
        onChange(trimmed, null);
        setError(getErrorMessage(fetchError, "Couldn't load a preview — link saved anyway."));
      } else {
        setError("Couldn't load a preview yet — keep typing, or leave the field to save the link.");
      }
    } finally {
      setIsFetching(false);
    }
  };

  const scheduleAutoFetch = useDebouncedCallback(
    (value: string) => void runFetch(value, false),
    DEBOUNCE_MS.linkDetection,
  );

  const handleDraftChange = (value: string) => {
    setDraftUrl(value);
    latestDraftRef.current = value.trim();
    setError(null);
    scheduleAutoFetch.cancel();
    if (justPastedRef.current) {
      justPastedRef.current = false;
      void runFetch(value, true);
      return;
    }
    if (isValidHttpUrl(value.trim())) {
      scheduleAutoFetch.run(value);
    }
  };

  const clearLink = () => {
    setDraftUrl('');
    setIsRevealed(true);
    latestDraftRef.current = '';
    setError(null);
    onChange('', null);
  };

  const attachedUrl = url.trim();
  const isTitleApplied =
    Boolean(preview?.title) && currentTitle?.trim() === preview?.title?.trim();

  if (!attachedUrl && !isRevealed && !draftUrl) {
    return (
      <Button
        type='button'
        variant='link'
        size='sm'
        className='h-auto p-0'
        onClick={() => setIsRevealed(true)}
      >
        {addLabel}
      </Button>
    );
  }

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
        <Input
          type='url'
          autoFocus
          placeholder={placeholder}
          value={draftUrl}
          onChange={(event) => handleDraftChange(event.target.value)}
          onPaste={() => {
            justPastedRef.current = true;
          }}
          onBlur={() => {
            justPastedRef.current = false;
            scheduleAutoFetch.cancel();
            void runFetch(draftUrl, true);
          }}
        />
      )}
      {isFetching && <p className='text-muted-foreground text-xs'>Fetching preview…</p>}
      {error && <p className='text-muted-foreground text-xs'>{error}</p>}
    </div>
  );
}

export default LinkAttachField;
