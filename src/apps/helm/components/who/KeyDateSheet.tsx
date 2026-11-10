import { useEffect, useId, useState } from 'react';

import { Button, Input, Select } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import AppToggle from '@/components/AppToggle';
import DetailSheet from '@/components/DetailSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import { PillGroup, type PillOption } from '@/components/PillGroup';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useAppSelector } from '@/store';
import { formatDateShort } from '@/utils/formatUtils';
import { formatMoment, formatYearlyDate } from '@/utils/yearlyDateUtils';
import {
  HELM_COPY,
  KEY_DATE_LABEL_MAX,
  MOMENT_KINDS,
} from '@apps/helm/constants';
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
import type { KeyDateKind, MomentPrecision, OpenWho } from '@apps/helm/types';
import {
  checkKeyDateParts,
  checkMomentParts,
} from '@apps/helm/utils/keyDateParts';
import { describeKeyDate, describeMoment } from '@apps/helm/utils/keyDateText';
import { getDecade, type WhoMoment } from '@apps/helm/utils/moments';

interface KeyDateSheetProps {
  who: OpenWho;
  /** The date to read, from the index by id. */
  openId: string | null;
  isAdding: boolean;
  /** The kind the add form starts on. */
  startKind?: KeyDateKind;
  /** Open on the form for the date at `openId`. */
  startsEditing?: boolean;
  /** The who's moments, when the page has them open. */
  moments?: WhoMoment[];
  /** Called once a save went through, before the sheet closes. */
  onSaved?: () => void;
  onClose: () => void;
}

/** A date or a moment as the sheet reads it; a null precision is a yearly date. */
interface SheetDate {
  id: string;
  kind: KeyDateKind;
  label: string | null;
  precision: MomentPrecision | null;
  month: number | null;
  day: number | null;
  year: number | null;
}

interface Draft {
  kind: KeyDateKind;
  label: string;
  comesBack: boolean;
  precision: MomentPrecision;
  month: string;
  day: string;
  year: string;
}

const isYearly = (draft: Draft) =>
  draft.kind === 'birthday' ||
  draft.kind === 'anniversary' ||
  (draft.kind === 'custom' && draft.comesBack);

const THIS_YEAR = new Date().getFullYear();

const DECADES = Array.from(
  { length: (getDecade(THIS_YEAR) - 1900) / 10 + 1 },
  (_, index) => {
    const decade = getDecade(THIS_YEAR) - index * 10;
    return { value: String(decade), text: `${decade}s` };
  },
);

const PRECISION_OPTIONS: PillOption<MomentPrecision>[] = [
  { value: 'day', label: HELM_COPY.momentPrecisionDay },
  { value: 'month', label: HELM_COPY.momentPrecisionMonth },
  { value: 'year', label: HELM_COPY.momentPrecisionYear },
  { value: 'decade', label: HELM_COPY.momentPrecisionDecade },
];

const MOMENT_WORDS: Record<(typeof MOMENT_KINDS)[number], string> = {
  met: HELM_COPY.momentKindMet,
  moved: HELM_COPY.momentKindMoved,
  startedJob: HELM_COPY.momentKindStartedJob,
  leftJob: HELM_COPY.momentKindLeftJob,
  graduated: HELM_COPY.momentKindGraduated,
  adopted: HELM_COPY.momentKindAdopted,
  passedAway: HELM_COPY.momentKindPassedAway,
};

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
  ...MOMENT_KINDS.map((value) => ({ value, label: MOMENT_WORDS[value] })),
  { value: 'custom', label: HELM_COPY.keyDateKindCustom },
];

const toNumber = (text: string) =>
  text.trim() === '' ? null : Number(text.trim());

const toDraft = (
  date: SheetDate | null,
  hasBirthday: boolean,
  startKind: KeyDateKind | null,
): Draft => ({
  kind: date?.kind ?? startKind ?? (hasBirthday ? 'anniversary' : 'birthday'),
  label: date?.label ?? '',
  comesBack: date ? date.precision === null : true,
  precision: date?.precision ?? 'day',
  month: date?.month != null ? String(date.month) : '',
  day: date?.day != null ? String(date.day) : '',
  year: date?.year != null ? String(date.year) : '',
});

const toInput = (draft: Draft): KeyDateInput => {
  const label = draft.kind === 'custom' ? draft.label.trim() : null;
  if (isYearly(draft)) {
    return {
      kind: draft.kind,
      label,
      month: Number(draft.month),
      day: toNumber(draft.day),
      year: toNumber(draft.year),
      precision: null,
    };
  }
  const hasMonth = draft.precision === 'day' || draft.precision === 'month';
  return {
    kind: draft.kind,
    label,
    month: hasMonth ? toNumber(draft.month) : null,
    day: draft.precision === 'day' ? toNumber(draft.day) : null,
    year: toNumber(draft.year),
    precision: draft.precision,
  };
};

const toSheetDate = (date: WhoKeyDate | WhoMoment): SheetDate => ({
  id: date.id,
  kind: date.kind,
  label: date.label,
  precision: 'precision' in date ? date.precision : null,
  month: date.month,
  day: date.day,
  year: date.year,
});

const titleOf = (
  date: Pick<SheetDate, 'kind' | 'label' | 'precision'>,
  who: OpenWho,
) =>
  (date.precision === null ? describeKeyDate : describeMoment)({
    kind: date.kind,
    label: date.label,
    whoName: who.name,
    isSelf: who.isSelf,
  });

const refusalText = (refusal: keyof typeof REFUSALS | null) =>
  refusal ? REFUSALS[refusal] : null;

const REFUSALS = {
  monthAlone: HELM_COPY.keyDateMonthAlone,
  badDay: HELM_COPY.keyDateBadDay,
  badYear: HELM_COPY.keyDateBadYear,
  needsName: HELM_COPY.keyDateNeedsName,
} as const;

const toRefusal = (draft: Draft, input: KeyDateInput) => {
  if (isYearly(draft)) {
    return draft.month === ''
      ? REFUSALS.monthAlone
      : refusalText(
          checkKeyDateParts(
            { ...input, month: Number(draft.month) },
            THIS_YEAR,
          ),
        );
  }
  if (input.precision === null) return null;
  if (input.year === null) return HELM_COPY.momentYearNeeded;
  if (
    (input.precision === 'day' || input.precision === 'month') &&
    input.month === null
  ) {
    return HELM_COPY.momentMonthNeeded;
  }
  if (input.precision === 'day' && input.day === null) return REFUSALS.badDay;
  return refusalText(
    checkMomentParts(
      { ...input, precision: input.precision, year: input.year },
      THIS_YEAR,
    ),
  );
};

interface FormProps {
  who: OpenWho;
  date: SheetDate | null;
  hasBirthday: boolean;
  startKind: KeyDateKind | null;
  onSaved?: () => void;
  onDirtyChange: (isDirty: boolean) => void;
  onClose: () => void;
  requestClose: () => void;
}

function KeyDateForm({
  who,
  date,
  hasBirthday,
  startKind,
  onSaved,
  onDirtyChange,
  onClose,
  requestClose,
}: FormProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const fieldId = useId();
  const isOffline = useNetworkStatus() === 'offline';
  const [initial] = useState(() => toDraft(date, hasBirthday, startKind));
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
  const isYearlyDraft = isYearly(draft);
  const hasMonthField =
    isYearlyDraft || draft.precision === 'day' || draft.precision === 'month';
  const hasDayField = isYearlyDraft || draft.precision === 'day';
  const hasYearField = isYearlyDraft || draft.precision !== 'decade';

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
          : result.reason === 'moments'
            ? HELM_COPY.momentFull(who.name)
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
    const refusal = toRefusal(draft, input);
    if (refusal) {
      setNote(refusal);
      return;
    }
    if (isOffline) {
      setNote(HELM_COPY.keyDateNeedsConnection);
      return;
    }
    setIsSaving(true);
    try {
      const encryption = await getHelmEncryption(user.uid);
      const title = titleOf(input, who);
      const result = date
        ? await editKeyDate(user.uid, encryption, date.id, input)
        : await addKeyDate(user.uid, encryption, who.id, input);
      if (
        report(
          result,
          date
            ? HELM_COPY.keyDateSaved
            : input.precision === null
              ? HELM_COPY.keyDateAdded(title)
              : HELM_COPY.momentAdded(title),
        )
      ) {
        onDirtyChange(false);
        onSaved?.();
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
      {isNew && draft.kind === 'custom' && (
        <div className='flex items-center justify-between gap-3'>
          <span className='text-sm font-medium'>
            {HELM_COPY.keyDateComesBack}
          </span>
          <AppToggle
            aria-label={HELM_COPY.keyDateComesBack}
            checked={draft.comesBack}
            onCheckedChange={(comesBack) => change({ comesBack })}
          />
        </div>
      )}
      {!isYearlyDraft && (
        <PillGroup
          label={HELM_COPY.momentPrecisionLabel}
          options={PRECISION_OPTIONS}
          value={draft.precision}
          onChange={(precision) => change({ precision })}
        />
      )}
      {draft.precision === 'decade' && !isYearlyDraft && (
        <div className='space-y-1.5'>
          <span className='text-sm font-medium'>
            {HELM_COPY.momentDecadeLabel}
          </span>
          <Select
            options={DECADES}
            value={draft.year}
            placeholder={HELM_COPY.momentDecadeLabel}
            onChange={(year) => change({ year })}
          />
        </div>
      )}
      {hasMonthField && (
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
      )}
      {(hasDayField || hasYearField) && (
        <div className='grid grid-cols-2 gap-3'>
          {hasDayField && (
            <div className='space-y-1.5'>
              <label htmlFor={`${fieldId}-day`} className='text-sm font-medium'>
                {HELM_COPY.keyDateDayLabel}{' '}
                {isYearlyDraft && (
                  <span className='text-muted-foreground font-normal'>
                    {HELM_COPY.keyDateOptional}
                  </span>
                )}
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
          )}
          {hasYearField && (
            <div className='space-y-1.5'>
              <label
                htmlFor={`${fieldId}-year`}
                className='text-sm font-medium'
              >
                {HELM_COPY.keyDateYearLabel}{' '}
                {isYearlyDraft && (
                  <span className='text-muted-foreground font-normal'>
                    {HELM_COPY.keyDateOptional}
                  </span>
                )}
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
          )}
        </div>
      )}
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
function KeyDateSheet({
  who,
  openId,
  isAdding,
  startKind,
  startsEditing = false,
  moments = [],
  onSaved,
  onClose,
}: KeyDateSheetProps) {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { dates } = useKeyDates(who.id);
  const captures = useAppSelector(selectAllCaptures);
  const listed =
    dates.find((entry) => entry.id === openId) ??
    moments.find((entry) => entry.id === openId) ??
    null;
  const [isEditing, setIsEditing] = useState(startsEditing);
  const [isDirty, setIsDirty] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [source, setSource] = useState<
    | ({ id: string } & NonNullable<Awaited<ReturnType<typeof readKeyDate>>>)
    | null
  >(null);
  const read = source?.id === openId ? source : null;
  const date: SheetDate | null = listed
    ? toSheetDate(listed)
    : openId && read?.parts
      ? { id: openId, ...read.parts }
      : null;
  const hasBirthday = dates.some((entry) => entry.kind === 'birthday');
  const isOpen = isAdding || date !== null;
  const isForm = isAdding || (isEditing && date !== null);

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
        const title = titleOf(date, who);
        close();
        addToast({
          title:
            date.precision === null
              ? HELM_COPY.keyDateRemoved(title)
              : HELM_COPY.momentRemoved(title),
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

  const addTitle =
    startKind && startKind !== 'birthday' && startKind !== 'anniversary'
      ? HELM_COPY.momentNewTitle
      : HELM_COPY.keyDateNewTitle;
  const title = date ? titleOf(date, who) : addTitle;
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
  const when = !date
    ? ''
    : date.precision !== null && date.year !== null
      ? [
          HELM_COPY.momentOneTime,
          formatMoment({ ...date, precision: date.precision, year: date.year }),
        ].join(' · ')
      : [
          HELM_COPY.keyDateComesBack,
          formatYearlyDate({
            month: date.month ?? 1,
            day: date.day,
            year: date.day === null ? date.year : null,
          }),
          date.day === null
            ? HELM_COPY.keyDateDayUnknown
            : date.year === null
              ? HELM_COPY.keyDateYearUnknown
              : String(date.year),
        ].join(' · ');

  return (
    <DetailSheet
      isOpen={isOpen}
      onClose={requestClose}
      title={
        isEditing
          ? date?.precision != null
            ? HELM_COPY.momentEditTitle
            : HELM_COPY.keyDateEditTitle
          : title
      }
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
          startKind={startKind ?? null}
          onSaved={onSaved}
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
