const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const DEFAULT_INVITE_CODE_LENGTH = 6;

/** Random invite code (no ambiguous chars like 0/O or 1/I) for a shared container's join-by-code flow. */
export function generateInviteCode(length: number = DEFAULT_INVITE_CODE_LENGTH) {
  let code = '';

  for (let index = 0; index < length; index += 1) {
    code += INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)];
  }

  return code;
}
