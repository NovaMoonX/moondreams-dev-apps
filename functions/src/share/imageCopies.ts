import sharp from 'sharp';

/**
 * A WebP copy of an image that fits inside `maxDimension` (never enlarged), turned upright by its orientation tag.
 * `sharp` drops all metadata unless asked to keep it, so the copy carries no camera, time or location data.
 */
export const toWebpCopy = (source: Buffer, maxDimension: number) =>
  sharp(source)
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: 80 })
    .toBuffer();
