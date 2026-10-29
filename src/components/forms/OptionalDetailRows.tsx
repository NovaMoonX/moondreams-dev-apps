import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { Button } from '@moondreamsdev/dreamer-ui/components';

import FormSheet from '@/components/FormSheet';
import ModalFooterActions from '@/components/ModalFooterActions';
import SectionDivider from '@/components/SectionDivider';
import SummaryRow from '@/components/SummaryRow';
import { canFocusFieldOnOpen, runWhenDrawerSettled } from '@/utils/focusUtils';

const FOCUS_DELAY_MS = 500;
const TYPED_FIELD = 'input:not([type="date"]):not([type="checkbox"]), textarea';

export interface OptionalDetail {
  key: string;
  /** The row's caption and its sheet's title. */
  label: string;
  value: ReactNode;
  /** True while nothing is filled in; Done then takes the detail back off the form. */
  isEmpty: boolean;
  render: () => ReactNode;
}

interface OptionalDetailRowsProps {
  heading: string;
  /** Only the details already added; the rest stay as add chips the caller draws. */
  details: OptionalDetail[];
  openKey: string | null;
  onOpen: (key: string) => void;
  onClose: () => void;
  onRemove: (key: string) => void;
  removeLabel?: string;
}

interface DetailSheetProps {
  detail: OptionalDetail;
  onDone: () => void;
  onRemove: () => void;
  removeLabel: string;
}

function DetailSheet({
  detail,
  onDone,
  onRemove,
  removeLabel,
}: DetailSheetProps) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!canFocusFieldOnOpen()) return;
    return runWhenDrawerSettled(
      bodyRef.current,
      () =>
        bodyRef.current
          ?.querySelector<HTMLElement>(TYPED_FIELD)
          ?.focus({ preventScroll: true }),
      FOCUS_DELAY_MS,
    );
  }, []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement))
      return;
    event.preventDefault();
    onDone();
  };

  return (
    <FormSheet isOpen onClose={onDone} title={detail.label}>
      <div ref={bodyRef} className='space-y-4 pb-4' onKeyDown={handleKeyDown}>
        {detail.render()}
      </div>
      <ModalFooterActions
        cancelAction={
          <Button type='button' variant='tertiary' size='sm' onClick={onRemove}>
            {removeLabel}
          </Button>
        }
        rightActions={
          <Button type='button' onClick={onDone}>
            Done
          </Button>
        }
      />
    </FormSheet>
  );
}

/** A form's optional extras once added: summary rows under their own heading, each opening its field in a sheet whose footer holds Remove beside Done. */
function OptionalDetailRows({
  heading,
  details,
  openKey,
  onOpen,
  onClose,
  onRemove,
  removeLabel = 'Remove',
}: OptionalDetailRowsProps) {
  const opened = details.find((detail) => detail.key === openKey) ?? null;
  const shown = details.filter(
    (detail) => !detail.isEmpty || detail.key === openKey,
  );

  return (
    <>
      {shown.length > 0 && (
        <div className='space-y-2'>
          <SectionDivider label={heading} className='pb-1' />
          {shown.map((detail) => (
            <SummaryRow
              key={detail.key}
              label={detail.label}
              onClick={() => onOpen(detail.key)}
            >
              {detail.value}
            </SummaryRow>
          ))}
        </div>
      )}
      {opened && (
        <DetailSheet
          key={opened.key}
          detail={opened}
          removeLabel={removeLabel}
          onRemove={() => {
            onRemove(opened.key);
            onClose();
          }}
          onDone={() => {
            if (opened.isEmpty) onRemove(opened.key);
            onClose();
          }}
        />
      )}
    </>
  );
}

export default OptionalDetailRows;
