const LOGO_TOKEN = import.meta.env.VITE_STORE_LOGO_TOKEN as string | undefined;

/** A company's logo by its web domain, from the site's one logo service; null without a token, so a caller draws its own stand-in. Only the domain and a publishable token go out. */
export function brandLogoUrl(domain: string): string | null {
  if (!LOGO_TOKEN) {
    return null;
  }

  return `https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(LOGO_TOKEN)}&size=96&format=png&fallback=404`;
}

/** Whether a logo from the logo service can be drawn on this build, so a screen shows its credit only when it may show one. */
export const hasBrandLogos = () => Boolean(LOGO_TOKEN);
