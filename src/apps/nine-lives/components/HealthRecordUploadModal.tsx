import { useMemo, useRef, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Modal,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { join } from '@moondreamsdev/dreamer-ui/utils';
import { Camera, FileUp } from 'lucide-react';
import { shallowEqual } from 'react-redux';

import { useCanTakePhoto } from '@/hooks/useCanTakePhoto';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  createDateInputField,
  fromDateInputValue,
  toDateInputValue,
} from '@/utils';
import { getErrorMessage, getStorageErrorMessage } from '@/utils/errorUtils';
import { openFileChooser } from '@/utils/fileUtils';
import { shrinkDocumentPhoto } from '@/utils/imageCompression';

import { createCustomHealthRecordType } from '../store/actions/customHealthRecordTypesActions';
import {
  createHealthRecord,
  getHealthRecordFileType,
  updateHealthRecord,
} from '../store/actions/healthRecordsActions';
import { selectVisitsByHousehold } from '../store/selectors';
import type { HealthRecord, HealthRecordType } from '../types';
import { getVisitOptions } from '../utils/visitOptions';
import CatPillSelector from './CatPillSelector';
import DeleteIconButton from './DeleteIconButton';
import ModalFooterActions from './ModalFooterActions';
import RecordTypeField, { RecordTypeChoice } from './RecordTypeField';

const { custom, input, select } = FormFactories;

const mutedLinkClassName = 'text-muted-foreground hover:text-foreground px-0';

const NEW_TYPE_VALUE = '__new__';
const MAX_HEALTH_RECORD_BYTES = 10 * 1024 * 1024;

interface HealthRecordFormValues {
  catIds: string[];
  file: File | null;
  label?: string | null;
  recordType: RecordTypeChoice;
  recordDate: string;
  linkedVisitId?: string | null;
}

interface HealthRecordUploadModalProps {
  isOpen: boolean;
  householdId: string;
  catOptions: { label: string; value: string }[];
  uid: string;
  initialRecord?: HealthRecord | null;
  onDelete?: (recordId: string) => Promise<void> | void;
  onClose: () => void;
}

function getInitialRecordTypeChoice(
  record: HealthRecord | null | undefined,
): RecordTypeChoice {
  if (!record) {
    return {
      value: 'lab_result',
      customRecordTypeId: null,
      customLabel: '',
    };
  }

  return {
    value: record.recordType,
    customRecordTypeId: record.customRecordTypeId,
    customLabel: '',
  };
}

function FilePicker({
  value,
  onValueChange,
  disabled,
}: {
  value: File | null;
  onValueChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const canTakePhoto = useCanTakePhoto();
  const isBusy = disabled || isPreparing;

  const handleFile = async (picked: File) => {
    if (!getHealthRecordFileType(picked)) {
      setError('Unsupported file type. Please choose a PDF or image file.');
      onValueChange(null);
      return;
    }

    setIsPreparing(true);
    const file = await shrinkDocumentPhoto(picked);
    setIsPreparing(false);

    if (file.size > MAX_HEALTH_RECORD_BYTES) {
      setError('That file is too big to keep. Try a photo, or a PDF under 10 MB.');
      onValueChange(null);
      return;
    }

    setError(null);
    onValueChange(file);
  };

  return (
    <div className='space-y-2'>
      <input
        ref={inputRef}
        type='file'
        accept='application/pdf,image/*'
        className='hidden'
        tabIndex={-1}
        aria-hidden='true'
        onChange={(event) => {
          const file = event.target.files?.[0] ?? null;
          event.target.value = '';
          if (file) void handleFile(file);
        }}
      />
      <div className={join('grid gap-2', canTakePhoto && 'grid-cols-2')}>
        {canTakePhoto && (
          <Button
            type='button'
            variant='secondary'
            className='h-11 gap-1.5 px-2.5 whitespace-nowrap'
            disabled={isBusy}
            onClick={() => openFileChooser(inputRef.current, { isCamera: true })}
          >
            <Camera className='h-4 w-4 shrink-0 max-[380px]:hidden' aria-hidden='true' />
            Take a photo
          </Button>
        )}
        <Button
          type='button'
          variant='secondary'
          className='h-11 gap-1.5 px-2.5 whitespace-nowrap'
          disabled={isBusy}
          loading={isPreparing}
          onClick={() => openFileChooser(inputRef.current)}
        >
          <FileUp className='h-4 w-4 shrink-0 max-[380px]:hidden' aria-hidden='true' />
          {value ? 'Choose another' : 'Choose a file'}
        </Button>
      </div>
      {value && <p className='text-muted-foreground truncate text-sm'>{value.name}</p>}
      {error && <p className='text-sm text-red-500'>{error}</p>}
    </div>
  );
}

function HealthRecordUploadModal({
  isOpen,
  householdId,
  catOptions,
  uid,
  initialRecord = null,
  onDelete,
  onClose,
}: HealthRecordUploadModalProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();

  const visits = useAppSelector(
    selectVisitsByHousehold(householdId),
    shallowEqual,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [labelOpen, setLabelOpen] = useState(Boolean(initialRecord?.label));
  const isEditing = Boolean(initialRecord?.id);
  const [isValid, setIsValid] = useState(
    Boolean(
      (initialRecord?.catIds?.length ?? 0) > 0 &&
      (isEditing || initialRecord?.fileName),
    ),
  );
  const formId = initialRecord?.id ?? 'new-nine-lives-health-record';

  const visitOptions = useMemo(
    () => [{ label: 'None', value: '' }, ...getVisitOptions(visits)],
    [visits],
  );

  const fields = useMemo(
    () => [
      custom({
        name: 'catIds',
        label: 'Cats',
        renderComponent: (props) => (
          <CatPillSelector
            catOptions={catOptions}
            value={props.value as string[]}
            onValueChange={props.onValueChange}
            disabled={props.disabled}
          />
        ),
        colSpan: 'full',
      }),
      custom({
        name: 'file',
        label: 'File',
        required: !isEditing,
        renderComponent: ({ value, onValueChange, disabled }) =>
          isEditing ? (
            <p className='text-muted-foreground text-sm'>
              Stored file: {initialRecord?.fileName}
            </p>
          ) : (
            <FilePicker
              value={(value as File | null) ?? null}
              onValueChange={onValueChange}
              disabled={disabled}
            />
          ),
      }),
      labelOpen
        ? input({
            name: 'label',
            label: 'Label',
            placeholder: 'e.g. Rabies certificate photo',
            variant: 'outline',
          })
        : custom({
            name: '_addLabel',
            label: '',
            renderComponent: () => (
              <Button
                type='button'
                variant='link'
                size='sm'
                className={mutedLinkClassName}
                onClick={() => setLabelOpen(true)}
              >
                + Add label
              </Button>
            ),
          }),
      custom({
        name: 'recordType',
        label: 'Record type',
        required: true,
        renderComponent: ({ value, onValueChange, disabled }) => (
          <RecordTypeField
            value={value as RecordTypeChoice}
            onValueChange={onValueChange}
            disabled={disabled}
            householdId={householdId}
          />
        ),
      }),
      createDateInputField({
        name: 'recordDate',
        label: 'Record date (optional)',
        variant: 'outline',
      }),
      select({
        name: 'linkedVisitId',
        label: 'Linked visit (optional)',
        options: visitOptions,
      }),
    ],
    [
      catOptions,
      householdId,
      initialRecord?.fileName,
      isEditing,
      labelOpen,
      visitOptions,
    ],
  );

  const handleSubmit = async (data: HealthRecordFormValues) => {
    setSubmitError(null);

    const catIds =
      data.catIds.length > 0 ? data.catIds : (initialRecord?.catIds ?? []);

    if (catIds.length === 0) {
      setSubmitError('Select at least one cat.');
      return;
    }

    setIsSubmitting(true);

    try {
      let recordType: HealthRecordType = data.recordType
        .value as HealthRecordType;
      let customRecordTypeId = data.recordType.customRecordTypeId;

      if (data.recordType.value === NEW_TYPE_VALUE) {
        const customType = await dispatch(
          createCustomHealthRecordType({
            householdId,
            uid,
            label: data.recordType.customLabel,
          }),
        ).unwrap();
        recordType = 'custom';
        customRecordTypeId = customType.id;
      }

      if (recordType === 'custom' && !customRecordTypeId) {
        setSubmitError('Select or enter a custom record type.');
        return;
      }

      const recordDate = data.recordDate
        ? fromDateInputValue(data.recordDate)
        : null;

      const label = data.label?.trim() || null;
      const linkedVisitId = data.linkedVisitId?.trim() || null;

      if (isEditing && initialRecord) {
        await dispatch(
          updateHealthRecord({
            householdId,
            recordId: initialRecord.id,
            changes: {
              catIds,
              label,
              recordType,
              customRecordTypeId,
              recordDate,
              linkedVisitId,
            },
          }),
        ).unwrap();
      } else if (data.file instanceof File) {
        await dispatch(
          createHealthRecord({
            householdId,
            catIds,
            uid,
            file: data.file,
            label,
            recordType,
            customRecordTypeId,
            recordDate,
            linkedVisitId,
          }),
        ).unwrap();
      } else {
        setSubmitError('Choose a PDF or image file.');
        return;
      }

      onClose();
    } catch (error) {
      setSubmitError(
        getStorageErrorMessage(
          error,
          getErrorMessage(error, 'Unable to save health record.'),
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!initialRecord?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete health record',
      message: `Are you sure you want to delete ${initialRecord.fileName}? This removes the file permanently.`,
      destructive: true,
    });

    if (confirmed) {
      setIsSubmitting(true);
      try {
        await onDelete(initialRecord.id);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title='Health record'>
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={{
          catIds: initialRecord?.catIds ?? [],
          file: null,
          label: initialRecord?.label ?? '',
          recordType: getInitialRecordTypeChoice(initialRecord),
          recordDate: toDateInputValue(initialRecord?.recordDate ?? undefined),
          linkedVisitId: initialRecord?.linkedVisitId ?? '',
        }}
        columns={1}
        spacing='normal'
        onDataChange={(data) => {
          const values = data as HealthRecordFormValues;
          const catIds =
            values.catIds.length > 0
              ? values.catIds
              : (initialRecord?.catIds ?? []);
          setIsValid(
            Boolean(
              catIds.length > 0 && (isEditing || values.file instanceof File),
            ),
          );
        }}
        onSubmit={(data) => {
          void handleSubmit(data as HealthRecordFormValues);
        }}
        submitButton={
          <ModalFooterActions
            leftActions={
              isEditing &&
              onDelete && (
                <DeleteIconButton
                  onClick={() => void handleDelete()}
                  disabled={isSubmitting}
                />
              )
            }
            rightActions={
              <Button type='submit' loading={isSubmitting} disabled={!isValid}>
                {isSubmitting ? 'Saving…' : isEditing ? 'Save' : 'Upload'}
              </Button>
            }
          />
        }
      />
      {submitError && (
        <p className='mt-3 text-sm text-red-500'>{submitError}</p>
      )}
      {!isEditing && (
        <p className='text-muted-foreground mt-3 text-xs'>
          A PDF or a photo. A PDF can be up to 10 MB.
        </p>
      )}
    </Modal>
  );
}

export default HealthRecordUploadModal;
