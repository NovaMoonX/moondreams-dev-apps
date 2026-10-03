export interface MovieSnapshot {
  title: string;
  /** Date-only (UTC midnight): the release date; null if unknown. */
  releaseDate: number | null;
  posterUrl: string | null;
  runtimeMinutes: number | null;
  contentRating: string | null;
}

export interface MovieSearchResult {
  movieKey: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
}
