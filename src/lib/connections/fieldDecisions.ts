/**
 * What a source app decided about one stored field, per `share/fields.ts`:
 * - `shared`: sent to readers by the app's adapter.
 * - `filter`: read by the adapter only to select or count, never sent.
 * - `never`: private; matches the manifest's never lines and the app's rules (floor prices, buyers' contacts, notes, account numbers).
 * - `notUseful`: ids, bookkeeping and UI state, nothing a reader needs.
 */
export type ShareDecision = 'shared' | 'filter' | 'never' | 'notUseful';
