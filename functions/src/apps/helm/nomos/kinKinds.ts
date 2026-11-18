// Generated from src/apps/helm/engine/kinKinds.ts by scripts/checks/serverCopies.ts. Do not edit; run npm run connections:vendor.
export type KinKind =
  | 'mother'
  | 'father'
  | 'parent'
  | 'sister'
  | 'brother'
  | 'sibling'
  | 'son'
  | 'daughter'
  | 'child'
  | 'partner'
  | 'spouse'
  | 'grandmother'
  | 'grandfather'
  | 'grandparent'
  | 'grandchild'
  | 'aunt'
  | 'uncle'
  | 'cousin'
  | 'niece'
  | 'nephew'
  | 'motherInLaw'
  | 'fatherInLaw'
  | 'parentInLaw'
  | 'sisterInLaw'
  | 'brotherInLaw'
  | 'siblingInLaw'
  | 'sonInLaw'
  | 'daughterInLaw'
  | 'childInLaw'
  | 'stepmother'
  | 'stepfather'
  | 'stepparent'
  | 'stepsister'
  | 'stepbrother'
  | 'stepsibling'
  | 'stepson'
  | 'stepdaughter'
  | 'stepchild';

export type KinOrder = 'older' | 'younger' | 'oldest' | 'youngest' | 'twin';

export const KIN_ORDERS: KinOrder[] = [
  'older',
  'younger',
  'oldest',
  'youngest',
  'twin',
];

/** The person's relation to the self, set by code from the fixed list. */
export interface WhoKin {
  kind: KinKind;
  order: KinOrder | null;
}

export interface KinKindEntry {
  kind: KinKind;
  /** How it is read aloud. */
  spoken: string;
  /** How it is written. */
  written: string;
  /** Whether a younger or older one, an oldest or youngest, or a twin, means anything for it. */
  canOrder: boolean;
  /** Kinds a person of this one also stands for: "my sibling" can be a brother or a sister. */
  takes: KinKind[];
}

const entry = (
  kind: KinKind,
  written: string,
  options: { spoken?: string; canOrder?: boolean; takes?: KinKind[] } = {},
): KinKindEntry => ({
  kind,
  written,
  spoken: options.spoken ?? written,
  canOrder: options.canOrder ?? false,
  takes: options.takes ?? [],
});

/** The only family words a record can carry; anything else the assistant hears stays in the person's own words. */
export const KIN_KINDS: KinKindEntry[] = [
  entry('mother', 'mother'),
  entry('father', 'father'),
  entry('parent', 'parent', { takes: ['mother', 'father'] }),
  entry('sister', 'sister', { canOrder: true }),
  entry('brother', 'brother', { canOrder: true }),
  entry('sibling', 'sibling', {
    canOrder: true,
    takes: ['sister', 'brother'],
  }),
  entry('son', 'son', { canOrder: true }),
  entry('daughter', 'daughter', { canOrder: true }),
  entry('child', 'child', { canOrder: true, takes: ['son', 'daughter'] }),
  entry('partner', 'partner'),
  entry('spouse', 'spouse'),
  entry('grandmother', 'grandmother'),
  entry('grandfather', 'grandfather'),
  entry('grandparent', 'grandparent', {
    takes: ['grandmother', 'grandfather'],
  }),
  entry('grandchild', 'grandchild'),
  entry('aunt', 'aunt'),
  entry('uncle', 'uncle'),
  entry('cousin', 'cousin'),
  entry('niece', 'niece'),
  entry('nephew', 'nephew'),
  entry('motherInLaw', 'mother-in-law', { spoken: 'mother in law' }),
  entry('fatherInLaw', 'father-in-law', { spoken: 'father in law' }),
  entry('parentInLaw', 'parent-in-law', {
    spoken: 'parent in law',
    takes: ['motherInLaw', 'fatherInLaw'],
  }),
  entry('sisterInLaw', 'sister-in-law', { spoken: 'sister in law' }),
  entry('brotherInLaw', 'brother-in-law', { spoken: 'brother in law' }),
  entry('siblingInLaw', 'sibling-in-law', {
    spoken: 'sibling in law',
    takes: ['sisterInLaw', 'brotherInLaw'],
  }),
  entry('sonInLaw', 'son-in-law', { spoken: 'son in law' }),
  entry('daughterInLaw', 'daughter-in-law', { spoken: 'daughter in law' }),
  entry('childInLaw', 'child-in-law', {
    spoken: 'child in law',
    takes: ['sonInLaw', 'daughterInLaw'],
  }),
  entry('stepmother', 'stepmother', { spoken: 'step mother' }),
  entry('stepfather', 'stepfather', { spoken: 'step father' }),
  entry('stepparent', 'stepparent', {
    spoken: 'step parent',
    takes: ['stepmother', 'stepfather'],
  }),
  entry('stepsister', 'stepsister', { spoken: 'step sister', canOrder: true }),
  entry('stepbrother', 'stepbrother', {
    spoken: 'step brother',
    canOrder: true,
  }),
  entry('stepsibling', 'stepsibling', {
    spoken: 'step sibling',
    canOrder: true,
    takes: ['stepsister', 'stepbrother'],
  }),
  entry('stepson', 'stepson', { spoken: 'step son', canOrder: true }),
  entry('stepdaughter', 'stepdaughter', {
    spoken: 'step daughter',
    canOrder: true,
  }),
  entry('stepchild', 'stepchild', {
    spoken: 'step child',
    canOrder: true,
    takes: ['stepson', 'stepdaughter'],
  }),
];

export const KIN_ORDER_WORDS: Record<KinOrder, string> = {
  older: 'older',
  younger: 'younger',
  oldest: 'oldest',
  youngest: 'youngest',
  twin: 'twin',
};
