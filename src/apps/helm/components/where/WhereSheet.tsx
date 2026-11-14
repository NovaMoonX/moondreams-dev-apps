import { useId, useState } from 'react';

import { Button, Input } from '@moondreamsdev/dreamer-ui/components';
import { useToast } from '@moondreamsdev/dreamer-ui/hooks';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import CitySelect from '@/components/forms/CitySelect';
import DateRangeField, {
  type DateRangeValue,
} from '@/components/forms/DateRangeField';
import { useAuth } from '@/hooks/useAuth';
import { useDiscardGuard } from '@/hooks/useDiscardGuard';
import type { City } from '@/lib/cities/types';
import { fromDateInputValue, toDateInputValue } from '@/utils/dateInputUtils';
import { generateUuid } from '@/utils/idUtils';
import { HELM_COPY } from '@apps/helm/constants';
import { formatAwayLine } from '@apps/helm/engine/whereabouts';
import { getHelmEncryption } from '@apps/helm/queries/helmKeyQueries';
import {
  setWhoWhere,
  type WhereChange,
} from '@apps/helm/store/actions/whoActions';
import type { AwaySpan, OpenWho } from '@apps/helm/types';

export type WhereTarget =
  { kind: 'home' } | { kind: 'away'; spanId: string | null };

interface WhereSheetProps {
  who: OpenWho;
  target: WhereTarget | null;
  todayKey: string;
  onClose: () => void;
}

interface WhereFormProps extends Omit<WhereSheetProps, 'target' | 'onClose'> {
  target: WhereTarget;
  requestClose: () => void;
  onDirtyChange: (isDirty: boolean) => void;
  onSaved: () => void;
}

const useWrite = (who: OpenWho, todayKey: string, onSaved: () => void) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const write = async (change: WhereChange) => {
    if (!user || isSaving) return;
    setIsSaving(true);
    try {
      const encryption = await getHelmEncryption(user.uid);
      const result = await setWhoWhere(
        user.uid,
        encryption,
        who.id,
        todayKey,
        change,
      );
      if (result === 'saved') {
        onSaved();
        return;
      }
      addToast({
        title:
          result === 'offline'
            ? HELM_COPY.editNeedsConnection
            : result === 'full'
              ? HELM_COPY.whereFull
              : HELM_COPY.whereSaveFailed,
        type: 'info',
      });
    } catch (error) {
      console.error('Helm where was not saved', error);
      addToast({ title: HELM_COPY.whereSaveFailed, type: 'error' });
    }
    setIsSaving(false);
  };
  return { write, isSaving };
};

function HomeForm({
  who,
  todayKey,
  requestClose,
  onDirtyChange,
  onSaved,
}: WhereFormProps) {
  const [city, setCity] = useState<City | null>(who.home);
  const { write, isSaving } = useWrite(who, todayKey, onSaved);
  const change = (next: City | null) => {
    setCity(next);
    onDirtyChange(next?.name !== who.home?.name);
  };
  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <span className='text-sm font-medium'>{HELM_COPY.whereCityLabel}</span>
        <CitySelect
          isRequired
          value={city}
          onChange={change}
          disabled={isSaving}
        />
      </div>
      {who.home && (
        <Button
          type='button'
          variant='secondary'
          className='text-destructive! border-destructive/40! w-full'
          disabled={isSaving}
          onClick={() => void write({ kind: 'home', city: null })}
        >
          {HELM_COPY.whereRemoveHome}
        </Button>
      )}
      <ModalFooterActions
        note={city === null ? HELM_COPY.wherePickCity : undefined}
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isSaving}
          >
            {HELM_COPY.talkCancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isSaving}
            disabled={!city}
            onClick={() => void write({ kind: 'home', city })}
          >
            {HELM_COPY.whereSave}
          </Button>
        }
      />
    </div>
  );
}

function AwayForm({
  who,
  todayKey,
  target,
  requestClose,
  onDirtyChange,
  onSaved,
}: WhereFormProps) {
  const fieldId = useId();
  const existing =
    target.kind === 'away'
      ? ((who.away ?? []).find((span) => span.id === target.spanId) ?? null)
      : null;
  const [city, setCity] = useState<City | null>(existing?.city ?? null);
  const [range, setRange] = useState<DateRangeValue>({
    startDate: existing ? toDateInputValue(existing.from) : todayKey,
    endDate: existing ? toDateInputValue(existing.to) : todayKey,
  });
  const [label, setLabel] = useState(existing?.label ?? '');
  const { write, isSaving } = useWrite(who, todayKey, onSaved);
  const from = fromDateInputValue(range.startDate);
  const to = fromDateInputValue(range.endDate);
  const isValid =
    city !== null && from !== undefined && to !== undefined && to >= from;

  const touch = (
    nextCity: City | null,
    nextRange: DateRangeValue,
    nextLabel: string,
  ) => {
    setCity(nextCity);
    setRange(nextRange);
    setLabel(nextLabel);
    onDirtyChange(
      nextCity?.name !== existing?.city.name ||
        nextRange.startDate !==
          toDateInputValue(existing?.from ?? Date.parse(todayKey)) ||
        nextRange.endDate !==
          toDateInputValue(existing?.to ?? Date.parse(todayKey)) ||
        nextLabel !== (existing?.label ?? ''),
    );
  };

  const save = () => {
    if (!city || from === undefined || to === undefined || !isValid) return;
    const span: AwaySpan = {
      id: existing?.id ?? generateUuid(),
      city,
      from,
      to,
      label: label.trim() || null,
      source: 'page',
      zoneOffered: existing?.zoneOffered ?? false,
    };
    void write({ kind: 'save', span });
  };

  return (
    <div className='space-y-4'>
      <div className='space-y-1.5'>
        <span className='text-sm font-medium'>{HELM_COPY.whereCityLabel}</span>
        <CitySelect
          isRequired
          value={city}
          onChange={(next) => touch(next, range, label)}
          disabled={isSaving}
        />
      </div>
      <div className='space-y-1.5'>
        <span className='text-sm font-medium'>{HELM_COPY.whereDatesLabel}</span>
        <DateRangeField
          value={range}
          onChange={(next) => touch(city, next, label)}
          disabled={isSaving}
        />
      </div>
      <div className='space-y-1.5'>
        <label htmlFor={fieldId} className='text-sm font-medium'>
          {HELM_COPY.whereLabelLabel}
        </label>
        <Input
          id={fieldId}
          variant='outline'
          className='helm-field'
          value={label}
          maxLength={80}
          placeholder={HELM_COPY.whereLabelPlaceholder}
          onChange={(event) => touch(city, range, event.target.value)}
        />
      </div>
      <ModalFooterActions
        note={city === null ? HELM_COPY.wherePickCity : undefined}
        cancelAction={
          <Button
            type='button'
            variant='tertiary'
            onClick={requestClose}
            disabled={isSaving}
          >
            {HELM_COPY.talkCancel}
          </Button>
        }
        rightActions={
          <Button
            type='button'
            loading={isSaving}
            disabled={!isValid}
            onClick={save}
          >
            {HELM_COPY.whereSave}
          </Button>
        }
      />
    </div>
  );
}

const hintClass =
  'text-muted-foreground -mt-1 text-center text-[13px] text-pretty';

function AwayActions({
  who,
  todayKey,
  target,
  onEdit,
  onSaved,
}: Omit<WhereFormProps, 'requestClose' | 'onDirtyChange'> & {
  onEdit: () => void;
}) {
  const span =
    target.kind === 'away'
      ? ((who.away ?? []).find((entry) => entry.id === target.spanId) ?? null)
      : null;
  const { write, isSaving } = useWrite(who, todayKey, onSaved);
  if (!span) return null;
  const hasStarted = span.from <= Date.parse(todayKey);
  return (
    <div className='flex flex-col gap-4'>
      <Button
        type='button'
        variant='secondary'
        onClick={onEdit}
        disabled={isSaving}
      >
        {HELM_COPY.whereChange}
      </Button>
      {hasStarted && (
        <div className='flex flex-col gap-1.5'>
          <Button
            type='button'
            variant='secondary'
            loading={isSaving}
            onClick={() => void write({ kind: 'back', id: span.id, todayKey })}
          >
            {HELM_COPY.whereBack}
          </Button>
          <p className={hintClass}>{HELM_COPY.whereBackHint}</p>
        </div>
      )}
      <div className='flex flex-col gap-1.5'>
        <Button
          type='button'
          variant='secondary'
          className='text-destructive! border-destructive/40!'
          disabled={isSaving}
          onClick={() => void write({ kind: 'remove', id: span.id })}
        >
          {HELM_COPY.whereRemove}
        </Button>
        <p className={hintClass}>{HELM_COPY.whereRemoveHint}</p>
      </div>
    </div>
  );
}

function WhereBody({ requestClose, onDirtyChange, ...rest }: WhereFormProps) {
  const [isEditing, setIsEditing] = useState(
    rest.target.kind === 'home' || rest.target.spanId === null,
  );
  if (rest.target.kind === 'home') {
    return (
      <HomeForm
        {...rest}
        requestClose={requestClose}
        onDirtyChange={onDirtyChange}
      />
    );
  }
  return isEditing ? (
    <AwayForm
      {...rest}
      requestClose={requestClose}
      onDirtyChange={onDirtyChange}
    />
  ) : (
    <AwayActions {...rest} onEdit={() => setIsEditing(true)} />
  );
}

const sheetTitle = (
  who: WhereFormProps['who'],
  target: WhereSheetProps['target'],
  todayKey: string,
) => {
  if (target?.kind === 'home') return HELM_COPY.whereHomeSheetTitle;
  const span =
    target?.kind === 'away'
      ? (who.away ?? []).find((entry) => entry.id === target.spanId)
      : undefined;
  return span
    ? formatAwayLine(span, todayKey).replace(/^In /, '')
    : HELM_COPY.whereAwaySheetTitle;
};

/** Home, a time away, or the choices on one away span: change it, end it early or remove it. */
function WhereSheet({ who, target, todayKey, onClose }: WhereSheetProps) {
  const [isDirty, setIsDirty] = useState(false);
  const close = () => {
    setIsDirty(false);
    onClose();
  };
  const requestClose = useDiscardGuard({ isDirty, onClose: close });
  return (
    <FormSheet
      isOpen={target !== null}
      onClose={requestClose}
      title={sheetTitle(who, target, todayKey)}
    >
      {target && (
        <WhereBody
          who={who}
          target={target}
          todayKey={todayKey}
          requestClose={requestClose}
          onDirtyChange={setIsDirty}
          onSaved={close}
        />
      )}
    </FormSheet>
  );
}

export default WhereSheet;
