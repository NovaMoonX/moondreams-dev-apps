import { useState } from 'react';

interface EnrichedImageProps {
  src: string;
  alt: string;
  className: string;
}

/** Renders a hotlinked preview/place image and hides itself if the URL no longer loads. */
function EnrichedImage({ src, alt, className }: EnrichedImageProps) {
  const [isHidden, setIsHidden] = useState(false);

  if (isHidden) {
    return null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading='lazy'
      referrerPolicy='no-referrer'
      onError={() => setIsHidden(true)}
    />
  );
}

export default EnrichedImage;
