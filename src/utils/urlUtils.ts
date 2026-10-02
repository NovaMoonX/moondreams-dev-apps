/** Parses a user-entered link, accepting only http(s) URLs whose hostname ends in a real-looking
 * TLD. Returns null for anything else, including `javascript:` and `data:` links. */
export function parseHttpUrl(value: string) {
  try {
    const parsed = new URL(value.trim());
    const isHttp = ['http:', 'https:'].includes(parsed.protocol);
    const result = isHttp && /\.[a-z]{2,}$/i.test(parsed.hostname) ? parsed : null;
    return result;
  } catch {
    return null;
  }
}

export function isValidHttpUrl(value: string) {
  return parseHttpUrl(value) !== null;
}
