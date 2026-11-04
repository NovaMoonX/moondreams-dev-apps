/** Paid marks share the plan document, so two at once would contend and one would stall in retries; they run one after another. */
let paidWrites: Promise<unknown> = Promise.resolve();
export const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
  const next = paidWrites.then(task, task);
  paidWrites = next.catch(() => undefined);
  return next;
};
