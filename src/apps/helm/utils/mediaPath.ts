/** Where a photo's sealed bytes (or its sealed thumbnail) are kept in Storage. */
export const getMediaObjectPath = (
  uid: string,
  mediaId: string,
  isThumb: boolean,
) => `apps/helm/media/${uid}/${mediaId}${isThumb ? '.thumb' : ''}`;
