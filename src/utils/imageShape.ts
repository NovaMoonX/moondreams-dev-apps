/** The shapes a picture is drawn in, as CSS `aspect-ratio` values; a picture brought in from another app keeps its source's shape (a poster is 2/3), never squared. */
export const IMAGE_SHAPES = {
  poster: '2/3',
  square: '1/1',
  landscape: '4/3',
  wide: '16/9',
} as const;

export type ImageShape = keyof typeof IMAGE_SHAPES;
