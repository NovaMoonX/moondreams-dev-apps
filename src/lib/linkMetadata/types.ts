/** Metadata scraped from a URL a user attached (booking/listing link, a business's website). */
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
