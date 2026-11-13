import { useAppSelector } from '@/store';
import {
  selectPlacesById,
  selectWhoById,
} from '@apps/helm/store/selectors/whoSelectors';
import type { OpenTask } from '@apps/helm/types';

export interface LinkedName {
  kind: 'person' | 'pet' | 'organization' | 'place';
  id: string;
  name: string;
}

/** The who and places a task links that still exist and open. */
export function useLinkedNames(
  task: Pick<OpenTask, 'whoIds' | 'placeIds'>,
): LinkedName[] {
  const whoById = useAppSelector(selectWhoById);
  const placesById = useAppSelector(selectPlacesById);
  return [
    ...task.whoIds.flatMap((id) => {
      const who = whoById.get(id);
      return who && !who.isUnreadable && who.name
        ? [{ kind: who.kind, id, name: who.name }]
        : [];
    }),
    ...task.placeIds.flatMap((id) => {
      const place = placesById.get(id);
      return place && !place.isUnreadable && place.name
        ? [{ kind: 'place' as const, id, name: place.name }]
        : [];
    }),
  ];
}
