export interface RulesLanding {
  /** The name of the item the rules sent spending to. */
  name: string;
  ruleIds: readonly string[];
}

// Kept out of the URL for the same reason as an open item request: it is read once when Rules mounts.
let landing: RulesLanding | null = null;

/** Opens Rules already picking the given rules, with a line saying why they were brought here. */
export const setRulesLanding = (next: RulesLanding | null) => {
  landing = next;
};

export const readRulesLanding = () => landing;
