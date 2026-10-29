import { NEW_CHOICE } from '@/components/forms/PickOrCreate';
import { createOptionMatcher } from '@/utils/optionMatchUtils';
import type { GroupSealed } from '@apps/runway/types';

/** Stands in for a group that is written with the bill, so a change to "a new group" reads as a change. */
export const NEW_GROUP_ID = '__new_group__';

const groupMatcher = createOptionMatcher<{ id: string; name: string }>({
  names: (option) => [option.name],
  typos: false,
  casing: { style: 'sentence', keepAcronyms: true, keepMixedCase: true },
});

/** What a group question's answer means: the group it joins, or the new one it makes, and the name either way ('' for none). */
export function resolveGroupChoice(
  choice: string,
  newText: string,
  groups: readonly { id: string; name: string }[],
): { groupId: string | null; newGroup: GroupSealed | null; name: string } {
  if (choice === '') return { groupId: null, newGroup: null, name: '' };
  if (choice !== NEW_CHOICE) {
    const found = groups.find(({ id }) => id === choice);
    return { groupId: choice, newGroup: null, name: found?.name ?? '' };
  }
  if (newText.trim() === '') return { groupId: null, newGroup: null, name: '' };
  const resolved = groupMatcher.resolve(newText, [...groups]);
  if (resolved.kind === 'match') {
    return {
      groupId: resolved.option.id,
      newGroup: null,
      name: resolved.option.name,
    };
  }
  return {
    groupId: null,
    newGroup: { name: resolved.label, startingPriority: null },
    name: resolved.label,
  };
}

/** A group's new name: refused when it matches another group, otherwise written the way a new group's is. */
export function resolveGroupRename(
  text: string,
  groupId: string,
  groups: readonly { id: string; name: string }[],
): { kind: 'taken' | 'name'; name: string } {
  const resolved = groupMatcher.resolve(
    text,
    groups.filter(({ id }) => id !== groupId),
  );
  return resolved.kind === 'match'
    ? { kind: 'taken', name: resolved.option.name }
    : { kind: 'name', name: resolved.label };
}
