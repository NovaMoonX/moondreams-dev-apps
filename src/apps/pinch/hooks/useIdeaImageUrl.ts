import { useStorageImageUrl } from '@apps/pinch/hooks/useStorageImageUrl';
import type { Idea } from '@apps/pinch/types';

export function useIdeaImageUrl(
  idea: Pick<Idea, 'kind' | 'imageUrl' | 'photoPath' | 'updatedAt'>,
) {
  const photoUrl = useStorageImageUrl(
    idea.kind === 'PHOTO' ? (idea.photoPath ?? null) : null,
    idea.updatedAt,
  );
  const pageImage = idea.imageUrl?.startsWith('https://')
    ? idea.imageUrl
    : null;

  return idea.kind === 'PHOTO' ? photoUrl : pageImage;
}
