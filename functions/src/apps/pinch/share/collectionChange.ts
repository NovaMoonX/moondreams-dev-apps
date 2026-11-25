/** The part of Pinch's collection type that a recipe's recorded changes read, so the vendored copy needs no copy of the collections file. */
export interface CollectionChange {
  add: string[];
  remove: string[];
}
