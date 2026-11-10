import { useEffect, useId, useState } from 'react';

import { Button, Input, Select } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import { formatYearlyDate } from '@/utils/yearlyDateUtils';
import { HELM_COPY, KEY_DATE_LABEL_MAX } from '@apps/helm/constants';
import { useKeyDates, type WhoKeyDate } from '@apps/helm/hooks/useKeyDates';
import {
  addKeyDate,
  editKeyDate,
  readKeyDate,
  removeKeyDate,
  type KeyDateChange,
  type KeyDateInput,
} from '@apps/helm/store/actions/keyDateActions';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import { selectAllCaptures } from '@apps/helm/store/selectors/captureSelectors';
import type { KeyDateKind, OpenWho } from '@apps/helm/types';
import { checkKeyDateParts } from '@apps/helm/utils/keyDateParts';
import { describeKeyDate } from '@apps/helm/utils/keyDateText';

interface KeyDateSheetProps {
  who: OpenWho;
  /** The date to read, from the index by id. */
  openId: string | null;
  isAdding: boolean;
  onClose: () => void;
}

interface Draft {
  kind: KeyDateKind;
  label: string;
  month: string;
  day: string;
  year: string;
}

const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  text: new Date(Date.UTC(2000, index, 1)).toLocaleDateString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  }),
}));

const KIND_OPTIONS: PillOption<KeyDateKind>[] = [
  { value: 'birthday', label: HELM_COPY.keyDateKindBirthday },
  { value: 'anniversary', label: HELM_COPY.keyDateKindAnniversary },
  { value: 'custom', label: HELM_COPY.keyDateKindCustom },
];

const toNumber = (text: string) =>
  text.trim() === '' ? null : Number(text.trim());

const toDraft = (date: WhoKeyDate | null, hasBirthday: boolean): Draft => ({
  kind: date?.kind ?? (hasBirthday ? 'anniversary' : 'birthday'),
  label: date?.label ?? '',
  month: date ? String(date.month) : '',
  day: date?.day != null ? String(date.day) : '',
  year: date?.year != null ? String(date.year) : '',
});

const toInput = (draft: Draft): KeyDateInput => ({
  kind: draft.kind,
  label: draft.kind === 'custom' ? draft.label.trim() : null,
  month: Number(draft.month),
  day: toNumber(draft.day),
  year: toNumber(draft.year),
});

const REFUSALS = {
  monthAlone: HELM_COPY.keyDateMonthAlone,
  badDay: HELM_COPY.keyDateBadDay,
  badYear: HELM_COPY.keyDateBadYear,
  needsName: HELM_COPY.keyDateNeedsName,
} as const;

interface FormProps {
  who: OpenWho;
  date: WhoKeyDate | null;
  hasBirthday: boolean;
  onDirtyChange: (isDirty: boolean) => void;
  onClose: () => void;
  requestClose: () => void;
}

function KeyDateForm({
  who,
  date,
  hasBirthday,
  onDirtyChange,
  onClose,
  requestClose,
}: FormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const isOffline = useNetworkStatus() === 'offline';
  const [initial] = useState(() => toDraft(date, hasBirthday));
  const [draft, setDraft] = useState(initial);
  const [note, setNote] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isNew = date === null;

  const change = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    setNote(null);
    onDirtyChange(JSON.stringify(next) !== JSON.stringify(initial));
  };

  const kinds = KIND_OPTIONS.filter(
    (option) => option.value !== 'birthday' || !hasBirthday,
  );

  const report = (result: KeyDateChange, title: string) => {
    if (result.kind === 'offline') {
      setNote(HELM_COPY.keyDateNeedsConnection);
      return false;
    }
    if (result.kind === 'changed') {
      setNote(HELM_COPY.keyDateChangedMeanwhile);
      return false;
    }
    if (result.kind === 'full') {
      setNote(
        result.reason === 'who'
          ? HELM_COPY.keyDateFull(who.name)
          : HELM_COPY.keyDateTooMany,
      );
      return false;
    }
    addToast({
      title,
      type: 'success',
      action: {
        label: HELM_COPY.undo,
        onClick: () =>
          void result.undo().then(
            (isUndone) =>
              addToast({
                title: isUndone
                  ? HELM_COPY.keyDateUndone
                  : HELM_COPY.keyDateUndoChanged,
                type: 'info',
              }),
            (error: unknown) => {
              console.error('Helm date change was not undone', error);
              addToast({ title: HELM_COPY.keyDateUndoFailed, type: 'error' });
            },
          ),
      },
    });
    return true;
  };

  const save = async () => {
    if (!user || isSaving) return;
    const input = toInput(draft);
    const refusal =
      draft.month === ''
        ? 'monthAlone'
        : checkKeyDateParts(input, new Date().getFullYear());
    if (refusal) {
      setNote(REFUSALS[refusal]);
      return;
    }
    if (isOffline) {
      setNote(HELM_COPY.keyDateNeedsConnection);
      return;
    }
    setIsSaving(true);
    try {
      const encryption = await getHelmEncryption(user.uid);
      const title = describeKeyDate({
        kind: input.kind,
        label: input.label,
        whoName: who.name,
        isSelf: who.isSelf,
      });
      const result = date
        ? await editKeyDate(user.uid, encryption, date.id, input)
        : await addKeyDate(user.uid, encryption, who.id, input);
      if (
        report(
          result,
          date ? HELM_COPY.keyDateSaved : HELM_COPY.keyDateAdded(title),
        )
      ) {
        onDirtyChange(false);
        onClose();
        return;
      }
    } catch (error) {
      console.error('Helm date was not saved', error);
      setNote(HELM_COPY.keyDateFailed);
    }
    setIsSaving(false);
  };

  return (
    <div className='space-y-4'>
      {isNew && (
        <PillGroup
          label={HELM_COPY.keyDateKindLabel}
          options={kinds}
          value={draft.kind}
          onChange={(kind) => change({ kind })}
        />
      )}
      {draft.kind === 'custom' && (
        <div className='space-y-1.5'>
          <label htmlFor={`${fieldId}-name`} className='text-sm font-medium'>
            {HELM_COPY.keyDateNameLabel}
          </label>
          <Input
            id={`${fieldId}-name`}
            value={draft.label}
            maxLength={KEY_DATE_LABEL_MAX}
            placeholder={HELM_COPY.keyDateNamePlaceholder}
            onChange={(event) => change({ label: event.target.value })}
          />
        </div>
      )}
      <div className='space-y-1.5'>
        <span className='text-sm font-medium'>
          {HELM_COPY.keyDateMonthLabel}
        </span>
        <Select
          options={MONTHS}
          value={draft.month}
          placeholder={HELM_COPY.keyDateMonthLabel}
          onChange={(month) => change({ month })}
        />
      </div>
      <div className='grid grid-cols-2 gap-3'>
        <div className='space-y-1.5'>
          <label htmlFor={`${fieldId}-day`} className='text-sm font-medium'>
            {HELM_COPY.keyDateDayLabel}{' '}
            <span className='text-muted-foreground font-normal'>
              {HELM_COPY.keyDateOptional}
            </span>
          </label>
          <Input
            id={`${fieldId}-day`}
            inputMode='numeric'
            maxLength={2}
            value={draft.day}
            onChange={(event) =>
              change({ day: event.target.value.replace(/\D/g, '') })
            }
          />
        </div>
        <div className='space-y-1.5'>
          <label htmlFor={`${fieldId}-year`} className='text-sm font-medium'>
            {HELM_COPY.keyDateYearLabel}{' '}
            <span className='text-muted-foreground font-normal'>
              {HELM_COPY.keyDateOptional}
            </span>
          </label>
          <Input
            id={`${fieldId}-year`}
            inputMode='numeric'
            maxLength={4}
            value={draft.year}
            onChange={(event) =>
              change({ year: event.target.value.replace(/\D/g, '') })
            }
          />
        </div>
      </div>
      <ModalFooterActions
        note={note ?? (isOffline ? HELM_COPY.keyDateNeedsConnection : null)}
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isSaving}
          >
            {HELM_COPY.editCancel}
          </Button>
        }
        rightActions={
          <Button type='button' loading={isSaving} onClick={() => void save()}>
            {isNew ? HELM_COPY.keyDateAddSave : HELM_COPY.keyDateSave}
          </Button>
        }
      />
    </div>
  );
}

/** One date that comes back: its words, where it came from, Edit and Remove with an Undo; or the form that adds one. Saving needs a connection and says so. */
function KeyDateSheet({ who, openId, isAdding, onClose }: KeyDateSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { dates } = useKeyDates(who.id);
  const captures = useAppSelector(selectAllCaptures);
  const date = dates.find((entry) => entry.id === openId) ?? null;
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [source, setSource] = useState<{
    id: string;
    source: 'person' | 'nomos' | 'google:contacts';
    createdAt: number;
    captureId: string | null;
  } | null>(null);
  const hasBirthday = dates.some((entry) => entry.kind === 'birthday');
  const isOpen = isAdding || date !== null;
  const isForm = isAdding || isEditing;

  useEffect(() => {
    if (!user || !openId) return;
    let isCurrent = true;
    getHelmEncryption(user.uid)
      .then((encryption) => readKeyDate(user.uid, encryption, openId))
      .then((read) => {
        if (isCurrent && read) setSource({ id: openId, ...read });
      })
      .catch((error: unknown) =>
        console.error('Helm date source was not read', error),
      );
    return () => {
      isCurrent = false;
    };
  }, [user, openId]);

  const close = () => {
    setIsEditing(false);
    setIsDirty(false);
    onClose();
  };
  const requestClose = useDiscardGuard({ isDirty, onClose: close });

  const remove = async () => {
    if (!user || !date || isRemoving) return;
    setIsRemoving(true);
    try {
      const encryption = await getHelmEncryption(user.uid);
      const result = await removeKeyDate(user.uid, encryption, date.id);
      if (result.kind === 'offline') {
        addToast({ title: HELM_COPY.keyDateNeedsConnection, type: 'info' });
      } else if (result.kind === 'done') {
        const title = describeKeyDate({
          kind: date.kind,
          label: date.label,
          whoName: who.name,
          isSelf: who.isSelf,
        });
        close();
        addToast({
          title: HELM_COPY.keyDateRemoved(title),
          type: 'success',
          action: {
            label: HELM_COPY.undo,
            onClick: () =>
              void result.undo().then(
                (isBack) =>
                  addToast({
                    title: isBack
                      ? HELM_COPY.keyDateUndone
                      : HELM_COPY.keyDateUndoChanged,
                    type: 'info',
                  }),
                (error: unknown) => {
                  console.error('Helm date was not put back', error);
                  addToast({
                    title: HELM_COPY.keyDateUndoFailed,
                    type: 'error',
                  });
                },
              ),
          },
        });
      }
    } catch (error) {
      console.error('Helm date was not removed', error);
      addToast({ title: HELM_COPY.keyDateRemoveFailed, type: 'error' });
    }
    setIsRemoving(false);
  };

  const title = date
    ? describeKeyDate({
        kind: date.kind,
        label: date.label,
        whoName: who.name,
        isSelf: who.isSelf,
      })
    : HELM_COPY.keyDateNewTitle;
  const read = source?.id === openId ? source : null;
  const quote =
    read?.captureId != null
      ? (captures.find((capture) => capture.id === read.captureId)?.text ??
        null)
      : null;
  const sourceLine = !read
    ? null
    : read.source === 'nomos'
      ? HELM_COPY.keyDateSourceSaid(formatDateShort(read.createdAt))
      : read.source === 'google:contacts'
        ? HELM_COPY.keyDateSourceGoogle(formatDateShort(read.createdAt))
        : HELM_COPY.keyDateSourceAdded;
  const when = date
    ? [
        HELM_COPY.keyDateComesBack,
        formatYearlyDate({
          ...date,
          year: date.day === null ? date.year : null,
        }),
        date.day === null
          ? HELM_COPY.keyDateDayUnknown
          : date.year === null
            ? HELM_COPY.keyDateYearUnknown
            : String(date.year),
      ].join(' · ')
    : '';

  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={isEditing ? HELM_COPY.keyDateEditTitle : title}
      viewKey={isForm ? 'form' : 'read'}
      footer={
        isForm || !date ? undefined : (
          <div className='flex items-center justify-end gap-2'>
            <Button
              type='button'
              variant='tertiary'
              loading={isRemoving}
              onClick={() => void remove()}
            >
              {HELM_COPY.keyDateSheetRemove}
            </Button>
            <Button
              type='button'
              variant='secondary'
              disabled={isRemoving}
              onClick={() => setIsEditing(true)}
            >
              {HELM_COPY.keyDateSheetEdit}
            </Button>
          </div>
        )
      }
    >
      {isForm ? (
        <KeyDateForm
          who={who}
          date={isAdding ? null : date}
          hasBirthday={hasBirthday}
          onDirtyChange={setIsDirty}
          onClose={close}
          requestClose={requestClose}
        />
      ) : (
        date && (
          <div className='flex flex-col gap-3'>
            <p className='text-[15px] text-pretty'>{when}</p>
            {sourceLine && (
              <p className='text-muted-foreground text-[13px] text-pretty'>
                {sourceLine}
              </p>
            )}
            {quote && (
              <blockquote className='border-border text-muted-foreground border-l-2 pl-3 text-[15px] text-pretty'>
                {`“${quote}”`}
              </blockquote>
            )}
          </div>
        )
      )}
    </DetailSheet>
  );
}

export default KeyDateSheet;
