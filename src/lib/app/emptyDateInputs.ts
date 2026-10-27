const SELECTOR = 'input[type="date"]';

const sync = (input: HTMLInputElement) => {
  input.toggleAttribute('data-empty', input.value === '');
};

const syncWithin = (node: Node) => {
  if (!(node instanceof Element)) return;
  if (node.matches(SELECTOR)) sync(node as HTMLInputElement);
  node.querySelectorAll<HTMLInputElement>(SELECTOR).forEach(sync);
};

/** Marks every date input that has no date (`data-empty`), so `index.css` can hide the browser's "mm/dd/yyyy" segments until one is picked. */
export function installEmptyDateInputs() {
  const onEvent = (event: Event) => {
    if (event.target instanceof HTMLInputElement && event.target.type === 'date')
      sync(event.target);
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
