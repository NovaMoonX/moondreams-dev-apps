export interface RulesLanding {
  /** The name of the item the rules sent spending to. */
  name: string;
  ruleIds: readonly string[];
}

const FRESH_MS = 5_000;

// Kept out of the URL for the same reason as an open item request; one Rules did not open for goes stale rather than greeting a later visit.
let landing: (RulesLanding & { at: number }) | null = null;

/** Opens Rules already picking the given rules, with a line saying why they were brought here. */
export const setRulesLanding = (next: RulesLanding | null) => {
  landing = next === null ? null : { ...next, at: Date.now() };
};

export const readRulesLanding = (): RulesLanding | null =>
  landing !== null && Date.now() - landing.at < FRESH_MS ? landing : null;
