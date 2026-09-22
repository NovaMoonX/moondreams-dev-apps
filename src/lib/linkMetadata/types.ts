/** Metadata scraped from a URL — a booking/listing link, a site a user attached
 * by hand, or a Google Maps link used as a free photo source for a Places pick. */
export interface LinkPreview {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  fetchedAt: number;
}

export interface FetchedLinkMetadata extends LinkPreview {
  mapsPlace: { name: string; latitude: number; longitude: number } | null;
}
