import { createElement } from 'react';
import { FormFactories } from '@moondreamsdev/dreamer-ui/components';

import DateInput from '@/components/DateInput';

const { input, custom } = FormFactories;
type FormInputFactoryField = Parameters<typeof input>[0];

/** A form factory's date field, drawn by the shared `DateInput` so an empty one still shows its placeholder. */
export function createDateInputField({
  isValid,
  placeholder,
  variant,
  rounded,
  ...field
}: Omit<FormInputFactoryField, 'type'>) {
  return custom({
    ...field,
    isValid: isValid as ((value: unknown) => { valid: boolean }) | undefined,
    renderComponent: ({ value, onValueChange, disabled, error, name }) =>
      createElement(DateInput, {
        name,
        disabled,
        placeholder,
        variant,
        rounded,
        errorMessage: error,
        required: field.required,
        'aria-label': field.label,
        value: typeof value === 'string' ? value : '',
        onChange: (event) => onValueChange(event.target.value),
      }),
  });
}

/** Same gap as `createDateInputField`, for a native `<input type="time">`. */
export function createTimeInputField(
  field: Omit<FormInputFactoryField, 'type'>,
) {
  return input({ ...field, type: 'time' } as unknown as FormInputFactoryField);
}
