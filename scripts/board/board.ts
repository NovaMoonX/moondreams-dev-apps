/** The app an issue belongs to, from its one "<App name> (App)" label; null with none, or with several (one Apps value can't hold two). */
export function readAppName(labels: readonly string[]): string | null {
  const names = labels.flatMap((label) => {
    const match = /^(.+) \(App\)$/.exec(label.trim());
    return match ? [match[1]] : [];
  });
  return names.length === 1 ? names[0] : null;
}

export interface SelectField {
  id: string;
  name: string;
  options: { id: string; name: string }[];
}

/** The option of a single-select field whose name matches, ignoring case and spacing. */
export function findOption(
  field: SelectField | undefined,
  name: string,
): { id: string; name: string } | null {
  const wanted = name.trim().toLowerCase();
  return (
    field?.options.find(
      (option) => option.name.trim().toLowerCase() === wanted,
    ) ?? null
  );
}
