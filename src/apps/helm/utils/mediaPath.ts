/** Where a photo's sealed bytes (or its sealed thumbnail) are kept in Storage. */
export const getMediaObjectPath = (
  uid: string,
  mediaId: string,
  isThumb: boolean,
) => `apps/helm/media/${uid}/${mediaId}${isThumb ? '.thumb' : ''}`;

/** The Storage objects a medium has: none for a Markdown file (its text is in its document), the main object for a PDF or voice note, and a photo's thumbnail too when it has one. */
export const getMediaObjectPaths = (
  uid: string,
  mediaId: string,
  kind: 'photo' | 'pdf' | 'voiceNote' | 'markdown',
  hasThumb: boolean,
) =>
  kind === 'markdown'
    ? []
    : [
        getMediaObjectPath(uid, mediaId, false),
        ...(kind === 'photo' && hasThumb
          ? [getMediaObjectPath(uid, mediaId, true)]
          : []),
      ];
