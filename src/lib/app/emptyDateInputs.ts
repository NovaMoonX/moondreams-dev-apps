const SELECTOR = 'input[type="date"]';

const sync = (input: HTMLInputElement) => {
  input.toggleAttribute(
    'data-empty',
    input.value === '' && !input.validity.badInput,
  );
};

const syncWithin = (node: Node) => {
  if (!(node instanceof Element)) return;
  if (node.matches(SELECTOR)) sync(node as HTMLInputElement);
  node.querySelectorAll<HTMLInputElement>(SELECTOR).forEach(sync);
};

/** Marks every date input that has no date (`data-empty`), so `index.css` hides the browser's "mm/dd/yyyy" segments and `DateInput` draws its placeholder instead. */
export function installEmptyDateInputs() {
  const onEvent = (event: Event) => {
    const { target } = event;
    if (!(target instanceof HTMLInputElement) || target.type !== 'date') return;
    // A partly typed date only reports itself as bad input after focus has left.
    sync(target);
    requestAnimationFrame(() => sync(target));
  };
  ['input', 'change', 'focusout'].forEach((name) =>
    document.addEventListener(name, onEvent, true),
  );
  new MutationObserver((records) =>
    records.forEach((record) => {
      if (record.type === 'attributes') syncWithin(record.target);
      record.addedNodes.forEach(syncWithin);
    }),
  ).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['value', 'type'],
  });
  syncWithin(document.documentElement);
}
