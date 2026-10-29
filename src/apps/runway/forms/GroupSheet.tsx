import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import { Archive, Pencil, Receipt } from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import FormSheet from '@/components/FormSheet';
import HelpTip from '@/components/HelpTip';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import SensitiveValue from '@/components/SensitiveValue';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useAppSelector } from '@/store';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShortUTC, formatDateUTC } from '@/utils/formatUtils';
import {
  GROUP_WORDS,
  MAX_NAME_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import SheetHead from '@apps/runway/components/SheetHead';
import { MaskedText } from '@apps/runway/components/MaskedText';
import BillForm from '@apps/runway/forms/BillForm';
import GroupTotalHelp from '@apps/runway/components/GroupTotalHelp';
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
import {
  describeGroupLead,
  describeGroupTotal,
} from '@apps/runway/utils/billText';
import { resolveGroupRename } from '@apps/runway/utils/groupChoice';
import { describeChange } from '@apps/runway/utils/changeText';

type StartingChoice = Priority | 'none';

interface GroupSheetProps {
  groupId: string;
  /** What the group's bills come to in a month, worked out by the screen that lists them. */
  total: GroupTotal;
  billCount: number;
  /** The names of the bills in the group, as the screen lists them. */
  memberNames: readonly string[];
  today: number;
  onClose: () => void;
}

const startingOptions = [
  ...PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
  { value: 'none' as const, label: GROUP_WORDS.noPriority },
];

/** A group's sheet: what its bills come to a usual month, which they are, adding one, its name, the priority a new bill in it starts with, and archiving it. */
function GroupSheet({
  groupId,
  total,
  billCount,
  memberNames,
  today,
  onClose,
}: GroupSheetProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { isHidden } = useValuesHidden();
  const stance = useAppSelector(selectStance);
  const group = useAppSelector((state) =>
    selectGroups(state, today).find(({ item }) => item.id === groupId),
  );
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [pickedPriority, setPickedPriority] = useState<StartingChoice | null>(
    null,
  );
  const allGroups = useAppSelector((state) => selectGroups(state, today));
  const [isAddingBill, setIsAddingBill] = useState(false);

  if (!group) return null;
  const payload = group.version.payload;
  const hasRange = !isHidden && total.total.lowCents !== total.total.highCents;

  const save = async (
    next: GroupSealed,
    isQuiet = false,
  ): Promise<string | null> => {
    if (!user) return null;
    if (!isQuiet) setIsSaving(true);
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
      return null;
    } catch (saveError) {
      return getErrorMessage(saveError, GROUP_WORDS.saveFailed);
    } finally {
      if (!isQuiet) setIsSaving(false);
    }
  };

  const rename = async (next: string) => {
    setError(null);
    const renamed = resolveGroupRename(
      next,
      groupId,
      allGroups.map(({ item, version }) => ({
        id: item.id,
        name: version.payload.name,
      })),
    );
    if (renamed.kind === 'taken') {
      setError(GROUP_WORDS.nameTaken(renamed.name));
      return;
    }
    if (renamed.name === payload.name) {
      setIsRenaming(false);
      return;
    }
    const failure = await save({ ...payload, name: renamed.name });
    if (failure === null) setIsRenaming(false);
    else setError(failure);
  };

  const setStartingPriority = async (choice: StartingChoice) => {
    setPriorityError(null);
    setPickedPriority(choice);
    const failure = await save(
      { ...payload, startingPriority: choice === 'none' ? null : choice },
      true,
    );
    setPriorityError(
      failure === null ? null : GROUP_WORDS.startingPriorityFailed,
    );
    setPickedPriority((current) => (current === choice ? null : current));
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
          summary: GROUP_WORDS.archived(payload.name, billCount),
          note: null,
          heldChoice: null,
        },
        today,
      );
      addToast({
        title: GROUP_WORDS.archivedToast(payload.name),
        type: 'success',
      });
      onClose();
    } catch (archiveError) {
      setError(getErrorMessage(archiveError, GROUP_WORDS.archiveFailed));
      setIsSaving(false);
    }
  };

  const trimmed = name.trim();
  const canRename = trimmed !== '' && trimmed !== payload.name;
  const lead = describeGroupLead(total, billCount);

  if (isAddingBill) {
    return (
      <BillForm
        isOpen
        title='Bill'
        presetGroupId={groupId}
        onClose={onClose}
        onCancel={() => setIsAddingBill(false)}
      />
    );
  }

  return (
    <FormSheet
      isOpen
      onClose={onClose}
      title={payload.name}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-4 [@media(max-height:599px)]:space-y-2.5'>
        {isRenaming ? (
          <>
            <BackLink onBack={() => setIsRenaming(false)} />
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>
                {GROUP_WORDS.nameLabel}
              </p>
              <Input
                variant='outline'
                aria-label={GROUP_WORDS.nameLabel}
                maxLength={MAX_NAME_LENGTH}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <ModalFooterActions
              note={error}
              rightActions={
                <Button
                  type='button'
                  loading={isSaving}
                  disabled={isSaving || !canRename}
                  onClick={() => void rename(trimmed)}
                >
                  Save
                </Button>
              }
            />
          </>
        ) : (
          <>
            <SheetHead
              label={
                lead.isOneTime
                  ? GROUP_WORDS.oneTimeLabel
                  : GROUP_WORDS.monthLabel
              }
              figure={
                lead.amount === null ? undefined : (
                  <SensitiveValue>{lead.amount}</SensitiveValue>
                )
              }
              suffix={lead.isOneTime ? lead.rest : undefined}
              fact={
                billCount === 0
                  ? GROUP_WORDS.noBills
                  : memberNames.length > 0
                    ? GROUP_WORDS.members(memberNames)
                    : null
              }
              help={
                <GroupTotalHelp
                  total={total}
                  hasRange={hasRange}
                  stance={stance}
                />
              }
              helpTitle={GROUP_WORDS.basisTitle}
            />
            {total.oneTime.count > 0 && !lead.isOneTime && (
              <p className='text-muted-foreground -mt-2 text-sm'>
                <MaskedText>
                  {GROUP_WORDS.plusOneTime(
                    describeGroupTotal(total.oneTime.range),
                    total.oneTime.count,
                    total.oneTime.dueOn === null
                      ? null
                      : formatDateShortUTC(total.oneTime.dueOn),
                  )}
                </MaskedText>
              </p>
            )}
            <div className='space-y-1.5'>
              <div className='flex items-center gap-1'>
                <p className='text-muted-foreground text-xs'>
                  {GROUP_WORDS.startingPriority}
                </p>
                <HelpTip title={GROUP_WORDS.startingPriority}>
                  <p>{GROUP_WORDS.startingPriorityHelp}</p>
                </HelpTip>
              </div>
              <PillGroup
                label={GROUP_WORDS.startingPriority}
                options={startingOptions}
                value={pickedPriority ?? payload.startingPriority ?? 'none'}
                onChange={(choice: StartingChoice) =>
                  void setStartingPriority(choice)
                }
              />
              {priorityError && (
                <p className='text-destructive text-sm' role='alert'>
                  {priorityError}
                </p>
              )}
            </div>
            <ActionGroup>
              <ActionRow
                isGrouped
                hasChevron
                icon={<Receipt />}
                label={GROUP_WORDS.addBill}
                onClick={() => setIsAddingBill(true)}
              />
              <ActionRow
                isGrouped
                hasChevron
                icon={<Pencil />}
                label={GROUP_WORDS.rename}
                onClick={() => {
                  setName(payload.name);
                  setError(null);
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
