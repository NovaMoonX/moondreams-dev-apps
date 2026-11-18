/** The kinds of private detail a fact is judged against; the prompt lists them for the model's `isSensitive` flag. */
export const SENSITIVE_CATEGORIES = [
  'health',
  'religion',
  'sexuality',
  'politics',
  'money troubles',
] as const;

/** A sensitive fact is kept only when the person said it outright and it is about themself alone; any other fact is kept. */
export const shouldKeepSensitive = (input: {
  isSensitive: boolean;
  provenance: 'personSaid' | 'nomosInferred';
  subjectWhoIds: string[];
  selfWhoId: string | null;
}) =>
  !input.isSensitive ||
  (input.provenance === 'personSaid' &&
    input.selfWhoId !== null &&
    input.subjectWhoIds.length === 1 &&
    input.subjectWhoIds[0] === input.selfWhoId);
