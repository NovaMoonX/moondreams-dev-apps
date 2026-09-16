import { useMemo, useState } from 'react';

import {
  Button,
  Form,
  FormFactories,
  Input,
  Label,
  Modal,
  Select,
} from '@moondreamsdev/dreamer-ui/components';
import { useActionModal } from '@moondreamsdev/dreamer-ui/hooks';
import { shallowEqual } from 'react-redux';

import { useAppDispatch, useAppSelector } from '@/store';
import { createDateInputField, fromDateInputValue, toDateInputValue } from '@/utils';
import {
  PREVENTIVE_NAME_OPTIONS,
  PREVENTIVE_TYPE_OPTIONS,
} from '@apps/nine-lives/constants/presetOptions';
import { createCustomPreventiveProduct } from '@apps/nine-lives/store/actions/customPreventiveProductsActions';
import { createCustomPreventiveType } from '@apps/nine-lives/store/actions/customPreventiveTypesActions';
import type { PreventiveFormSubmission } from '@apps/nine-lives/store/actions/preventivesActions';
import {
  selectClinicsByHousehold,
  selectCustomPreventiveProductsByHousehold,
  selectCustomPreventiveTypesByHousehold,
  selectDoctorsByHousehold,
  selectVisitsByHousehold,
} from '@apps/nine-lives/store/selectors';
import type { PreventiveType } from '@apps/nine-lives/types';
import { getVisitOptions } from '@apps/nine-lives/utils/visitOptions';

import CatPillSelector from './CatPillSelector';
import DetailsDisclosure from './DetailsDisclosure';

const NEW_PRODUCT_VALUE = '__new_preventive_product__';
const NEW_TYPE_VALUE = '__new_preventive_type__';

interface ProductChoice {
  preset: string;
  customLabel: string;
}

interface TypeChoice {
  preset: string;
  customLabel: string;
}

interface AdditionalDetailsValue {
  dosage: string;
  clinicId: string;
  doctorId: string;
  linkedVisitId: string;
}

interface PreventiveFormValues {
  catIds: string[];
  product: ProductChoice;
  type: TypeChoice;
  administeredAt: string;
  expiresAt?: string;
  additionalDetails: AdditionalDetailsValue;
}

/**
 * `id` here is purely a UI signal for this form ("is a record's latest dose being edited in
 * place?") — it does not have to be the record actually being submitted to. Callers logging a
 * new dose against an existing record track that record's id themselves and omit `id` here so
 * the form renders as a fresh "Add" (no Delete button, submit reads "Add preventive").
 */
export type PreventiveFormInitialValues = Partial<PreventiveFormSubmission>;

interface PreventiveFormModalProps {
  isOpen: boolean;
  householdId: string;
  uid: string;
  catOptions: { label: string; value: string }[];
  /** Cats to pre-check when adding a new dose (ignored when editing an existing one). */
  defaultCatIds?: string[];
  initialPreventive?: PreventiveFormInitialValues | null;
  /** Title override — used for "Mark administered today", which prefills like an edit but isn't one. */
  title?: string;
  isSubmitting?: boolean;
  onSubmit: (preventive: PreventiveFormSubmission) => Promise<void> | void;
  onDelete?: (preventiveId: string) => Promise<void> | void;
  onClose: () => void;
}

function getInitialProductChoice(preventive: PreventiveFormInitialValues | null | undefined): ProductChoice {
  if (!preventive) {
    return { preset: PREVENTIVE_NAME_OPTIONS[0], customLabel: '' };
  }

  if (preventive.customProductId) {
    return { preset: `custom:${preventive.customProductId}`, customLabel: '' };
  }

  if (PREVENTIVE_NAME_OPTIONS.includes(preventive.name as (typeof PREVENTIVE_NAME_OPTIONS)[number])) {
    return { preset: preventive.name ?? PREVENTIVE_NAME_OPTIONS[0], customLabel: '' };
  }

  return { preset: NEW_PRODUCT_VALUE, customLabel: preventive.name ?? '' };
}

function getInitialTypeChoice(preventive: PreventiveFormInitialValues | null | undefined): TypeChoice {
  if (!preventive) {
    return { preset: 'flea-tick', customLabel: '' };
  }

  if (preventive.type === 'custom' && preventive.customTypeId) {
    return { preset: `custom:${preventive.customTypeId}`, customLabel: '' };
  }

  return { preset: preventive.type ?? 'flea-tick', customLabel: '' };
}

function ProductField({
  value,
  onValueChange,
  disabled,
  customProducts,
}: {
  value: ProductChoice;
  onValueChange: (value: ProductChoice) => void;
  disabled?: boolean;
  customProducts: { id: string; label: string }[];
}) {
  const options = [
    ...PREVENTIVE_NAME_OPTIONS.map((option) => ({ text: option, value: option })),
    ...customProducts.map((product) => ({ text: product.label, value: `custom:${product.id}` })),
    { text: 'Add a custom product…', value: NEW_PRODUCT_VALUE },
  ];

  return (
    <div className='space-y-2'>
      <Select
        options={options}
        value={value.preset}
        placeholder='Select a product'
        disabled={disabled}
        searchable
        onChange={(preset) => onValueChange({ preset, customLabel: value.customLabel })}
      />
      {value.preset === NEW_PRODUCT_VALUE && (
        <Input
          value={value.customLabel}
          onChange={(event) => onValueChange({ ...value, customLabel: event.target.value })}
          placeholder='Enter the product name'
          variant='outline'
          disabled={disabled}
        />
      )}
    </div>
  );
}

function TypeField({
  value,
  onValueChange,
  disabled,
  customTypes,
}: {
  value: TypeChoice;
  onValueChange: (value: TypeChoice) => void;
  disabled?: boolean;
  customTypes: { id: string; label: string }[];
}) {
  const options = [
    ...PREVENTIVE_TYPE_OPTIONS.map((option) => ({ text: option.label, value: option.value })),
    ...customTypes.map((type) => ({ text: type.label, value: `custom:${type.id}` })),
    { text: 'Add a custom type…', value: NEW_TYPE_VALUE },
  ];

  return (
    <div className='space-y-2'>
      <Select
        options={options}
        value={value.preset}
        placeholder='Select a type'
        disabled={disabled}
        searchable
        onChange={(preset) => onValueChange({ preset, customLabel: value.customLabel })}
      />
      {value.preset === NEW_TYPE_VALUE && (
        <Input
          value={value.customLabel}
          onChange={(event) => onValueChange({ ...value, customLabel: event.target.value })}
          placeholder='Enter the preventive type'
          variant='outline'
          disabled={disabled}
        />
      )}
    </div>
  );
}

function AdditionalDetailsFields({
  value,
  onValueChange,
  disabled,
  clinicOptions,
  doctorOptions,
  visitOptions,
}: {
  value: AdditionalDetailsValue;
  onValueChange: (value: AdditionalDetailsValue) => void;
  disabled?: boolean;
  clinicOptions: { label: string; value: string }[];
  doctorOptions: { label: string; value: string }[];
  visitOptions: { label: string; value: string }[];
}) {
  const update = (changes: Partial<AdditionalDetailsValue>) =>
    onValueChange({ ...value, ...changes });

  return (
    <DetailsDisclosure label='Additional details'>
      <div className='space-y-3'>
        <div className='space-y-1'>
          <Label className='text-sm'>Dosage</Label>
          <Input
            value={value.dosage}
            onChange={(event) => update({ dosage: event.target.value })}
            placeholder='e.g. 0.5 mL'
            variant='outline'
            disabled={disabled}
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-sm'>Clinic</Label>
          <Select
            options={clinicOptions.map((option) => ({ text: option.label, value: option.value }))}
            value={value.clinicId}
            disabled={disabled}
            onChange={(clinicId) => update({ clinicId })}
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-sm'>Doctor</Label>
          <Select
            options={doctorOptions.map((option) => ({ text: option.label, value: option.value }))}
            value={value.doctorId}
            disabled={disabled}
            onChange={(doctorId) => update({ doctorId })}
          />
        </div>
        <div className='space-y-1'>
          <Label className='text-sm'>Linked visit</Label>
          <Select
            options={[{ text: 'None', value: '' }, ...visitOptions.map((option) => ({ text: option.label, value: option.value }))]}
            value={value.linkedVisitId}
            placeholder='Select a visit'
            disabled={disabled}
            onChange={(linkedVisitId) => update({ linkedVisitId })}
          />
        </div>
      </div>
    </DetailsDisclosure>
  );
}

function PreventiveFormModal({
  isOpen,
  householdId,
  uid,
  catOptions,
  defaultCatIds = [],
  initialPreventive,
  title,
  isSubmitting = false,
  onSubmit,
  onDelete,
  onClose,
}: PreventiveFormModalProps) {
  const dispatch = useAppDispatch();
  const { confirm } = useActionModal();
  const clinics = useAppSelector(selectClinicsByHousehold(householdId), shallowEqual);
  const doctors = useAppSelector(selectDoctorsByHousehold(householdId), shallowEqual);
  const visits = useAppSelector(selectVisitsByHousehold(householdId), shallowEqual);
  const customProducts = useAppSelector(
    selectCustomPreventiveProductsByHousehold(householdId),
    shallowEqual,
  );
  const customTypes = useAppSelector(
    selectCustomPreventiveTypesByHousehold(householdId),
    shallowEqual,
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEditing = Boolean(initialPreventive?.id);
  const formId = initialPreventive?.id ?? 'new-nine-lives-preventive';

  const clinicOptions = useMemo(
    () => [
      { label: 'None', value: '' },
      ...clinics.map((clinic) => ({ label: clinic.name, value: clinic.id })),
    ],
    [clinics],
  );
  const doctorOptions = useMemo(
    () => [
      { label: 'None', value: '' },
      ...doctors.map((doctor) => ({ label: doctor.name, value: doctor.id })),
    ],
    [doctors],
  );
  const visitOptions = useMemo(() => getVisitOptions(visits), [visits]);
  const fields = useMemo(
    () => [
      FormFactories.custom({
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
      FormFactories.custom({
        name: 'product',
        label: 'Product',
        required: true,
        renderComponent: (props) => (
          <ProductField
            value={props.value as ProductChoice}
            onValueChange={props.onValueChange}
            disabled={props.disabled}
            customProducts={customProducts}
          />
        ),
      }),
      FormFactories.custom({
        name: 'type',
        label: 'Preventive type',
        required: true,
        renderComponent: (props) => (
          <TypeField
            value={props.value as TypeChoice}
            onValueChange={props.onValueChange}
            disabled={props.disabled}
            customTypes={customTypes}
          />
        ),
      }),
      createDateInputField({
        name: 'administeredAt',
        label: 'Administered date',
        required: true,
        variant: 'outline',
      }),
      createDateInputField({
        name: 'expiresAt',
        label: 'Next due date (optional)',
        variant: 'outline',
      }),
      FormFactories.custom({
        name: 'additionalDetails',
        label: '',
        renderComponent: (props) => (
          <AdditionalDetailsFields
            value={props.value as AdditionalDetailsValue}
            onValueChange={props.onValueChange}
            disabled={props.disabled}
            clinicOptions={clinicOptions}
            doctorOptions={doctorOptions}
            visitOptions={visitOptions}
          />
        ),
        colSpan: 'full',
      }),
    ],
    [catOptions, clinicOptions, customProducts, customTypes, doctorOptions, visitOptions],
  );

  const handleSubmit = async (data: PreventiveFormValues) => {
    setSubmitError(null);
    const administeredAt = fromDateInputValue(data.administeredAt) ?? null;

    if (administeredAt === null) {
      return;
    }

    if (data.catIds.length === 0) {
      setSubmitError('Select at least one cat.');
      return;
    }

    let name: string;
    let customProductId: string | null;

    if (data.product.preset === NEW_PRODUCT_VALUE) {
      const trimmed = data.product.customLabel.trim();

      if (!trimmed) {
        setSubmitError('Enter a product name.');
        return;
      }

      const product = await dispatch(
        createCustomPreventiveProduct({ householdId, uid, label: trimmed }),
      ).unwrap();
      name = product.label;
      customProductId = product.id;
    } else if (data.product.preset.startsWith('custom:')) {
      const productId = data.product.preset.slice('custom:'.length);
      const product = customProducts.find((item) => item.id === productId);

      if (!product) {
        setSubmitError('Select a product.');
        return;
      }

      name = product.label;
      customProductId = product.id;
    } else {
      name = data.product.preset;
      customProductId = null;
    }

    let type: PreventiveType;
    let customTypeId: string | null;

    if (data.type.preset === NEW_TYPE_VALUE) {
      const trimmed = data.type.customLabel.trim();

      if (!trimmed) {
        setSubmitError('Enter a preventive type.');
        return;
      }

      const customType = await dispatch(
        createCustomPreventiveType({ householdId, uid, label: trimmed }),
      ).unwrap();
      type = 'custom';
      customTypeId = customType.id;
    } else if (data.type.preset.startsWith('custom:')) {
      type = 'custom';
      customTypeId = data.type.preset.slice('custom:'.length);
    } else {
      type = data.type.preset as PreventiveType;
      customTypeId = null;
    }

    await onSubmit({
      id: initialPreventive?.id,
      catIds: data.catIds,
      name,
      customProductId,
      type,
      customTypeId,
      administeredAt,
      expiresAt: data.expiresAt ? (fromDateInputValue(data.expiresAt) ?? null) : null,
      dosage: data.additionalDetails.dosage.trim() || null,
      clinicId: data.additionalDetails.clinicId.trim() || null,
      doctorId: data.additionalDetails.doctorId.trim() || null,
      linkedVisitId: data.additionalDetails.linkedVisitId.trim() || null,
    });
  };

  const handleDelete = async () => {
    if (!initialPreventive?.id || !onDelete) {
      return;
    }

    const confirmed = await confirm({
      title: 'Delete preventive dose',
      message: `Are you sure you want to delete ${initialPreventive.name}?`,
      destructive: true,
    });

    if (confirmed) {
      await onDelete(initialPreventive.id);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title ?? (isEditing ? 'Edit preventive dose' : 'Add preventive / medication')}
    >
      <Form
        key={formId}
        id={formId}
        form={fields}
        initialData={{
          catIds: initialPreventive?.catIds ?? defaultCatIds,
          product: getInitialProductChoice(initialPreventive),
          type: getInitialTypeChoice(initialPreventive),
          administeredAt: toDateInputValue(initialPreventive?.administeredAt ?? undefined),
          expiresAt: toDateInputValue(initialPreventive?.expiresAt ?? undefined),
          additionalDetails: {
            dosage: initialPreventive?.dosage ?? '',
            clinicId: initialPreventive?.clinicId ?? '',
            doctorId: initialPreventive?.doctorId ?? '',
            linkedVisitId: initialPreventive?.linkedVisitId ?? '',
          },
        }}
        columns={1}
        spacing='normal'
        onSubmit={(data) => {
          void handleSubmit(data as PreventiveFormValues);
        }}
        submitButton={
          <div className='flex items-center justify-between gap-2'>
            {isEditing && onDelete ? (
              <Button
                type='button'
                variant='secondary'
                onClick={() => void handleDelete()}
                disabled={isSubmitting}
              >
                Delete
              </Button>
            ) : (
              <span />
            )}
            <Button type='submit' loading={isSubmitting}>
              {isSubmitting ? 'Saving…' : isEditing ? 'Save preventive' : 'Add preventive'}
            </Button>
          </div>
        }
      />
      {submitError && <p className='mt-3 text-sm text-red-500'>{submitError}</p>}
    </Modal>
  );
}

export default PreventiveFormModal;
