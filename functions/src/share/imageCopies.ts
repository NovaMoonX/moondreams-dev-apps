import sharp from 'sharp';

/**
 * A WebP copy of an image that fits inside `maxDimension` (never enlarged), turned upright by its orientation tag.
 * An image over 50 million pixels is refused before it is decoded, so a small file cannot unpack into gigabytes of memory.
 * `sharp` drops all metadata unless asked to keep it, so the copy carries no camera, time or location data.
 */
export const toWebpCopy = (source: Buffer, maxDimension: number) =>
  sharp(source, {
    limitInputPixels: 50_000_000,
    sequentialRead: true,
    failOn: 'error',
  })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .toColourspace('srgb')
    .webp({ quality: 80 })
    .toBuffer();
