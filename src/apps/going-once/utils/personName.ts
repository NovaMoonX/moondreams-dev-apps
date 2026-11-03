/** A person's first name for a sentence; a profile name that holds an email (the sign-in fallback) is no name. */
export function toFirstName(displayName: string | null | undefined): string {
  const name = displayName?.trim() ?? '';
  if (name === '' || name.includes('@')) return 'Someone';
  return name.split(/\s+/)[0];
}
