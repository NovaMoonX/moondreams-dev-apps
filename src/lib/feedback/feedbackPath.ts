/** The screen a person was on, safe to store with a report: no query string, and share ids replaced. */
export function toSafeFeedbackPath(pathname: string): string {
  return pathname.replace(/\/shared\/[^/]+/g, '/shared/…').slice(0, 300);
}
