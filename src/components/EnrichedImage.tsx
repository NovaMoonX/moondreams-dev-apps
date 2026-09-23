import { useState } from 'react';

import { useQueryClient } from '@tanstack/react-query';

import { linkMetadataQueryOptions } from '@/lib/linkMetadata/linkMetadataQueries';
import type { PlaceRef } from '@/lib/places/types';

const REFRESH_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
// Module-level (not per-component) so a place already retried this tab doesn't
// retry again from a different card showing the same place.
const attemptedRefreshes = new Set<string>();

interface RefreshablePlace {
  place: PlaceRef;
  canEdit: boolean;
  onRefreshed: (photoUrl: string | null, photoRefreshedAt: number) => void;
}

interface EnrichedImageProps {
  src: string;
  alt: string;
  className: string;
  refreshFrom?: RefreshablePlace;
}

/** Renders a hotlinked preview/place image and hides itself gracefully on error.
 * When the broken image belongs to a Places pick (rather than an attached link),
 * and the viewer can edit, it retries the scrape at most once per place per
 * browser session, and only if the stored photo hasn't been refreshed in the last
 * 7 days — keeping the retry rare, since it costs a real (if unbilled) fetch. */
function EnrichedImage({ src, alt, className, refreshFrom }: EnrichedImageProps) {
  const queryClient = useQueryClient();
  const [isHidden, setIsHidden] = useState(false);

  if (isHidden) {
    return null;
  }

  const handleError = () => {
    setIsHidden(true);

    if (!refreshFrom?.canEdit) {
      return;
    }
    const { place, onRefreshed } = refreshFrom;
    const isStale =
      place.photoRefreshedAt === null ||
      Date.now() - place.photoRefreshedAt > REFRESH_COOLDOWN_MS;
    if (!isStale || attemptedRefreshes.has(place.placeId)) {
      return;
    }
    attemptedRefreshes.add(place.placeId);

    // staleTime 0: the cached result is what produced the now-broken URL.
    queryClient
      .fetchQuery({ ...linkMetadataQueryOptions(place.mapsUrl), staleTime: 0 })
      .then((result) => {
        const photoUrl =
          result.imageUrl && result.imageUrl.includes('googleusercontent.com')
            ? result.imageUrl
            : null;
        onRefreshed(photoUrl, Date.now());
      })
      .catch(() => {
        onRefreshed(null, Date.now());
      });
  };

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading='lazy'
      referrerPolicy='no-referrer'
      onError={handleError}
    />
  );
}

export default EnrichedImage;
