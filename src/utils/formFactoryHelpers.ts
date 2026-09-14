import { FormFactories } from '@moondreamsdev/dreamer-ui/components';

const { input } = FormFactories;
type FormInputFactoryField = Parameters<typeof input>[0];

/**
 * FormFactories' input type doesn't include 'date' yet; this wraps it with the cast
 * needed to render a real `<input type="date">` until dreamer-ui adds native support.
 */
export function createDateInputField(field: Omit<FormInputFactoryField, 'type'>) {
  return input({ ...field, type: 'date' } as unknown as FormInputFactoryField);
}
