const OPEN_DIALOG_SELECTOR =
  '[role="dialog"]:not([inert]):not([aria-hidden="true"]), [role="alertdialog"]:not([inert]):not([aria-hidden="true"])';

const CLOSING_DIALOG_SELECTOR =
  '[data-drawer-open="false"], [data-panel-open="false"]';

/** Whether a drawer, modal or sheet is open above the page, not counting a subview's own full-screen layer. */
export function hasDialogOnTop() {
  const dialogs = Array.from(document.querySelectorAll(OPEN_DIALOG_SELECTOR));
  const result = dialogs.some(
    (dialog) => !dialog.hasAttribute('data-subview-overlay'),
  );
  return result;
}

/** The open dialogs opened after `reference` (every open one when it is null), leaving out a subview's own layer and a drawer sliding shut. */
export function getDialogsAbove(reference: Element | null) {
  const dialogs = Array.from(document.querySelectorAll(OPEN_DIALOG_SELECTOR));
  const result = dialogs.filter(
    (dialog) =>
      dialog !== reference &&
      !dialog.hasAttribute('data-subview-overlay') &&
      !dialog.matches(CLOSING_DIALOG_SELECTOR) &&
      (reference === null ||
        (reference.compareDocumentPosition(dialog) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
          0),
  );
  return result;
}
