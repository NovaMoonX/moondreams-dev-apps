const OPEN_DIALOG_SELECTOR =
  '[role="dialog"]:not([inert]):not([aria-hidden="true"]), [role="alertdialog"]:not([inert]):not([aria-hidden="true"])';

/** Whether a drawer, modal or sheet is open above the page, not counting a subview's own full-screen layer. */
export function hasDialogOnTop() {
  const dialogs = Array.from(document.querySelectorAll(OPEN_DIALOG_SELECTOR));
  const result = dialogs.some(
    (dialog) => !dialog.hasAttribute('data-subview-overlay'),
  );
  return result;
}
