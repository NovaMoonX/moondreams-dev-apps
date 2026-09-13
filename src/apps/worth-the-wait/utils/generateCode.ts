import { generateInviteCode as generateSharedInviteCode } from '@/utils';

export const SPACE_CODE_QUERY_PARAM = 'inviteCode';

export const SPACE_CODE_LENGTH = 6;

export function generateInviteCode() {
  return generateSharedInviteCode(SPACE_CODE_LENGTH);
}

export function generateInviteLink(inviteCode: string) {
  const url = new URL(window.location.href);
  url.searchParams.set(SPACE_CODE_QUERY_PARAM, inviteCode);
  return url.toString();
}
