/** The apps that may read other apps, and where each shows one of its grants. */
export const READER_APPS: Record<
  string,
  { grantPagePath: (grantId: string) => string }
> = {
  helm: {
    grantPagePath: (grantId) =>
      `/helm?view=connection&grant=${encodeURIComponent(grantId)}`,
  },
};
