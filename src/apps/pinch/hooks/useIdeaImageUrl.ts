import { useStorageImageUrl } from '@apps/pinch/hooks/useStorageImageUrl';
import type { Idea } from '@apps/pinch/types';
import { getIdeaPhotoPaths } from '@apps/pinch/utils/ideas';

export function useIdeaImageUrl(
  idea: Pick<
    Idea,
    'kind' | 'imageUrl' | 'photoPath' | 'photoPaths' | 'updatedAt'
  >,
) {
  const photoUrl = useStorageImageUrl(
    getIdeaPhotoPaths(idea)[0] ?? null,
    idea.updatedAt,
  );
  const pageImage = idea.imageUrl?.startsWith('https://')
    ? idea.imageUrl
    : null;

  return idea.kind === 'PHOTO' ? photoUrl : pageImage;
}
