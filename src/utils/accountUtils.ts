export function getInitials(name: string): string {
  const names = name.split(' ');
  const initials = names
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 2) || '??';
  return initials;
}