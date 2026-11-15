// Only hosts that serve no one else's content prove who a client is; a registered name is the client's own claim.
const VERIFIED: readonly (readonly [string, readonly string[]])[] = [
  ['Claude', ['claude.ai']],
  ['ChatGPT', ['chatgpt.com']],
];

const FALLBACK_NAME = 'Unnamed assistant';
const MAX_NAME_LENGTH = 40;

const hostOf = (clientId: string) => {
  try {
    return new URL(clientId).hostname.toLowerCase();
  } catch {
    return null;
  }
};

/** The name proven by the client id's host, or null when the host proves nothing. */
export const verifiedClientName = (clientId: string) => {
  const host = hostOf(clientId);
  return host === null
    ? null
    : (VERIFIED.find(([, hosts]) => hosts.includes(host))?.[0] ?? null);
};

/** The name a person knows an assistant by: a verified host's name, else its registered name unless that claims a verified one. */
export function clientNameFor(
  clientId: string,
  registeredName: string | null = null,
): string {
  const verified = verifiedClientName(clientId);
  if (verified) return verified;
  const claimed = (registeredName ?? '')
    .replace(/[\p{Cc}\p{Cf}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  const isImpersonating = VERIFIED.some(([name]) =>
    claimed.toLowerCase().includes(name.toLowerCase()),
  );
  return claimed && !isImpersonating ? claimed : FALLBACK_NAME;
}
