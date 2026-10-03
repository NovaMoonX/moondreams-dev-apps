export function getInitials(name: string): string {
  const names = name.split(' ');
  const initials = names
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || '??';
  return initials;
}
export function getProviderPhotoURL(user: {
  providerData: Array<{ providerId: string; photoURL: string | null }>;
}): string | null {
  const result =
    user.providerData.find((info) => info.providerId === 'google.com')
      ?.photoURL ?? null;
  return result;
}

export function getAvatarStoragePath(uid: string): string {
  const result = `users/${uid}/avatar`;
  return result;
}
