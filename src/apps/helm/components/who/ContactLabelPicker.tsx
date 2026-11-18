import { useState } from 'react';

import { Input } from '@moondreamsdev/dreamer-ui/components';

import { PillGroup } from '@/components/PillGroup';
import { HELM_COPY } from '@apps/helm/constants';
import {
  CONTACT_LABEL_CAP,
  contactLabelsFor,
  type ContactKind,
} from '@apps/helm/engine/contactPoints';

interface ContactLabelPickerProps {
  /** What the entry is called as typed so far; settled by `toContactLabel` when it is kept. */
  label: string;
  kind: ContactKind;
  onChange: (label: string) => void;
}

const OWN = 'own';

const isPreset = (kind: ContactKind, label: string) =>
  contactLabelsFor(kind).some((entry) => entry === label);

/** Mobile (a phone only), Home, Work, Other or the person's own word of at most 20 characters. */
function ContactLabelPicker({
  label,
  kind,
  onChange,
}: ContactLabelPickerProps) {
  const [isOwn, setIsOwn] = useState(!isPreset(kind, label));
  const options = [
    ...contactLabelsFor(kind).map((entry) => ({
      value: entry as string,
      label: entry,
    })),
    { value: OWN, label: HELM_COPY.contactOwnLabel },
  ];

  return (
    <div className='space-y-2'>
      <PillGroup
        label={HELM_COPY.contactLabelField}
        isThin
        wrapsNarrow
        options={options}
        value={isOwn ? OWN : label}
        onChange={(value) => {
          if (value === OWN) {
            setIsOwn(true);
            if (isPreset(kind, label)) onChange('');
            return;
          }
          setIsOwn(false);
          onChange(value);
        }}
      />
      {isOwn && (
        <Input
          aria-label={HELM_COPY.contactOwnLabel}
          value={label}
          maxLength={CONTACT_LABEL_CAP}
          placeholder={HELM_COPY.contactOwnLabelPlaceholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

export default ContactLabelPicker;
