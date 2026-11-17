import { useMemo } from 'react';

import { useAppSelector } from '@/store';
import {
  selectLiveSourceKeys,
  selectOpenGroupings,
} from '@apps/helm/store/selectors/groupingSelectors';
import {
  createGroupingSession,
  pickFiledLine,
  pickGroupingOffer,
} from '@apps/helm/utils/groupingOffer';

const session = createGroupingSession();

export function useGroupingOffer(now: number) {
  const groupings = useAppSelector(selectOpenGroupings);
  const liveKeys = useAppSelector(selectLiveSourceKeys);
  const isLoaded = useAppSelector((state) => state.helm.groupings.isLoaded);
  return useMemo(() => {
    if (!isLoaded) return { offer: null, filed: null };
    const offer = pickGroupingOffer(session, groupings, now, liveKeys);
    return { offer, filed: offer ? null : pickFiledLine(session, groupings) };
  }, [groupings, liveKeys, isLoaded, now]);
}
