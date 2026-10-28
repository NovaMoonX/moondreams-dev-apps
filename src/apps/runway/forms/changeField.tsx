import { FormFactories } from '@moondreamsdev/dreamer-ui/components';

import ChangeSection from '@apps/runway/components/ChangeSection';

/** The form field an editing form appends to its fields: when the change starts and what it does to each income day. */
export const changeField = FormFactories.custom({
  name: 'change',
  label: '',
  renderComponent: () => <ChangeSection />,
});
