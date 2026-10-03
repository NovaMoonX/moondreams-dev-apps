import { useEffect } from 'react';

const FIELD_SELECTOR = 'input:not([autocomplete]), textarea:not([autocomplete])';

const disableAutocomplete = (root: ParentNode) =>
  root.querySelectorAll(FIELD_SELECTOR).forEach((field) => field.setAttribute('autocomplete', 'off'));

// Library-built form fields expose no autocomplete option, so the default is set on the DOM.
// Only insertions are observed and only the added subtree is scanned, so cost tracks what mounts.
// A field with its own autocomplete attribute is left alone.
export function useDisableAutocomplete() {
  useEffect(() => {
    disableAutocomplete(document);

    const observer = new MutationObserver((mutations) =>
      mutations.forEach((mutation) =>
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.matches(FIELD_SELECTOR)) node.setAttribute('autocomplete', 'off');
          disableAutocomplete(node);
        }),
      ),
    );
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);
}
