import FallbackImage from '@/components/FallbackImage';

interface LinkPreviewCardProps {
  /** Shown as the name when the page gave no title. */
  host: string;
  /** Null while the page is still being looked up. */
  preview: {
    title: string | null;
    siteName: string | null;
    description: string | null;
    imageUrl: string | null;
  } | null;
}

/** What a pasted link points at: its picture, title and site, so the person sees it was understood. */
function LinkPreviewCard({ host, preview }: LinkPreviewCardProps) {
  const title = preview?.title ?? host;
  const site = preview?.siteName ?? host;
  const tile = (
    <div
      className='bg-accent flex h-16 w-16 shrink-0 items-center justify-center rounded-xl text-2xl'
      aria-hidden='true'
    >
      🔗
    </div>
  );

  return (
    <div
      className='border-border bg-card flex items-start gap-3 rounded-2xl border p-3'
      aria-busy={preview === null}
    >
      {preview?.imageUrl ? (
        <FallbackImage
          src={preview.imageUrl}
          alt=''
          className='h-16 w-16 shrink-0 rounded-xl object-cover'
          fallback={tile}
        />
      ) : (
        tile
      )}
      <div className='min-h-16 min-w-0 flex-1'>
        {preview === null ? (
          <p className='text-muted-foreground py-1 text-sm'>
            Looking up the page…
          </p>
        ) : (
          <>
            <p className='line-clamp-2 text-sm font-medium break-words'>
              {title}
            </p>
            <p className='text-muted-foreground mt-0.5 truncate text-xs'>
              {site}
            </p>
            {preview.description && (
              <p className='text-muted-foreground mt-1 line-clamp-2 text-xs break-words'>
                {preview.description}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default LinkPreviewCard;
