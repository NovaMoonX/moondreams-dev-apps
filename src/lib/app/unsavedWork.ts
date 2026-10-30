const holders = new Set<symbol>();
const readers = new Set<() => boolean>();
const typedFields = new Set<HTMLElement>();
const NON_TEXT_INPUTS = new Set([
  'checkbox',
  'radio',
  'range',
  'button',
  'submit',
  'reset',
  'file',
  'color',
  'hidden',
]);

/** Marks that a form on this page holds typed work until the returned release is called. */
export function holdUnsavedWork() {
  const holder = Symbol('unsaved-work');
  holders.add(holder);
  return () => {
    holders.delete(holder);
  };
}

/** Counts a form whose dirtiness lives outside React state (a ref) until the returned release is called. */
export function watchUnsavedWork(read: () => boolean) {
  readers.add(read);
  return () => {
    readers.delete(read);
  };
}

function isTextField(target: EventTarget | null): target is HTMLElement {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement)
    return !NON_TEXT_INPUTS.has(target.type);
  return target instanceof HTMLElement && target.isContentEditable;
}

function stillHoldsText(field: HTMLElement) {
  if (!field.isConnected) return false;
  const text =
    field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
      ? field.value
      : field.textContent;
  return (text ?? '').trim() !== '';
}

// Most forms don't report whether they are dirty, so a field typed into that is still on screen with text in it counts too.
document.addEventListener(
  'input',
  (event) => {
    if (isTextField(event.target)) typedFields.add(event.target);
  },
  true,
);

/** Whether reloading now would throw away something typed: a form that said so, or a field typed into that still shows text. */
export function hasUnsavedWork() {
  if (holders.size > 0 || Array.from(readers).some((read) => read()))
    return true;
  typedFields.forEach((field) => {
    if (!field.isConnected) typedFields.delete(field);
  });
  const result = Array.from(typedFields).some(stillHoldsText);
  return result;
}
