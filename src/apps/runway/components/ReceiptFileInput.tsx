import { useImperativeHandle, useRef, type Ref } from 'react';

import { openFileChooser } from '@/utils/fileUtils';

export interface ReceiptChooser {
  /** `isCamera` opens the phone's rear camera instead of its chooser. */
  open: (options?: { isCamera?: boolean }) => void;
}

interface ReceiptFileInputProps {
  /** Lets the control that sits beside the input open the chooser. */
  chooser: Ref<ReceiptChooser>;
  onFiles: (files: File[]) => void;
  /** False takes one file at a time. */
  isMultiple?: boolean;
}

/** The file chooser behind a control: photos and screenshots, several at once, or the camera. */
function ReceiptFileInput({
  chooser,
  onFiles,
  isMultiple = true,
}: ReceiptFileInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(chooser, () => ({
    open: (options) => openFileChooser(inputRef.current, options),
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
