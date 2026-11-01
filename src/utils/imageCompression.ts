/** What a picked photo is for, which decides how far it is shrunk before upload. */
export type ImageUse = 'thumbnail' | 'avatar' | 'photo' | 'cover' | 'document';

interface ImageUseSize {
  maxDimension: number;
  quality: number;
}

export const IMAGE_USE_SIZES: Record<ImageUse, ImageUseSize> = {
  thumbnail: { maxDimension: 512, quality: 0.8 },
  avatar: { maxDimension: 512, quality: 0.85 },
  photo: { maxDimension: 1280, quality: 0.82 },
  cover: { maxDimension: 1600, quality: 0.82 },
  document: { maxDimension: 2400, quality: 0.88 },
};

/** Kept under Storage's 5 MB photo rule with room to spare. */
export const MAX_PHOTO_UPLOAD_BYTES = 4.5 * 1024 * 1024;

const FALLBACK_QUALITIES = [0.7, 0.55, 0.4];
const FALLBACK_SCALE = 0.75;
const MIN_FALLBACK_DIMENSION = 320;
const MAX_IMAGE_DIMENSION = 2_000;
const WEBP_QUALITY = 0.82;

const toWebpName = (name: string) => `${name.replace(/\.[^.]+$/, '')}.webp`;

const withDecodedImage = async <T,>(
  file: File,
  onDecoded: (image: HTMLImageElement) => Promise<T>,
  onFailed: T,
): Promise<T> => {
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    image.src = objectUrl;
    await image.decode();
    return await onDecoded(image);
  } catch {
    return onFailed;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const encodeWebp = async (
  image: HTMLImageElement,
  maxDimension: number,
  quality: number,
): Promise<Blob | null> => {
  const scale = Math.min(
    1,
    maxDimension / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', quality),
  );
  return blob?.type === 'image/webp' ? blob : null;
};

const fitsAlready = (
  file: File,
  image: HTMLImageElement,
  maxDimension: number,
  maxBytes: number,
) =>
  file.type === 'image/webp' &&
  file.size <= maxBytes &&
  Math.max(image.naturalWidth, image.naturalHeight) <= maxDimension;

const getSmallerDimensions = (from: number): number[] => {
  const next = Math.round(from * FALLBACK_SCALE);
  if (from <= MIN_FALLBACK_DIMENSION) return [];
  if (next <= MIN_FALLBACK_DIMENSION) return [MIN_FALLBACK_DIMENSION];
  return [next, ...getSmallerDimensions(next)];
};

const getAttempts = ({ maxDimension, quality }: ImageUseSize) => [
  ...[quality, ...FALLBACK_QUALITIES.filter((q) => q < quality)].map((q) => ({
    maxDimension,
    quality: q,
  })),
  ...getSmallerDimensions(maxDimension).map((dimension) => ({
    maxDimension: dimension,
    quality: FALLBACK_QUALITIES[1],
  })),
];

/**
 * Shrinks a photo for its use and re-encodes it as WebP under `maxBytes`, stepping quality and then size
 * down until it fits. Returns `null` when the file isn't an image this browser can open (HEIC on desktop).
 */
export async function compressImageForUse(
  file: File,
  use: ImageUse,
  maxBytes: number = MAX_PHOTO_UPLOAD_BYTES,
): Promise<File | null> {
  if (!file.type.startsWith('image/') && file.type !== '') return null;
  const size = IMAGE_USE_SIZES[use];

  return withDecodedImage<File | null>(
    file,
    async (image) => {
      if (fitsAlready(file, image, size.maxDimension, maxBytes)) return file;
      const blob = await getAttempts(size).reduce<Promise<Blob | null>>(
        async (previous, attempt) => {
          const found = await previous;
          if (found && found.size <= maxBytes) return found;
          return encodeWebp(image, attempt.maxDimension, attempt.quality);
        },
        Promise.resolve(null),
      );
      if (!blob || blob.size > maxBytes) return null;
      return new File([blob], toWebpName(file.name), {
        type: 'image/webp',
        lastModified: file.lastModified,
      });
    },
    null,
  );
}

/** Shrinks a photo before it is sent to the AI extraction models; anything that is not an image, or that
 * the browser can't decode (the models read HEIC themselves), passes through untouched. */
export async function compressIngestionImage(file: File): Promise<File> {
  return resizeImageToWebp(file, MAX_IMAGE_DIMENSION);
}

/** Scales an image down to fit `maxDimension` on its longer edge and re-encodes it as WebP; a non-image, or one the browser can't decode, passes through untouched. */
export async function resizeImageToWebp(
  file: File,
  maxDimension: number,
): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  return withDecodedImage(
    file,
    async (image) => {
      const blob = await encodeWebp(image, maxDimension, WEBP_QUALITY);
      if (!blob) return file;
      return new File([blob], toWebpName(file.name), {
        type: 'image/webp',
        lastModified: file.lastModified,
      });
    },
    file,
  );
}
