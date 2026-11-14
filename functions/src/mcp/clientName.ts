const NAMES: readonly (readonly [string, readonly string[]])[] = [
  ['Claude', ['claude.ai', 'anthropic.com']],
  ['ChatGPT', ['chatgpt.com', 'openai.com']],
  ['Gemini', ['google.com', 'googleusercontent.com']],
];

const FALLBACK_NAME = 'An assistant';

const hostOf = (clientId: string) => {
  try {
    return new URL(clientId).hostname.toLowerCase();
  } catch {
    return null;
  }
};

const isHostOrSubdomain = (host: string, domain: string) =>
  host === domain || host.endsWith(`.${domain}`);

/** The name a person knows an assistant by, worked out from its OAuth client id. Unknown clients are "An assistant". */
export function clientNameFor(clientId: string): string {
  const host = hostOf(clientId);
  if (!host) return FALLBACK_NAME;
  if (host.split('.').includes('gemini')) return 'Gemini';
  return (
    NAMES.find(([, domains]) =>
      domains.some((domain) => isHostOrSubdomain(host, domain)),
    )?.[0] ?? FALLBACK_NAME
  );
}
