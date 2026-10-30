import { useImperativeHandle, useRef, type Ref } from 'react';

export interface ReceiptChooser {
  open: () => void;
}

interface ReceiptFileInputProps {
  /** Lets the control that sits beside the input open the chooser. */
  chooser: Ref<ReceiptChooser>;
  onFiles: (files: File[]) => void;
  /** False takes one file at a time. */
  isMultiple?: boolean;
}

/** The file chooser behind a control: photos and screenshots, several at once; a phone's chooser offers its camera. */
function ReceiptFileInput({
  chooser,
  onFiles,
  isMultiple = true,
}: ReceiptFileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(chooser, () => ({
    open: () => inputRef.current?.click(),
  }));

  return (
    <input
      ref={inputRef}
      type='file'
      accept='image/*'
      multiple={isMultiple}
      className='hidden'
      tabIndex={-1}
      aria-hidden='true'
      onChange={(event) => {
        onFiles(Array.from(event.target.files ?? []));
        event.target.value = '';
      }}
    />
  );
}

export default ReceiptFileInput;
