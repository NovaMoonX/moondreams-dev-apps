// Generated from src/apps/helm/utils/assistantName.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
export const ASSISTANT_NAME_MAX = 16;

const ASSISTANT_NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} '-]*$/u;

/** The assistant's name once it is safe to put in a prompt or a wake phrase: trimmed, single-spaced, 1 to 16 letters, numbers, inner spaces, hyphens or apostrophes; otherwise null. */
export function readAssistantName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length === 0 || name.length > ASSISTANT_NAME_MAX) return null;
  return ASSISTANT_NAME_PATTERN.test(name) ? name : null;
}
