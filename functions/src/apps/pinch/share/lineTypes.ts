/** The parts of Pinch's recipe line types that grouping reads, so the vendored grouping copy needs no copy of the whole type file. */
export interface RecipeIngredient {
  id: string;
  ingredientId: string | null;
  freeText: string | null;
}

export interface ResolvedIngredient {
  name: string;
}
