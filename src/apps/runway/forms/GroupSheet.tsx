import { useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useActionModal, useToast } from '@moondreamsdev/dreamer-ui/hooks';
import {
  Archive,
  CalendarDays,
  Pencil,
  Receipt,
  Smile,
  Wallet,
} from 'lucide-react';

import ActionGroup from '@/components/ActionGroup';
import ActionRow from '@/components/ActionRow';
import BackLink from '@/components/BackLink';
import DateInput from '@/components/DateInput';
import EmojiField from '@/components/EmojiField';
import FormSheet from '@/components/FormSheet';
import HelpTip from '@/components/HelpTip';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup } from '@/components/PillGroup';
import SensitiveValue from '@/components/SensitiveValue';
import ValuesEyeButton from '@/components/ValuesEyeButton';
import { useAuth } from '@/hooks/useAuth';
import { useValuesHidden } from '@/hooks/useValuesHidden';
import { useStore } from 'react-redux';

import { useAppSelector, type RootState } from '@/store';
import { resolveItemEmoji } from '@apps/runway/utils/purposeEmoji';
import { fromDateInputValue } from '@/utils/dateInputUtils';
import { getErrorMessage } from '@/utils/errorUtils';
import { formatDateShortUTC, formatDateUTC } from '@/utils/formatUtils';
import { formatCents } from '@/utils/moneyUtils';
import {
  GROUP_WORDS,
  ITEM_SHEET_R2_WORDS,
  MAX_EMOJI_LENGTH,
  MAX_NAME_LENGTH,
  PRIORITIES,
  PRIORITY_LABELS,
} from '@apps/runway/constants';
import SheetHead from '@apps/runway/components/SheetHead';
import {
  ActionSection,
  ActionTitle,
} from '@apps/runway/components/ActionSection';
import { MaskedText } from '@apps/runway/components/MaskedText';
import BillForm from '@apps/runway/forms/BillForm';
import EnvelopeForm from '@apps/runway/forms/EnvelopeForm';
import ItemRow from '@apps/runway/components/ItemRow';
import { useGroupFigures } from '@apps/runway/hooks/useGroupFigures';
import GroupTotalHelp from '@apps/runway/components/GroupTotalHelp';
import { getRunwayEncryption } from '@apps/runway/queries/runwayKeyQueries';
import {
  archiveItem,
  changeItem,
} from '@apps/runway/store/actions/itemActions';
import {
  selectBillPayments,
  selectGroups,
  selectStance,
  selectAllPurposeEmojis,
} from '@apps/runway/store/selectors/runwaySelectors';
import type { GroupTotal } from '@apps/runway/engine/groups';
import {
  applyFieldChanges,
  getVersionStretches,
  type VersionStretch,
} from '@apps/runway/engine/resolve';
import type {
  BillSealed,
  BillVersion,
  GroupSealed,
  Priority,
} from '@apps/runway/types';
import {
  describeBillRepeat,
  describeGroupLead,
  describeGroupTotal,
} from '@apps/runway/utils/billText';
import {
  describeCadenceLine,
  describeFundingShort,
} from '@apps/runway/utils/fundingText';
import { resolveGroupRename } from '@apps/runway/utils/groupChoice';
import { getCardNamer } from '@apps/runway/utils/cardText';
import { describeChange } from '@apps/runway/utils/changeText';

type StartingChoice = Priority | 'none';

interface GroupSheetProps {
  groupId: string;
  today: number;
  onClose: () => void;
}

const startingOptions = [
  ...PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] })),
  { value: 'none' as const, label: GROUP_WORDS.noPriority },
];

/** What a name is for, as a sheet: what its bills and envelopes come to a usual month, which they are, adding one, its name, the priority a new one starts with, and stopping its use. */
/** Repeats whose dates come from the due date alone; a twice-a-month or irregular bill, or one that ends after a count, keeps its own. */
const SETTABLE_KINDS: readonly string[] = [
  'once',
  'weekly',
  'everyOtherWeek',
  'monthly',
];

function GroupSheet({ groupId, today, onClose }: GroupSheetProps) {
  const { user } = useAuth();
  const { confirm } = useActionModal();
  const { addToast } = useToast();
  const { isHidden } = useValuesHidden();
  const stance = useAppSelector(selectStance);
  const purposeEmojis = useAppSelector(selectAllPurposeEmojis);
  const group = useAppSelector((state) =>
    selectGroups(state, today).find(({ item }) => item.id === groupId),
  );
  const [isRenaming, setIsRenaming] = useState(false);
  const [isPickingEmoji, setIsPickingEmoji] = useState(false);
  const [emoji, setEmoji] = useState('');
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priorityError, setPriorityError] = useState<string | null>(null);
  const [pickedPriority, setPickedPriority] = useState<StartingChoice | null>(
    null,
  );
  const allGroups = useAppSelector((state) => selectGroups(state, today));
  const figures = useGroupFigures(today).find(({ id }) => id === groupId);
  const [adding, setAdding] = useState<'bill' | 'envelope' | null>(null);
  const payments = useAppSelector((state) => selectBillPayments(state, today));
  const [isSettingDue, setIsSettingDue] = useState(false);
  const [dueText, setDueText] = useState('');
  const store = useStore<RootState>();

  if (!group || !figures) return null;
  const {
    total,
    billsTotal,
    envelopesTotal,
    bills,
    envelopes,
    names: memberNames,
  } = figures;
  const billCount = bills.length;
  const envelopeCount = envelopes.length;
  const memberCount = billCount + envelopeCount;
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
        summary: `${next.name}: ${describeChange(payload, next, getCardNamer([]))}, from ${formatDateUTC(today)}.`,
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

  const saveEmoji = async (next: string | null) => {
    setError(null);
    if (next === payload.emoji) {
      setIsPickingEmoji(false);
      return;
    }
    const failure = await save({ ...payload, emoji: next });
    if (failure === null) setIsPickingEmoji(false);
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
      message: GROUP_WORDS.archiveBody(billCount, envelopeCount),
      confirmText: GROUP_WORDS.archive(payload.name),
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
          summary: GROUP_WORDS.archived(payload.name, billCount, envelopeCount),
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

  const dueDate = fromDateInputValue(dueText);
  const isPaidOnce = ({ item, version }: (typeof bills)[number]) =>
    version.payload.timing.schedule.kind === 'once' &&
    (payments[item.id] ?? []).some((payment) => payment.paid);
  const isSettable = ({ version }: (typeof bills)[number]) => {
    const { schedule } = version.payload.timing;
    return (
      SETTABLE_KINDS.includes(schedule.kind) &&
      version.payload.ending.afterCount === null
    );
  };
  const isSameDue = ({ version }: (typeof bills)[number]) => {
    const { schedule } = version.payload.timing;
    if (dueDate === undefined || schedule.anchor === null) return false;
    if (schedule.anchor === dueDate) return true;
    return (
      schedule.kind === 'monthly' &&
      schedule.anchor <= dueDate &&
      schedule.monthDays[0] === new Date(dueDate).getUTCDate()
    );
  };
  const eligibleBills = bills.filter(
    (bill) =>
      isSettable(bill) &&
      !isPaidOnce(bill) &&
      (dueDate === undefined ||
        bill.version.payload.ending.onDate === null ||
        bill.version.payload.ending.onDate >= dueDate),
  );
  const changingBills = eligibleBills.filter((bill) => !isSameDue(bill));
  const replacedBills = changingBills.filter(
    ({ version }) => version.payload.timing.schedule.anchor !== null,
  );
  const skippedCount = billCount - eligibleBills.length;

  const getCurrentDue = ({ item, version }: (typeof bills)[number]) =>
    (payments[item.id] ?? []).find((entry) => entry.dueOn >= today)?.dueOn ??
    version.payload.timing.schedule.anchor;
  const settableBills = bills.filter(
    (bill) => isSettable(bill) && !isPaidOnce(bill),
  );

  const undoDueDates = async (
    written: {
      itemId: string;
      name: string;
      before: BillSealed;
      after: BillSealed;
      stretches: VersionStretch<BillSealed>[];
    }[],
  ) => {
    if (!user) return;
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const results = await Promise.allSettled(
        written.map((entry) =>
          changeItem(user.uid, encryption, {
            itemId: entry.itemId,
            kind: 'bill',
            payload: entry.before,
            summary: GROUP_WORDS.dueSummary(
              entry.name,
              describeChange(entry.after, entry.before, getCardNamer([])) ||
                'Updated',
              formatDateUTC(today),
            ),
            note: null,
            effectiveFrom: today,
            stretches: entry.stretches,
          }),
        ),
      );
      const failed = written.flatMap((entry, index) =>
        results[index].status === 'rejected' ? [entry.name] : [],
      );
      addToast(
        failed.length === 0
          ? { title: GROUP_WORDS.dueUndone(written.length), type: 'success' }
          : {
              title: GROUP_WORDS.dueUndoPartial(
                written.length - failed.length,
                written.length,
                failed,
              ),
              type: 'error',
            },
      );
    } catch (undoError) {
      addToast({
        title: getErrorMessage(undoError, GROUP_WORDS.dueUndoFailed),
        type: 'error',
      });
    }
  };

  const setDueDate = async () => {
    if (!user || dueDate === undefined) return;
    if (replacedBills.length > 0) {
      const isConfirmed = await confirm({
        title: GROUP_WORDS.dueReplaceTitle,
        message: GROUP_WORDS.dueReplaceBody(
          replacedBills.map((bill) => {
            const current = getCurrentDue(bill);
            return current === null
              ? bill.version.payload.name
              : `${bill.version.payload.name} (${formatDateShortUTC(current)})`;
          }),
          formatDateUTC(dueDate),
        ),
        confirmText: GROUP_WORDS.dueReplace,
      });
      if (!isConfirmed) return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const encryption = await getRunwayEncryption(user.uid);
      const billVersions = store
        .getState()
        .runway.versions.filter(
          (version): version is BillVersion => version.kind === 'bill',
        );
      const plans = changingBills.map(({ item, version }) => {
        const { payload: bill } = version;
        const { schedule } = bill.timing;
        const next: BillSealed = {
          ...bill,
          fundedBy:
            bill.fundedBy.kind === 'chosen'
              ? { kind: 'suggested' }
              : bill.fundedBy,
          timing: {
            kind: 'date',
            schedule: {
              ...schedule,
              anchor: dueDate,
              monthDays:
                schedule.kind === 'monthly'
                  ? [new Date(dueDate).getUTCDate()]
                  : [],
            },
          },
        };
        const before = getVersionStretches<BillVersion, BillSealed>(
          billVersions,
          item.id,
          today,
        );
        return {
          itemId: item.id,
          name: bill.name,
          before: bill,
          after: next,
          stretches: before,
          written: applyFieldChanges(before, bill, next),
        };
      });
      const results = await Promise.allSettled(
        plans.map((plan) =>
          changeItem(user.uid, encryption, {
            itemId: plan.itemId,
            kind: 'bill',
            payload: plan.after,
            summary: GROUP_WORDS.dueSummary(
              plan.name,
              describeChange(plan.before, plan.after, getCardNamer([])) ||
                'Updated',
              formatDateUTC(today),
            ),
            note: null,
            effectiveFrom: today,
            stretches: plan.written.length > 1 ? plan.written : undefined,
          }),
        ),
      );
      const saved = plans.filter(
        (_, index) => results[index].status === 'fulfilled',
      );
      const failed = plans
        .filter((_, index) => results[index].status === 'rejected')
        .map((plan) => plan.name);
      if (saved.length > 0)
        addToast({
          title: GROUP_WORDS.dueToast(saved.length),
          type: 'success',
          action: {
            label: ITEM_SHEET_R2_WORDS.undo,
            onClick: () => void undoDueDates(saved),
          },
        });
      if (failed.length === 0) {
        setIsSettingDue(false);
        return;
      }
      setError(
        saved.length === 0
          ? GROUP_WORDS.dueFailed
          : GROUP_WORDS.duePartial(saved.length, plans.length, failed),
      );
    } catch (saveError) {
      setError(getErrorMessage(saveError, GROUP_WORDS.dueFailed));
    } finally {
      setIsSaving(false);
    }
  };

  const trimmed = name.trim();
  const canRename = trimmed !== '' && trimmed !== payload.name;
  const lead = describeGroupLead(total, memberCount);
  const getCaption = (
    heading: string,
    kindTotal: GroupTotal,
    count: number,
  ) => {
    const kindLead = describeGroupLead(kindTotal, count);
    return kindLead.amount === null || kindLead.isOneTime
      ? heading
      : `${heading} · ${kindLead.amount} ${kindLead.rest}`;
  };
  const trimmedEmoji = emoji.trim();

  if (adding === 'bill') {
    return (
      <BillForm
        isOpen
        title='Bill'
        presetGroupId={groupId}
        onClose={onClose}
        onCancel={() => setAdding(null)}
      />
    );
  }
  if (adding === 'envelope') {
    return (
      <EnvelopeForm
        isOpen
        title='Envelope'
        presetGroupId={groupId}
        onClose={onClose}
        onCancel={() => setAdding(null)}
      />
    );
  }

  return (
    <FormSheet
      isOpen
      onClose={onClose}
      title={payload.emoji ? `${payload.emoji} ${payload.name}` : payload.name}
      actions={<ValuesEyeButton />}
    >
      <div className='space-y-4 [@media(max-height:599px)]:space-y-2.5'>
        {isPickingEmoji ? (
          <>
            <BackLink onBack={() => setIsPickingEmoji(false)} />
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs'>
                {GROUP_WORDS.emojiLabel}
              </p>
              <EmojiField
                value={emoji}
                onChange={setEmoji}
                ariaLabel={GROUP_WORDS.emojiLabel}
                placeholder='🐾'
                maxLength={MAX_EMOJI_LENGTH}
              />
            </div>
            <ModalFooterActions
              note={error}
              leftActions={
                payload.emoji !== null && (
                  <Button
                    type='button'
                    variant='secondary'
                    disabled={isSaving}
                    onClick={() => void saveEmoji(null)}
                  >
                    {GROUP_WORDS.removeEmoji}
                  </Button>
                )
              }
              rightActions={
                <Button
                  type='button'
                  loading={isSaving}
                  disabled={
                    isSaving ||
                    trimmedEmoji === '' ||
                    trimmedEmoji === payload.emoji
                  }
                  onClick={() => void saveEmoji(trimmedEmoji)}
                >
                  Save
                </Button>
              }
            />
          </>
        ) : isSettingDue ? (
          <>
            <BackLink onBack={() => setIsSettingDue(false)} />
            <ActionTitle>{GROUP_WORDS.dueQuestion}</ActionTitle>
            <ActionSection caption={GROUP_WORDS.dueCaption}>
              <DateInput
                variant='outline'
                aria-label={GROUP_WORDS.dueCaption}
                value={dueText}
                onChange={(event) => setDueText(event.target.value)}
              />
            </ActionSection>
            {skippedCount > 0 && (
              <p className='text-muted-foreground text-sm'>
                {GROUP_WORDS.dueSkipped(skippedCount)}
              </p>
            )}
            <ModalFooterActions
              note={
                error ??
                (dueDate === undefined
                  ? GROUP_WORDS.duePickDay
                  : changingBills.length === 0
                    ? GROUP_WORDS.dueNothingToChange
                    : null)
              }
              rightActions={
                <Button
                  type='button'
                  loading={isSaving}
                  disabled={
                    isSaving ||
                    dueDate === undefined ||
                    changingBills.length === 0
                  }
                  onClick={() => void setDueDate()}
                >
                  {GROUP_WORDS.dueAction}
                </Button>
              }
            />
          </>
        ) : isRenaming ? (
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
                memberCount === 0
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
            {bills.length > 0 && (
              <div className='space-y-1.5'>
                <p className='text-muted-foreground text-xs'>
                  <MaskedText>
                    {getCaption(
                      GROUP_WORDS.billsHeading,
                      billsTotal,
                      billCount,
                    )}
                  </MaskedText>
                </p>
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {bills.map(({ item, version }) => (
                    <ItemRow
                      key={item.id}
                      name={version.payload.name}
                      emoji={resolveItemEmoji(
                        version.payload.emoji,
                        version.payload.groupId,
                        purposeEmojis,
                      )}
                      detail={describeBillRepeat(
                        version.payload.timing.schedule.kind,
                      )}
                      figure={describeGroupTotal(version.payload.amount)}
                    />
                  ))}
                </ul>
              </div>
            )}
            {envelopes.length > 0 && (
              <div className='space-y-1.5'>
                <p className='text-muted-foreground text-xs'>
                  <MaskedText>
                    {getCaption(
                      GROUP_WORDS.envelopesHeading,
                      envelopesTotal,
                      envelopeCount,
                    )}
                  </MaskedText>
                </p>
                <ul className='border-border divide-border bg-card divide-y rounded-2xl border'>
                  {envelopes.map(({ item, version }) => {
                    const { funding } = version.payload;
                    return (
                      <ItemRow
                        key={item.id}
                        name={version.payload.name}
                        emoji={resolveItemEmoji(
                          version.payload.emoji,
                          version.payload.groupId,
                          purposeEmojis,
                        )}
                        detail={
                          funding.amount.kind === 'exact'
                            ? describeCadenceLine(funding.cadence)
                            : describeFundingShort(funding)
                        }
                        figure={
                          funding.amount.kind === 'exact'
                            ? formatCents(funding.amount.cents)
                            : null
                        }
                      />
                    );
                  })}
                </ul>
              </div>
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
                label={GROUP_WORDS.addBill(payload.name)}
                onClick={() => setAdding('bill')}
              />
              {settableBills.length > 0 && (
                <ActionRow
                  isGrouped
                  hasChevron
                  icon={<CalendarDays />}
                  label={GROUP_WORDS.setDue}
                  subtitle={GROUP_WORDS.setDueSub(
                    settableBills.length,
                    settableBills.length === billCount,
                  )}
                  onClick={() => {
                    setDueText('');
                    setError(null);
                    setIsSettingDue(true);
                  }}
                />
              )}
              <ActionRow
                isGrouped
                hasChevron
                icon={<Wallet />}
                label={GROUP_WORDS.addEnvelope(payload.name)}
                onClick={() => setAdding('envelope')}
              />
              <ActionRow
                isGrouped
                hasChevron
                icon={<Smile />}
                label={
                  payload.emoji === null
                    ? GROUP_WORDS.chooseEmoji(payload.name)
                    : GROUP_WORDS.changeEmoji(payload.name)
                }
                onClick={() => {
                  setEmoji(payload.emoji ?? '');
                  setError(null);
                  setIsPickingEmoji(true);
                }}
              />
              <ActionRow
                isGrouped
                hasChevron
                icon={<Pencil />}
                label={GROUP_WORDS.rename(payload.name)}
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
                label={GROUP_WORDS.archive(payload.name)}
                subtitle={GROUP_WORDS.archiveSub}
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
