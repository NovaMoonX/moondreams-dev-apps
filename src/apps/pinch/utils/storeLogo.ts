const LOGO_TOKEN = import.meta.env.VITE_STORE_LOGO_TOKEN as string | undefined;

/** The one place the logo provider is chosen: the web domain and a publishable token go out, nothing else. Null without a token, so the letter tile shows. */
export function storeLogoUrl(domain: string): string | null {
  if (!LOGO_TOKEN) {
    return null;
  }

  return `https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(LOGO_TOKEN)}&size=96&format=png&fallback=404`;
}
