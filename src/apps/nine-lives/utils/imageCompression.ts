const MAX_IMAGE_DIMENSION = 2_000;
const WEBP_QUALITY = 0.82;

export async function compressIngestionImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  const image = new Image();
  const objectUrl = URL.createObjectURL(file);

  try {
    image.src = objectUrl;
    await image.decode();

    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
    );
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');

    if (!context) {
      return file;
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', WEBP_QUALITY),
    );

    if (!blob) {
      return file;
    }

    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.webp`, {
      type: 'image/webp',
      lastModified: file.lastModified,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
