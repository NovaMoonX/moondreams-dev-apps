/** CSS `aspect-ratio` values; a picture from elsewhere keeps its source's shape, never squared. */
export const IMAGE_SHAPES = {
  poster: '2/3',
  square: '1/1',
  landscape: '4/3',
  wide: '16/9',
} as const;

export type ImageShape = keyof typeof IMAGE_SHAPES;
