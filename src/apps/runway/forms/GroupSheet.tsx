import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { Archive, Pencil } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import { MASK } from '@/components/SensitiveValue';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateUTC } from '@/utils/formatUtils';
import {
  GROUP_WORDS,
  MAX_NAME_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import SheetHead from '@apps/runway/components/SheetHead';
import { RangeBasisNote } from '@apps/runway/components/RangeNote';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  archiveItem,
  changeItem,
} from '@apps/runway/store/actions/itemActions';
import {
  selectGroups,
  selectStance,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { GroupTotal } from '@apps/runway/engine/groups';
import type { GroupSealed, Priority } from '@apps/runway/types';
import { describeGroupTotal } from '@apps/runway/utils/billText';
import { describeChange } from '@apps/runway/utils/changeText';

type StartingChoice = Priority | 'none';

interface GroupSheetProps {
  groupId: string;
  /** What the group's bills come to in a month, worked out by the screen that lists them. */
  total: GroupTotal;
  billCount: number;
  today: number;
  onClose: () => void;
}

const startingOptions = [
  ...PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
  { value: 'none' as const, label: GROUP_WORDS.noPriority },
];

/** A group's sheet: what its bills come to a month, its name, the priority a new bill in it starts with, and archiving it. */
function GroupSheet({
  groupId,
  total,
  billCount,
  today,
  onClose,
}: GroupSheetProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { isHidden } = useValuesHidden();
  const stance = useAppSelector(selectStance);
  const group = useAppSelector((state) =>
    selectGroups(state, today).find(({ item }) => item.id === groupId),
  );
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!group) return null;
  const payload = group.version.payload;
  const hasRange = !isHidden && total.total.lowCents !== total.total.highCents;

  const save = async (next: GroupSealed) => {
    if (!user) return;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await changeItem(user.uid, encryption, {
        itemId: groupId,
        kind: 'group',
        payload: next,
        summary: `${next.name}: ${describeChange(payload, next)}, from ${formatDateUTC(today)}.`,
        note: null,
        effectiveFrom: today,
      });
      setIsRenaming(false);
    } catch (saveError) {
      setError(getErrorMessage(saveError, GROUP_WORDS.saveFailed));
    } finally {
      setIsSaving(false);
    }
  };

  const archive = async () => {
    if (!user) return;
    const isConfirmed = await confirm({
      title: GROUP_WORDS.archiveTitle(payload.name),
      message: GROUP_WORDS.archiveBody(billCount),
      confirmText: GROUP_WORDS.archive,
      destructive: true,
    });
    if (!isConfirmed) return;
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      await archiveItem(
        user.uid,
        encryption,
        {
          itemId: groupId,
          summary: GROUP_WORDS.archived(payload.name),
          note: null,
          heldChoice: null,
        },
        today,
      );
      onClose();
    } catch (archiveError) {
      setError(getErrorMessage(archiveError, GROUP_WORDS.archiveFailed));
      setIsSaving(false);
    }
  };

  const trimmed = name.trim();
  const canRename = trimmed !== '' && trimmed !== payload.name;

  return (
    <FormSheet
      isOpen
      onClose={onClose}
      title={payload.name}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-4'>
        {isRenaming ? (
          <>
            <BackLink onBack={() => setIsRenaming(false)} />
            <Input
              variant='outline'
              aria-label={GROUP_WORDS.rename}
              maxLength={MAX_NAME_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <ModalFooterActions
              note={error}
              cancelAction={
                <Button
                  type='button'
                  variant='secondary'
                  onClick={() => setIsRenaming(false)}
                  disabled={isSaving}
                >
                  Cancel
                </Button>
              }
              rightActions={
                <Button
                  type='button'
                  loading={isSaving}
                  disabled={isSaving || !canRename}
                  onClick={() => void save({ ...payload, name: trimmed })}
                >
                  Save
                </Button>
              }
            />
          </>
        ) : (
          <>
            <SheetHead
              label={GROUP_WORDS.monthLabel}
              figure={isHidden ? MASK : describeGroupTotal(total.total)}
              help={
                <>
                  <p>{GROUP_WORDS.basis}</p>
                  {total.uncounted > 0 && (
                    <p>{GROUP_WORDS.uncounted(total.uncounted)}</p>
                  )}
                  {hasRange && (
                    <RangeBasisNote stance={stance} side='expense' />
                  )}
                </>
              }
              helpTitle={GROUP_WORDS.basisTitle}
            />
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>
                {GROUP_WORDS.startingPriority}
              </p>
              <PillGroup
                label={GROUP_WORDS.startingPriority}
                options={startingOptions}
                value={payload.startingPriority ?? 'none'}
                onChange={(choice: StartingChoice) =>
                  void save({
                    ...payload,
                    startingPriority: choice === 'none' ? null : choice,
                  })
                }
              />
              <p className='text-muted-foreground text-xs'>
                {GROUP_WORDS.startingPriorityHelp}
              </p>
            </div>
            <ActionGroup>
              <ActionRow
                isGrouped
                hasChevron
                icon={<Pencil />}
                label={GROUP_WORDS.rename}
                onClick={() => {
                  setName(payload.name);
                  setIsRenaming(true);
                }}
              />
              <ActionRow
                isGrouped
                isDestructive
                icon={<Archive />}
                label={GROUP_WORDS.archive}
                isDisabled={isSaving}
                onClick={() => void archive()}
              />
            </ActionGroup>
            {error && <p className='text-destructive text-sm'>{error}</p>}
          </>
        )}
      </div>
    </FormSheet>
  );
}

export default GroupSheet;
