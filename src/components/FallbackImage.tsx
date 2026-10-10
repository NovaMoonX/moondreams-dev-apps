import { useState, type ImgHTMLAttributes, type ReactNode } from 'react';

interface FallbackImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> {
  src: string;
  alt: string;
  /** Shown if the URL fails to load; nothing by default, so a broken image never leaves a hole or a broken-image icon. */
  fallback?: ReactNode;
}

/** An image whose URL may stop working (a hotlinked photo, a cover): when it fails it renders `fallback`, or nothing. Use it for every image that comes from a user-supplied or third-party URL. */
function FallbackImage({ src, alt, fallback = null, onError, ...imageProps }: FallbackImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === src) {
    return fallback;
  }

  return (
    <img
      loading='lazy'
      referrerPolicy='no-referrer'
      {...imageProps}
      src={src}
      alt={alt}
      onError={(event) => {
        setFailedSrc(src);
        onError?.(event);
      }}
    />
  );
}

export default FallbackImage;
