import { useUserInfo } from '@/hooks/useUserInfo';
import { toFirstName } from '@apps/going-once/utils/personName';

/** First names for these people, "You" for the signed-in one; "Someone" while a profile is unnamed. */
export function usePersonNames(uids: string[], myUid: string) {
  const people = useUserInfo(uids);
  return (uid: string) => {
    if (uid === myUid) return 'You';
    return toFirstName(people?.map[uid]?.displayName);
  };
}
