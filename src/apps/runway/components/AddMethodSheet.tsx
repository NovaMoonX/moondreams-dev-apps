import { Landmark, Pencil } from 'lucide-react';

import FormSheet from '@/components/FormSheet';
import MethodPicker from '@/components/MethodPicker';
import { LINK_WORDS } from '@apps/runway/constants';

interface AddMethodSheetProps {
  kind: 'card' | 'account';
  onLink: () => void;
  onManual: () => void;
  onClose: () => void;
}

/** At Track and Link, adding a card or account first asks whether to bring it in from the bank. */
function AddMethodSheet({
  kind,
  onLink,
  onManual,
  onClose,
}: AddMethodSheetProps) {
  return (
    <FormSheet
      isOpen
      onClose={onClose}
      title={
        kind === 'card'
          ? LINK_WORDS.methodCardTitle
          : LINK_WORDS.methodAccountTitle
      }
      actions={<></>}
    >
      <MethodPicker
        methods={[
          {
            id: 'link',
            emoji: <Landmark className='size-5' />,
            title: LINK_WORDS.methodLink,
            description: LINK_WORDS.methodLinkHelp,
            onPick: onLink,
          },
          {
            id: 'manual',
            emoji: <Pencil className='size-5' />,
            title: LINK_WORDS.methodManual,
            description: LINK_WORDS.methodManualHelp,
            onPick: onManual,
          },
        ]}
      />
    </FormSheet>
  );
}

export default AddMethodSheet;
