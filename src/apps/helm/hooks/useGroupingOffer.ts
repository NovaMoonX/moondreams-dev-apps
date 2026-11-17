import { useEffect, useMemo } from 'react';

import { useAppSelector } from '@/store';
import {
  selectLiveSourceKeys,
  selectOpenGroupings,
} from '@apps/helm/store/selectors/groupingSelectors';
import {
  createGroupingSession,
  pickFiledLine,
  pickGroupingOffer,
  type GroupingSession,
} from '@apps/helm/utils/groupingOffer';

const sessions = new Map<string, GroupingSession>();

export function useGroupingOffer(now: number) {
  const uid = useAppSelector((state) => state.helm.uid);
  const groupings = useAppSelector(selectOpenGroupings);
  const liveKeys = useAppSelector(selectLiveSourceKeys);
  const isLoaded = useAppSelector((state) => state.helm.groupings.isLoaded);
  const picked = useMemo(() => {
    if (!isLoaded || !uid) return { offer: null, filed: null, session: null };
    const session = { ...(sessions.get(uid) ?? createGroupingSession()) };
    const offer = pickGroupingOffer(session, groupings, now, liveKeys);
    return {
      offer,
      filed: offer ? null : pickFiledLine(session, groupings),
      session,
    };
  }, [groupings, liveKeys, isLoaded, uid, now]);

  useEffect(() => {
    if (uid && picked.session) sessions.set(uid, picked.session);
  }, [uid, picked.session]);

  return { offer: picked.offer, filed: picked.filed };
}
